import hashlib
import queue
import re
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx

from .engine import Engine, EngineError
from .links import extract_links, identify
from .store import JobStore


def now():
    return datetime.now(timezone.utc).isoformat()


def safe_filename(value: str) -> str:
    value = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", value).strip(" .")
    return value[:90] or "视频"


class DownloadCancelled(Exception):
    pass


class DesktopService:
    def __init__(self, runtime: Path):
        self.runtime = runtime
        self.engine = Engine(runtime)
        legacy_volume = runtime.parent.parent / "Volume"
        self.engine.import_existing(legacy_volume)
        self.engine.config.setdefault("download_dir", str(Path.home() / "Downloads" / "DouK-Desktop"))
        self.engine.save()
        self.store = JobStore(runtime / "jobs.db")
        self.queue = queue.Queue()
        self.cancel_events = {}
        self.active_ids = set()
        self.media = {}
        self.control_lock = threading.RLock()
        self.closed = False
        self.worker = None
        self.boot_thread = None

    def start(self):
        self.worker = threading.Thread(target=self.work, daemon=True, name="download-queue")
        self.worker.start()
        self.boot_thread = threading.Thread(target=self.boot_engine, daemon=True, name="engine-start")
        self.boot_thread.start()

    def boot_engine(self):
        try:
            self.engine.start()
        except EngineError:
            pass

    def health(self):
        if self.engine.status == "ready" and self.engine.process and self.engine.process.poll() is not None:
            self.engine.status = "error"
            self.engine.error = "下载引擎已停止，请重新启动应用"
        return {"status": self.engine.status, "engine_version": self.engine.config.get("engine_version"), "error": self.engine.error}

    def settings(self):
        upstream = self.engine.settings()
        return {"download_dir": self.engine.config["download_dir"], "engine_dir": self.engine.config.get("engine_dir"), "cookie_configured": bool(upstream.get("cookie")), "original_quality": bool(upstream.get("original_quality", True))}

    def busy(self):
        return bool(self.active_ids) or any(job["status"] in {"queued", "parsing", "downloading"} for job in self.store.list())

    def update_settings(self, values: dict):
        with self.control_lock:
            if self.busy() or self.engine.installing or self.engine.status == "starting":
                raise EngineError("请等待下载队列和引擎更新结束后再修改设置")
            directory = values.get("download_dir")
            if directory is not None:
                if not directory.strip() or not Path(directory).is_absolute():
                    raise ValueError("请选择完整的绝对保存路径")
                path = Path(directory).expanduser().resolve()
                path.mkdir(parents=True, exist_ok=True)
                self.engine.config["download_dir"] = str(path)
                self.engine.save()
            upstream = {k: v for k, v in values.items() if k in {"cookie", "original_quality"}}
            if upstream:
                if isinstance(upstream.get("cookie"), str):
                    cookie = upstream["cookie"].strip()
                    upstream["cookie"] = dict(part.strip().split("=", 1) for part in cookie.split(";") if "=" in part)
                self.engine.update_options(upstream)
                self.media.clear()
            return self.settings()

    def preview(self, text: str):
        result = []
        ids = set()
        for url in extract_links(text):
            key = identify(url)
            if key is None:
                platform = "douyin" if "douyin.com" in (httpx.URL(url).host or "") else "tiktok"
                response = self.engine.request(f"/{platform}/share", {"text": url})
                resolved = response.get("url")
                if not resolved:
                    raise EngineError("分享链接解析失败，请改用浏览器里的完整视频链接")
                key = identify(extract_links(resolved)[0])
            if key is None:
                raise ValueError("这个链接没有视频 ID，请打开具体视频后复制链接")
            platform, video_id, canonical = key
            cache_key = (platform, video_id)
            if cache_key in ids:
                continue
            ids.add(cache_key)
            cached = self.media.get(cache_key)
            if cached and time.monotonic() - cached["cached_at"] < 300:
                result.append(cached["public"])
                continue
            response = self.engine.request(f"/{platform}/detail", {"detail_id": video_id, "source": False})
            data = response.get("data")
            item = data[0] if isinstance(data, list) and data else data
            if not isinstance(item, dict) or not item.get("downloads"):
                raise EngineError("未能获取视频，请检查 Cookie 是否过期，或视频是否仍然公开")
            if not isinstance(item["downloads"], str):
                raise ValueError("当前版本支持视频下载，这个作品是图集或实况作品")
            public = {"id": video_id, "platform": platform, "url": canonical, "title": item.get("desc") or "未命名视频", "author": item.get("nickname") or "未知作者", "cover_url": f"/api/covers/{platform}/{video_id}" if item.get("static_cover") else None, "duration": str(item.get("duration") or ""), "width": int(item.get("width") or 0), "height": int(item.get("height") or 0)}
            self.media[cache_key] = {"public": public, "download_url": item["downloads"], "cover": item.get("static_cover"), "cached_at": time.monotonic()}
            result.append(public)
        return result

    def add_jobs(self, urls: list[str]):
        with self.control_lock:
            if self.engine.installing:
                raise EngineError("引擎正在更新，完成后即可添加下载")
            if self.engine.status != "ready":
                raise EngineError("下载引擎尚未就绪，请先到设置中安装引擎")
            urls = extract_links("\n".join(urls))
            result = []
            seen = set()
            active = self.store.list()
            for url in urls:
                key = identify(url)
                canonical = key[2] if key else url
                if canonical in seen:
                    continue
                seen.add(canonical)
                existing = next((j for j in active if j["url"] == canonical and j["status"] in {"queued", "parsing", "downloading"}), None)
                if existing:
                    result.append(existing)
                    continue
                media = self.media.get(key[:2], {}).get("public", {}) if key else {}
                job = {"id": uuid.uuid4().hex, "video_id": key[1] if key else "", "platform": key[0] if key else "douyin", "url": canonical, "title": media.get("title", "等待解析视频"), "author": media.get("author", ""), "cover_url": media.get("cover_url"), "status": "queued", "progress": None, "downloaded_bytes": 0, "total_bytes": None, "speed": 0, "error": None, "filename": None, "created_at": now(), "file_url": None}
                self.store.put(job)
                self.cancel_events[job["id"]] = threading.Event()
                self.queue.put((job["id"], self.cancel_events[job["id"]]))
                active.append(job)
                result.append(job)
            return result

    def cancel(self, job_id):
        with self.control_lock:
            job = self.store.get(job_id)
            if job is None:
                raise KeyError(job_id)
            if job["status"] in {"queued", "parsing", "downloading"}:
                self.cancel_events.setdefault(job_id, threading.Event()).set()
                self.store.update(job_id, status="cancelled", speed=0)
            return self.store.get(job_id)

    def retry(self, job_id):
        with self.control_lock:
            job = self.store.get(job_id)
            if job is None:
                raise KeyError(job_id)
            if job["status"] not in {"failed", "cancelled"}:
                raise ValueError("只有失败或取消的任务可以重试")
            if job_id in self.active_ids:
                raise EngineError("任务正在停止，请稍等片刻再重试")
            if self.engine.installing or self.engine.status != "ready":
                raise EngineError("请等待下载引擎就绪后重试")
            self.cancel_events[job_id] = threading.Event()
            job = self.store.update(job_id, status="queued", error=None, progress=None, speed=0, downloaded_bytes=0)
            self.queue.put((job_id, self.cancel_events[job_id]))
            return job

    def work(self):
        while not self.closed:
            try:
                job_id, event = self.queue.get(timeout=0.5)
            except queue.Empty:
                continue
            try:
                with self.control_lock:
                    if event.is_set():
                        continue
                    self.active_ids.add(job_id)
                    job = self.store.get(job_id)
                    self.store.update(job_id, status="parsing")
                media = self.preview(job["url"])[0]
                if event.is_set():
                    raise DownloadCancelled()
                self.store.update(job_id, video_id=media["id"], platform=media["platform"], url=media["url"], title=media["title"], author=media["author"], cover_url=media["cover_url"], status="downloading")
                private = self.media[(media["platform"], media["id"])]
                filename = f'{safe_filename(media["author"])}-{safe_filename(media["title"])}-{media["id"]}.mp4'
                directory = Path(self.engine.config["download_dir"])
                directory.mkdir(parents=True, exist_ok=True)
                target = directory / filename
                # A complete prior file is a successful deduplication, not another download.
                if target.exists() and target.stat().st_size > 0:
                    size = target.stat().st_size
                else:
                    size = self.transfer(job_id, private["download_url"], target, event, media["platform"])
                if event.is_set():
                    raise DownloadCancelled()
                self.store.update(job_id, status="completed", filename=filename, file_url=f"/api/files/{self.file_id(target)}/content", downloaded_bytes=size, total_bytes=size, speed=0, progress=100, error=None)
            except DownloadCancelled:
                self.store.update(job_id, status="cancelled", speed=0)
            except Exception as exc:
                # Never put request URLs, query tokens or cookie values into the public job error.
                message = str(exc) if isinstance(exc, (EngineError, ValueError)) else "下载失败，可能是网络中断或保存路径不可写，请检查后重试"
                self.store.update(job_id, status="cancelled" if event.is_set() else "failed", error=None if event.is_set() else message, speed=0)
            finally:
                with self.control_lock:
                    self.active_ids.discard(job_id)
                self.queue.task_done()

    def transfer(self, job_id: str, url: str, target: Path, event: threading.Event, platform: str):
        # Keep incomplete data outside the file library and rename only after all bytes arrive.
        partial = self.runtime / "partials" / f"{job_id}.part"
        partial.parent.mkdir(exist_ok=True)
        headers = {"User-Agent": "Mozilla/5.0", "Referer": "https://www.douyin.com/" if platform == "douyin" else "https://www.tiktok.com/", "Accept-Encoding": "identity"}
        for attempt in range(3):
            if event.is_set():
                raise DownloadCancelled()
            downloaded = 0
            self.store.update(job_id, downloaded_bytes=0, progress=None, speed=0)
            try:
                with httpx.Client(follow_redirects=True, timeout=httpx.Timeout(30, read=20)) as client:
                    with client.stream("GET", url, headers=headers) as response:
                        response.raise_for_status()
                        length = response.headers.get("content-length")
                        total = int(length) if length and length.isdigit() else None
                        if "text/" in response.headers.get("content-type", "") or "json" in response.headers.get("content-type", ""):
                            raise ValueError("视频下载地址已失效，请重新解析链接")
                        self.store.update(job_id, total_bytes=total)
                        updated = time.monotonic()
                        last_size = 0
                        with partial.open("wb") as output:
                            for chunk in response.iter_bytes(256 * 1024):
                                if event.is_set():
                                    raise DownloadCancelled()
                                if chunk:
                                    output.write(chunk)
                                    downloaded += len(chunk)
                                tick = time.monotonic()
                                if tick - updated >= 0.2:
                                    self.store.update(job_id, downloaded_bytes=downloaded, progress=min(99.9, downloaded / total * 100) if total else None, speed=(downloaded - last_size) / (tick - updated))
                                    updated, last_size = tick, downloaded
                        if downloaded == 0 or (total is not None and downloaded != total):
                            raise httpx.ReadError("Incomplete media response")
                        with partial.open("rb") as check:
                            if b"ftyp" not in check.read(32):
                                raise ValueError("收到的文件不是有效的 MP4 视频，请重试")
                        if event.is_set():
                            raise DownloadCancelled()
                        # Move across disks too; hidden temporary destination is excluded from listing.
                        staged = target.with_suffix(".mp4.part")
                        import shutil
                        shutil.copyfile(partial, staged)
                        staged.replace(target)
                        partial.unlink(missing_ok=True)
                        return downloaded
            except httpx.HTTPError:
                if attempt == 2:
                    raise
                if event.wait(1 + attempt):
                    raise DownloadCancelled()
        raise ValueError("下载失败")

    def file_id(self, path: Path):
        return hashlib.sha256(str(path.resolve()).encode("utf-8")).hexdigest()[:24]

    def files(self):
        directory = Path(self.engine.config["download_dir"]).resolve()
        if not directory.exists():
            return []
        result = []
        for path in directory.iterdir():
            if path.is_symlink() or path.suffix.lower() != ".mp4" or not path.is_file():
                continue
            info = path.stat()
            if not info.st_size:
                continue
            file_id = self.file_id(path)
            result.append({"id": file_id, "filename": path.name, "size": info.st_size, "modified_at": datetime.fromtimestamp(info.st_mtime, timezone.utc).isoformat(), "file_url": f"/api/files/{file_id}/content"})
        return sorted(result, key=lambda f: f["modified_at"], reverse=True)

    def file_path(self, file_id: str):
        item = next((f for f in self.files() if f["id"] == file_id), None)
        if item is None:
            raise KeyError(file_id)
        return Path(self.engine.config["download_dir"]) / item["filename"]

    def begin_update(self):
        with self.control_lock:
            if self.busy():
                raise EngineError("请先完成或取消下载队列，再更新引擎")
            if self.engine.installing or self.engine.status == "starting":
                raise EngineError("引擎正在启动或更新，请稍等")
            self.engine.status = "starting"
            def update():
                try:
                    self.engine.install()
                    self.media.clear()
                except EngineError:
                    pass
            threading.Thread(target=update, daemon=True, name="engine-update").start()

    def close(self):
        self.closed = True
        for event in self.cancel_events.values():
            event.set()
        if self.worker:
            self.worker.join(timeout=25)
        if self.boot_thread:
            self.boot_thread.join(timeout=2)
        self.engine.close()
        if not self.worker or not self.worker.is_alive():
            self.store.close()
