import json
import os
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path

from .engine import EngineError
from .cookie_worker import login_cookies


class BrowserCookie:
    ACTIVE = {'starting', 'waiting', 'saving'}

    def __init__(self, runtime, save):
        self.runtime = runtime
        self.save = save
        self.lock = threading.RLock()
        self.state = {'state': 'idle', 'message': ''}
        self.cancel_event = threading.Event()
        self.thread = None
        self.closed = False

    def status(self):
        with self.lock:
            return dict(self.state)

    def active(self):
        return self.status()['state'] in self.ACTIVE

    def set_state(self, state, message, **extra):
        with self.lock:
            self.state = dict(state=state, message=message, **extra)

    def start(self, browser, mode):
        with self.lock:
            if self.closed:
                raise EngineError('应用已关闭，请重新启动')
            if self.active() or (self.thread and self.thread.is_alive()):
                raise EngineError('正在获取 Cookie，请完成或取消后再试')
            if browser not in {'edge', 'chrome', 'firefox'} or mode not in {'existing', 'login'}:
                raise ValueError('浏览器或读取方式不支持')
            if mode == 'login' and browser == 'firefox':
                raise ValueError('登录窗口请选择 Edge 或 Chrome')
            self.cancel_event = threading.Event()
            self.set_state('starting', '正在读取浏览器 Cookie' if mode == 'existing' else '正在打开抖音登录窗口')
            self.thread = threading.Thread(target=self.run, args=(browser, mode), daemon=True, name='cookie-capture')
            self.thread.start()
            return self.status()

    def run(self, browser, mode):
        directory = self.runtime / 'cookie-capture' / uuid.uuid4().hex
        directory.mkdir(parents=True)
        result = directory / 'result.json'
        process = None
        try:
            profile = self.runtime / 'login-browser' / browser
            process = subprocess.Popen(
                [sys.executable, '-m', 'backend.cookie_worker', '--browser', browser, '--mode', mode,
                 '--directory', str(directory.resolve()), '--profile', str(profile.resolve())],
                cwd=Path(__file__).resolve().parent.parent, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
            )
            deadline = time.monotonic() + (680 if mode == 'login' else 45)
            while process.poll() is None:
                if self.cancel_event.is_set():
                    (directory / 'cancel').touch()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.terminate()
                    self.set_state('cancelled', '已取消获取 Cookie')
                    return
                if time.monotonic() > deadline:
                    process.terminate()
                    self.set_state('error', '读取超时，请使用登录窗口重试')
                    return
                status = directory / 'status.json'
                if status.exists():
                    data = json.loads(status.read_text(encoding='utf-8'))
                    if data.get('state') == 'waiting':
                        self.set_state('waiting', data['message'])
                self.cancel_event.wait(0.5)
            if self.cancel_event.is_set() or self.closed:
                self.set_state('cancelled', '已取消获取 Cookie')
                return
            status = json.loads((directory / 'status.json').read_text(encoding='utf-8'))
            if status['state'] != 'captured':
                self.set_state(status['state'], status['message'])
                return
            values = json.loads(result.read_text(encoding='utf-8'))['cookie']
            # Revalidate private worker output before replacing existing settings.
            login_cookies([dict(domain='douyin.com', name=k, value=v) for k, v in values.items()])
            self.set_state('saving', '正在保存 Cookie 并更新下载引擎')
            self.save(values)
            self.set_state('success', '已读取并保存抖音登录 Cookie', browser=browser, cookie_count=len(values))
        except EngineError as exc:
            self.set_state('error', str(exc))
        except Exception:
            self.set_state('error', '获取 Cookie 失败，原配置已保留。请使用登录窗口重试')
        finally:
            if process and process.poll() is None:
                process.terminate()
                process.wait(timeout=5)
            result.unlink(missing_ok=True)
            for path in directory.iterdir():
                if path.is_file():
                    path.unlink(missing_ok=True)
            directory.rmdir()

    def cancel(self):
        if self.status()['state'] == 'saving':
            raise EngineError('正在保存 Cookie，请稍等')
        self.cancel_event.set()
        return self.status()

    def close(self):
        self.closed = True
        self.cancel_event.set()
        if self.thread:
            self.thread.join(timeout=8)
