import json
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path

import httpx

REPOSITORY = "https://github.com/JoeanAmier/TikTokDownloader"
RELEASE_API = "https://api.github.com/repos/JoeanAmier/TikTokDownloader/releases/latest"
NO_WINDOW = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0


class EngineError(RuntimeError):
    pass


def atomic_json(path: Path, value: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(path)


class Engine:
    def __init__(self, runtime: Path):
        self.runtime = runtime.resolve()
        self.runtime.mkdir(parents=True, exist_ok=True)
        self.volume = self.runtime / "engine-data"
        self.volume.mkdir(exist_ok=True)
        self.config_path = self.runtime / "config.json"
        self.config = json.loads(self.config_path.read_text(encoding="utf-8")) if self.config_path.exists() else {}
        self.status = "missing"
        self.error = None
        self.process = None
        self.log = None
        self.port = None
        self.lock = threading.RLock()
        self.api_lock = threading.RLock()
        self.installing = False
        self.closed = False
        self.api = None

    def save(self):
        atomic_json(self.config_path, self.config)

    def python(self, engine_dir: Path):
        return engine_dir / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")

    def latest(self):
        with httpx.Client(timeout=30, follow_redirects=True) as client:
            response = client.get(RELEASE_API, headers={"User-Agent": "DouK-Desktop/0.1"})
            response.raise_for_status()
            data = response.json()
        version = data["tag_name"]
        current = self.config.get("engine_version")
        return {"current": current, "latest": version, "available": current != version, "release_url": data["html_url"]}

    def install(self, version: str | None = None):
        with self.lock:
            if self.installing:
                raise EngineError("引擎正在更新，请稍等")
            self.installing = True
            self.status = "starting"
            self.error = None
        previous = dict(self.config)
        try:
            version = version or self.latest()["latest"]
            if not version or any(c not in "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ._-" for c in version):
                raise EngineError("上游版本号不合法")
            engine_dir = self.runtime / "engines" / version
            engine_dir.parent.mkdir(exist_ok=True)
            log_path = self.runtime / "engine-install.log"
            with log_path.open("w", encoding="utf-8") as log:
                if not (engine_dir / "main.py").exists():
                    stage = self.runtime / "engine-staging" / f"{version}-{uuid.uuid4().hex}"
                    stage.parent.mkdir(exist_ok=True)
                    subprocess.run(["git", "clone", "--depth", "1", "--branch", version, REPOSITORY + ".git", str(stage)], check=True, stdout=log, stderr=log, timeout=240, creationflags=NO_WINDOW)
                    if engine_dir.exists():
                        failed = stage.parent / f"incomplete-{version}-{uuid.uuid4().hex}"
                        if not engine_dir.resolve().is_relative_to(self.runtime) or not failed.resolve().is_relative_to(self.runtime):
                            raise EngineError("引擎目录不在本地运行目录内")
                        engine_dir.rename(failed)
                    stage.rename(engine_dir)
                if not self.python(engine_dir).exists():
                    subprocess.run([sys.executable, "-m", "venv", str(engine_dir / ".venv")], check=True, stdout=log, stderr=log, timeout=120, creationflags=NO_WINDOW)
                subprocess.run([str(self.python(engine_dir)), "-m", "pip", "install", "--disable-pip-version-check", "-r", str(engine_dir / "requirements.txt")], check=True, stdout=log, stderr=log, timeout=600, creationflags=NO_WINDOW)
            with self.api_lock:
                self.stop()
                self.config.update(engine_dir=str(engine_dir), engine_version=version)
                self.start()
                self.save()
        except Exception as exc:
            self.config = previous
            failure = "引擎安装或启动失败。检查网络和 .runtime/engine-install.log 后重试"
            self.status = "error"
            if previous.get("engine_dir"):
                try:
                    if self.process and self.process.poll() is None:
                        self.status = "ready"
                    else:
                        self.start()
                except Exception:
                    pass
            self.error = failure
            raise EngineError(failure) from exc
        finally:
            self.installing = False

    def start(self):
        if self.closed:
            return
        directory = Path(self.config.get("engine_dir", ""))
        if not (directory / "main.py").exists() or not self.python(directory).exists():
            self.status = "missing"
            return
        if self.process and self.process.poll() is None:
            return
        self.status = "starting"
        self.error = None
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            self.port = sock.getsockname()[1]
        self.log = (self.runtime / "engine.log").open("w", encoding="utf-8")
        env = os.environ.copy()
        env.update(PYTHONUTF8="1", PYTHONUNBUFFERED="1")
        command = [str(self.python(directory)), str(Path(__file__).with_name("engine_runner.py")), "--engine", str(directory), "--volume", str(self.volume), "--port", str(self.port)]
        self.process = subprocess.Popen(command, cwd=directory, env=env, stdout=self.log, stderr=self.log, stdin=subprocess.DEVNULL, creationflags=NO_WINDOW)
        self.api = httpx.Client(base_url=f"http://127.0.0.1:{self.port}", timeout=120, trust_env=False)
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline and not self.closed:
            if self.process.poll() is not None:
                break
            try:
                response = self.api.get("/openapi.json", timeout=1)
                response.raise_for_status()
                if response.json().get("info", {}).get("title") == "DouK-Downloader":
                    self.status = "ready"
                    return
            except (httpx.HTTPError, ValueError):
                pass
            time.sleep(0.5)
        self.stop()
        self.status = "error"
        self.error = "下载引擎启动失败，请查看本地 .runtime/engine.log"
        raise EngineError(self.error)

    def stop(self):
        if self.api:
            self.api.close()
            self.api = None
        if self.process and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)
        self.process = None
        if self.log:
            self.log.close()
            self.log = None

    def close(self):
        self.closed = True
        self.stop()

    def request(self, path: str, payload: dict | None = None):
        with self.api_lock:
            if self.status != "ready" or not self.api:
                raise EngineError(self.error or "下载引擎尚未就绪，请在设置中安装或等待启动")
            try:
                response = self.api.get(path) if payload is None else self.api.post(path, json=payload)
                response.raise_for_status()
                return response.json()
            except httpx.HTTPError as exc:
                raise EngineError("下载引擎请求失败，请检查 Cookie、网络或引擎运行状态") from exc

    def settings(self):
        file = self.volume / "settings.json"
        return json.loads(file.read_text(encoding="utf-8-sig")) if file.exists() else {}

    def update_options(self, changes: dict):
        # Upstream 5.8's settings API omits fields required by its own setter and
        # changes only in-memory objects. Write the private config atomically,
        # then restart so clients/extractors also receive the new quality/cookie.
        with self.api_lock:
            saved = self.settings()
            updated = saved | changes
            atomic_json(self.volume / "settings.json", updated)
            self.stop()
            try:
                self.start()
            except Exception:
                atomic_json(self.volume / "settings.json", saved)
                try:
                    self.start()
                except Exception:
                    pass
                raise EngineError("设置未能生效，已恢复原配置，请检查引擎日志")

    def import_existing(self, source: Path):
        """One-time import of local settings, never into tracked source files."""
        source = source.resolve()
        if (self.volume / "settings.json").exists():
            return
        if (source / "settings.json").exists():
            settings = json.loads((source / "settings.json").read_text(encoding="utf-8-sig"))
            settings.update(download=False, storage_format="", run_command="", original_quality=True)
            atomic_json(self.volume / "settings.json", settings)
            if (source / "DouK-Downloader.db").exists():
                shutil.copy2(source / "DouK-Downloader.db", self.volume / "DouK-Downloader.db")
            download_dir = Path(settings.get("root") or source) / settings.get("folder_name", "Download")
            self.config.setdefault("download_dir", str(download_dir))
            self.save()
