import json
import threading
import time
from http.cookiejar import Cookie, CookieJar

import pytest
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.browser_cookie import BrowserCookie
from backend.cookie_worker import login_cookies, read_existing, write_json
from backend.engine import EngineError
from backend.service import DesktopService


def test_only_unexpired_douyin_login_cookies_are_kept():
    records = [
        dict(domain='.douyin.com', name='odin_tt', value='douyin-device'),
        dict(domain='.douyin.com', name='sessionid', value='root-session'),
        dict(domain='www.douyin.com', name='sessionid', value='www-session'),
        dict(domain='douyin.com.evil.test', name='sessionid', value='unrelated'),
        dict(domain='other.test', name='private', value='unrelated'),
        dict(domain='.douyin.com', name='expired', value='old', expires=time.time()-10),
    ]
    assert login_cookies(records) == {'odin_tt': 'douyin-device', 'sessionid': 'www-session'}


@pytest.mark.parametrize('records', [[], [dict(domain='.douyin.com', name='odin_tt', value='device')],
    [dict(domain='.douyin.com', name='sessionid', value='old', expires=time.time()-10)]])
def test_unsigned_or_expired_sessions_do_not_replace_cookie(records):
    with pytest.raises(ValueError, match='先登录'):
        login_cookies(records)


def test_browser_reader_requests_only_douyin_and_disables_shadowcopy(monkeypatch):
    import browser_cookie3
    jar = CookieJar()
    for name in ['odin_tt', 'sessionid']:
        jar.set_cookie(Cookie(0, name, 'private', None, False, '.douyin.com', True, True,
                             '/', True, True, None, True, None, None, {}))
    calls = []
    def reader(**kwargs):
        calls.append(kwargs)
        return jar
    monkeypatch.setattr(browser_cookie3, 'edge', reader)
    monkeypatch.setattr(browser_cookie3, 'shadowcopy', object())
    assert len(read_existing('edge')) == 2
    assert calls == [{'domain_name': 'douyin.com'}]
    assert browser_cookie3.shadowcopy is None


def test_captured_cookie_saved_privately_and_transient_file_removed(tmp_path, monkeypatch):
    saved = []
    class CompletedWorker:
        def __init__(self, args, **kwargs):
            directory = tmp_path / 'cookie-capture' / args[args.index('--directory')+1].replace('\\', '/').split('/')[-1]
            write_json(directory / 'result.json', {'cookie': {'sessionid':'SECRET', 'odin_tt':'DEVICE'}})
            write_json(directory / 'status.json', {'state':'captured', 'message':'已读取'})
        def poll(self): return 0
    monkeypatch.setattr('backend.browser_cookie.subprocess.Popen', CompletedWorker)
    capture = BrowserCookie(tmp_path, lambda cookie: saved.append(cookie))
    capture.start('edge', 'existing')
    capture.thread.join(timeout=3)
    assert saved == [{'sessionid':'SECRET', 'odin_tt':'DEVICE'}]
    assert capture.status()['state'] == 'success'
    assert 'SECRET' not in json.dumps(capture.status())
    assert not list((tmp_path / 'cookie-capture').rglob('result.json'))
    capture.close()


def test_capture_failure_preserves_config(tmp_path, monkeypatch):
    saved = []
    class FailedWorker:
        def __init__(self, args, **kwargs):
            from pathlib import Path
            directory = Path(args[args.index('--directory')+1])
            write_json(directory / 'status.json', {'state':'error', 'message':'无法读取'})
        def poll(self): return 0
    monkeypatch.setattr('backend.browser_cookie.subprocess.Popen', FailedWorker)
    capture = BrowserCookie(tmp_path, saved.append)
    capture.start('chrome', 'existing')
    capture.thread.join(timeout=3)
    assert capture.status() == {'state':'error', 'message':'无法读取'}
    assert saved == []
    capture.close()


def test_cancellation_and_duplicate_capture(tmp_path, monkeypatch):
    started = threading.Event()
    saved = []
    class WaitingWorker:
        def __init__(self, *args, **kwargs):
            self.done = False
            started.set()
        def poll(self): return 0 if self.done else None
        def wait(self, timeout): self.done = True; return 0
        def terminate(self): self.done = True
    monkeypatch.setattr('backend.browser_cookie.subprocess.Popen', WaitingWorker)
    capture = BrowserCookie(tmp_path, saved.append)
    capture.start('edge', 'login')
    assert started.wait(3)
    with pytest.raises(EngineError, match='正在获取'):
        capture.start('edge', 'login')
    capture.cancel()
    capture.thread.join(timeout=3)
    assert capture.status()['state'] == 'cancelled'
    assert saved == []
    capture.close()


def test_cookie_api_validates_inputs_blocks_cross_site_and_hides_secrets(tmp_path, monkeypatch):
    service = DesktopService(tmp_path / '.runtime')
    service.start = lambda: None
    service.engine.status = 'ready'
    calls = []
    monkeypatch.setattr(service.browser_cookie, 'start', lambda browser, mode: calls.append((browser,mode)) or {'state':'starting','message':'读取中'})
    with TestClient(create_app(service=service)) as client:
        assert client.post('/api/cookie/browser', json={'browser':'invalid'}).status_code == 422
        assert client.post('/api/cookie/browser', json={'mode':'invalid'}).status_code == 422
        for endpoint in ['/api/cookie/browser', '/api/cookie/browser/cancel']:
            assert client.post(endpoint, json={}, headers={'Origin':'https://evil.test'}).status_code == 403
        assert client.post('/api/cookie/browser', json={'browser':'edge','mode':'login'}).json()['state'] == 'starting'
        assert calls == [('edge','login')]
        service.engine.settings = lambda: {'cookie':{'sessionid':'SECRET'}}
        assert 'SECRET' not in client.get('/api/cookie/browser').text
        service.add_jobs(['https://www.douyin.com/video/7691390692584672538'])
        assert client.post('/api/cookie/browser', json={}).status_code == 409


def test_capture_prevents_competing_settings_downloads_and_updates(tmp_path):
    service = DesktopService(tmp_path / '.runtime')
    service.engine.status = 'ready'
    service.browser_cookie.set_state('waiting', '等待登录')
    try:
        with pytest.raises(EngineError, match='Cookie'):
            service.update_settings({'original_quality': False})
        with pytest.raises(EngineError, match='Cookie'):
            service.add_jobs(['https://www.douyin.com/video/7691390692584672538'])
        with pytest.raises(EngineError, match='Cookie'):
            service.retry('any-job')
        with pytest.raises(EngineError, match='Cookie'):
            service.begin_update()
    finally:
        service.close()
