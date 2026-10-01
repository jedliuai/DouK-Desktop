import threading
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.engine import EngineError
from backend.links import extract_links, identify
from backend.service import DesktopService, DownloadCancelled
from backend.store import JobStore


def test_pasted_share_and_jingxuan_keep_the_same_id():
    text = "这是分享：https://www.douyin.com/jingxuan/search/柱子哥?aid=abc\\&modal_id=7691390692584672538\\&type=general。"
    links = extract_links(text)
    assert len(links) == 1
    assert identify(links[0]) == ("douyin", "7691390692584672538", "https://www.douyin.com/video/7691390692584672538")


@pytest.mark.parametrize("url", ["http://127.0.0.1/video/123", "https://douyin.com.evil.test/video/123", "https://www.douyin.com:80/video/123", "https://name:password@douyin.com/video/123"])
def test_links_reject_non_platform_hosts_and_credentials(url):
    with pytest.raises(ValueError):
        extract_links(url)


def test_interrupted_jobs_remain_retryable_after_restart(tmp_path):
    store = JobStore(tmp_path / "jobs.db")
    store.put({"id": "one", "status": "downloading", "speed": 123})
    store.close()
    reopened = JobStore(tmp_path / "jobs.db")
    assert reopened.get("one")["status"] == "failed"
    assert reopened.get("one")["speed"] == 0
    reopened.close()


@pytest.fixture
def service(tmp_path):
    svc = DesktopService(tmp_path / "app" / ".runtime")
    svc.engine.config["download_dir"] = str(tmp_path / "videos")
    svc.engine.status = "ready"
    yield svc
    svc.close()


def test_cancel_retry_queue_uses_separate_events(service):
    job = service.add_jobs(["https://www.douyin.com/video/7691390692584672538"])[0]
    first_id, first_event = service.queue.get_nowait()
    service.cancel(first_id)
    service.retry(first_id)
    retry_id, retry_event = service.queue.get_nowait()
    assert retry_id == first_id
    assert first_event.is_set()
    assert retry_event is not first_event
    assert not retry_event.is_set()


def test_cannot_retry_an_active_cancelled_task(service):
    job = service.add_jobs(["https://www.douyin.com/video/7691390692584672538"])[0]
    service.active_ids.add(job["id"])
    service.cancel(job["id"])
    with pytest.raises(EngineError, match="正在停止"):
        service.retry(job["id"])


def test_settings_and_updates_are_locked_while_queue_active(service):
    service.add_jobs(["https://www.douyin.com/video/7691390692584672538"])
    with pytest.raises(EngineError):
        service.update_settings({"download_dir": str(Path(service.engine.config["download_dir"]).parent / "new")})
    with pytest.raises(EngineError):
        service.begin_update()


def test_file_routes_only_serve_known_local_videos(service):
    path = Path(service.engine.config["download_dir"]) / "video.mp4"
    path.parent.mkdir(parents=True)
    path.write_bytes(b"test-media")
    assert service.file_path(service.file_id(path)) == path
    with pytest.raises(KeyError):
        service.file_path("../../settings.json")


def test_http_settings_hide_cookie_and_cross_site_mutations_rejected(service):
    service.start = lambda: None
    service.engine.settings = lambda: {"cookie": {"sessionid": "PRIVATE_COOKIE"}, "original_quality": True}
    with TestClient(create_app(service=service)) as client:
        response = client.get("/api/settings")
        assert response.status_code == 200
        assert response.json()["cookie_configured"] is True
        assert "PRIVATE_COOKIE" not in response.text
        assert client.post("/api/open-folder", headers={"Origin": "https://evil.test"}).status_code == 403
        assert client.get("/api/jobs", headers={"Host": "evil.test"}).status_code == 400
        assert client.get("/api/files/unknown/content").status_code == 404


def test_truncated_transfer_never_publishes_complete_file(service, monkeypatch):
    job = service.add_jobs(["https://www.douyin.com/video/7691390692584672538"])[0]
    transport = httpx.MockTransport(lambda request: httpx.Response(200, headers={"content-length": "1000", "content-type": "video/mp4"}, content=b"\x00\x00\x00\x18ftyp" + b"0" * 30))
    real_client = httpx.Client
    monkeypatch.setattr("backend.service.httpx.Client", lambda **kwargs: real_client(transport=transport, **kwargs))
    target = Path(service.engine.config["download_dir"]) / "incomplete.mp4"
    target.parent.mkdir(parents=True)
    with pytest.raises(httpx.ReadError):
        service.transfer(job["id"], "https://example.test/video", target, threading.Event(), "douyin")
    assert not target.exists()


def test_cancelled_transfer_never_publishes_complete_file(service):
    event = threading.Event()
    event.set()
    target = Path(service.engine.config["download_dir"]) / "cancelled.mp4"
    with pytest.raises(DownloadCancelled):
        service.transfer("test", "https://example.test/video", target, event, "douyin")
    assert not target.exists()


def test_engine_settings_preserve_cookie_and_rebuild_engine(service, monkeypatch):
    from backend.engine import atomic_json
    atomic_json(service.engine.volume / "settings.json", {"browser_info": {"impersonate": "chrome146"}, "cookie": {"sessionid": "preserved"}, "original_quality": True})
    calls = []
    monkeypatch.setattr(service.engine, "stop", lambda: calls.append("stop"))
    monkeypatch.setattr(service.engine, "start", lambda: calls.append("start"))
    service.engine.update_options({"original_quality": False})
    assert calls == ["stop", "start"]
    assert service.engine.settings()["browser_info"]["impersonate"] == "chrome146"
    assert service.engine.settings()["cookie"]["sessionid"] == "preserved"
    assert service.engine.settings()["original_quality"] is False


def test_failed_settings_restart_restores_previous_config(service, monkeypatch):
    from backend.engine import atomic_json
    original = {"cookie": {"sessionid": "preserved"}, "original_quality": True}
    atomic_json(service.engine.volume / "settings.json", original)
    monkeypatch.setattr(service.engine, "stop", lambda: None)
    def fail():
        raise EngineError("boot failure")
    monkeypatch.setattr(service.engine, "start", fail)
    with pytest.raises(EngineError, match="恢复原配置"):
        service.engine.update_options({"original_quality": False})
    assert service.engine.settings() == original


def test_failed_update_keeps_old_engine_and_reports_failure(service, monkeypatch):
    from types import SimpleNamespace
    engine = service.engine
    engine.config.update(engine_dir="previous-engine", engine_version="5.8")
    original = dict(engine.config)
    engine.process = SimpleNamespace(poll=lambda: None)
    def fail_install(*args, **kwargs):
        raise OSError("simulated network failure")
    monkeypatch.setattr("backend.engine.subprocess.run", fail_install)
    try:
        with pytest.raises(EngineError):
            engine.install("9.9")
        assert engine.config == original
        assert engine.status == "ready"
        assert engine.error
        assert not engine.installing
    finally:
        engine.process = None
