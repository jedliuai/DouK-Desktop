import os
import re
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .engine import EngineError
from .service import DesktopService

ROOT = Path(__file__).resolve().parent.parent


class TextInput(BaseModel):
    text: str = Field(min_length=1, max_length=30000)


class JobsInput(BaseModel):
    urls: list[str] = Field(min_length=1, max_length=50)


class SettingsInput(BaseModel):
    download_dir: str | None = None
    cookie: str | None = Field(default=None, max_length=20000)
    original_quality: bool | None = None


def create_app(runtime: Path | None = None, service: DesktopService | None = None):
    @asynccontextmanager
    async def lifespan(app):
        app.state.service = service or DesktopService(runtime or ROOT / ".runtime")
        app.state.service.start()
        yield
        import asyncio
        await asyncio.to_thread(app.state.service.close)

    app = FastAPI(title="DouK Desktop", version="0.1.0", lifespan=lifespan)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "[::1]", "testserver"])

    @app.middleware("http")
    async def local_origin(request: Request, call_next):
        if request.url.path.startswith("/api"):
            origin = request.headers.get("origin")
            allowed = {"http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:18765", "http://127.0.0.1:18765"}
            if (origin and origin not in allowed) or request.headers.get("sec-fetch-site") == "cross-site":
                return JSONResponse({"detail": "仅允许本机应用页面访问"}, status_code=403)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.exception_handler(EngineError)
    async def engine_error(request, exc):
        return JSONResponse({"detail": str(exc)}, status_code=409)

    @app.exception_handler(ValueError)
    async def value_error(request, exc):
        return JSONResponse({"detail": str(exc)}, status_code=400)

    @app.exception_handler(KeyError)
    async def key_error(request, exc):
        return JSONResponse({"detail": "任务或文件不存在"}, status_code=404)

    def get_service():
        return app.state.service

    @app.get("/api/health")
    def health():
        return {"app": "DouK-Desktop", **get_service().health()}

    @app.post("/api/shutdown")
    def shutdown():
        callback = getattr(app.state, "request_shutdown", None)
        if callback is None:
            raise HTTPException(409, "请使用 Start-DouK.cmd 启动应用后再关闭")
        callback()
        return {"ok": True}

    @app.get("/api/settings")
    def settings():
        return get_service().settings()

    @app.patch("/api/settings")
    def update_settings(values: SettingsInput):
        return get_service().update_settings(values.model_dump(exclude_none=True))

    @app.post("/api/preview")
    def preview(values: TextInput):
        return {"items": get_service().preview(values.text)}

    @app.post("/api/jobs")
    def jobs_add(values: JobsInput):
        return {"jobs": get_service().add_jobs(values.urls)}

    @app.get("/api/jobs")
    def jobs():
        return {"jobs": get_service().store.list()}

    @app.post("/api/jobs/{job_id}/cancel")
    def cancel(job_id: str):
        return {"job": get_service().cancel(job_id)}

    @app.post("/api/jobs/{job_id}/retry")
    def retry(job_id: str):
        return {"job": get_service().retry(job_id)}

    @app.get("/api/files")
    def files():
        return {"files": get_service().files()}

    @app.get("/api/files/{file_id}/content")
    def content(file_id: str):
        path = get_service().file_path(file_id)
        return FileResponse(path, media_type="video/mp4", filename=path.name)

    @app.post("/api/open-folder")
    def open_folder():
        directory = Path(get_service().engine.config["download_dir"])
        directory.mkdir(parents=True, exist_ok=True)
        if os.name == "nt":
            os.startfile(str(directory))
        else:
            raise HTTPException(400, "打开本地文件夹功能目前支持 Windows")
        return {"ok": True}

    @app.post("/api/jobs/{job_id}/open")
    def open_video(job_id: str):
        job = get_service().store.get(job_id)
        if not job or job["status"] != "completed" or not job.get("file_url"):
            raise HTTPException(404, "视频尚未完成或文件不存在")
        path = get_service().file_path(job["file_url"].split("/")[3])
        if os.name == "nt":
            os.startfile(str(path))
        else:
            raise HTTPException(400, "打开本地播放器功能目前支持 Windows")
        return {"ok": True}

    @app.get("/api/covers/{platform}/{video_id}")
    def cover(platform: str, video_id: str):
        if platform not in {"douyin", "tiktok"} or not re.fullmatch(r"\d{15,22}", video_id):
            raise HTTPException(404, "封面不存在")
        svc = get_service()
        cache = svc.runtime / "covers" / f"{platform}-{video_id}.jpg"
        if cache.is_file():
            return FileResponse(cache, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=86400"})
        private = svc.media.get((platform, video_id))
        if private and private.get("cover"):
            for _ in range(2):
                try:
                    with httpx.Client(timeout=10, follow_redirects=True) as client:
                        response = client.get(private["cover"], headers={"Referer": "https://www.douyin.com/", "User-Agent": "Mozilla/5.0"})
                        response.raise_for_status()
                        kind = response.headers.get("content-type", "image/jpeg").split(";")[0]
                        if response.content.startswith(b"\xff\xd8\xff"):
                            cache.parent.mkdir(exist_ok=True)
                            cache.write_bytes(response.content)
                            return Response(response.content, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=86400"})
                        if kind in {"image/png", "image/webp", "image/avif"}:
                            return Response(response.content, media_type=kind)
                except httpx.HTTPError:
                    continue
        placeholder = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="320" height="180" fill="#f5f2eb"/><rect x="139" y="69" width="42" height="42" rx="10" fill="#ebe6de"/><path d="m155 79 16 11-16 11Z" fill="#b85d36"/></svg>'
        return Response(placeholder, media_type="image/svg+xml", headers={"Cache-Control": "no-store"})

    @app.get("/api/engine/update")
    def check_update():
        try:
            return get_service().engine.latest()
        except httpx.HTTPError:
            raise HTTPException(502, "检查更新失败，请检查 GitHub 网络连接")

    @app.post("/api/engine/update")
    def update():
        get_service().begin_update()
        return {"started": True}

    dist = ROOT / "frontend" / "dist"
    if dist.is_dir():
        app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
    else:
        @app.get("/")
        def missing_frontend():
            return {"message": "前端尚未构建，请先运行 setup.ps1，然后打开 http://127.0.0.1:18765"}
    return app


app = create_app()
