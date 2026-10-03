"""Read only Douyin cookies; private results never travel through stdout or HTTP."""
import argparse
import json
import os
import time
from pathlib import Path

DOUYIN = 'https://www.douyin.com/'


def douyin_domain(domain):
    domain = domain.lower().lstrip('.')
    return domain == 'douyin.com' or domain.endswith('.douyin.com')


def login_cookies(cookies):
    values = {}
    now = time.time()
    # Prefer www cookies over root-domain cookies when names overlap.
    for cookie in sorted(cookies, key=lambda c: c.get('domain', '') == 'www.douyin.com'):
        expiry = cookie.get('expires')
        if not douyin_domain(cookie.get('domain', '')) or not cookie.get('value'):
            continue
        if expiry is not None and expiry > 0 and expiry <= now:
            continue
        values[cookie['name']] = cookie['value']
    if not values.get('odin_tt') or not (values.get('sessionid_ss') or values.get('sessionid')):
        raise ValueError('请先登录抖音账号，再读取 Cookie')
    return values


def write_json(path, data):
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    temp.replace(path)


def read_existing(browser):
    import browser_cookie3
    # Ordinary user permissions only; do not attempt volume shadow copies.
    browser_cookie3.shadowcopy = None
    reader = {'edge': browser_cookie3.edge, 'chrome': browser_cookie3.chrome, 'firefox': browser_cookie3.firefox}[browser]
    jar = reader(domain_name='douyin.com')
    return login_cookies([dict(name=c.name, value=c.value, domain=c.domain, expires=c.expires) for c in jar])


def login_browser(browser, profile, directory):
    from playwright.sync_api import sync_playwright, TimeoutError
    if browser not in {'edge', 'chrome'}:
        raise ValueError('登录窗口支持 Edge 和 Chrome，请选择其中一个')
    with sync_playwright() as playwright:
        context = playwright.chromium.launch_persistent_context(
            str(profile), channel='msedge' if browser == 'edge' else 'chrome',
            headless=False, viewport=None, args=['--start-maximized'],
        )
        try:
            page = context.pages[0] if context.pages else context.new_page()
            try:
                page.goto(DOUYIN, wait_until='domcontentloaded', timeout=45000)
            except TimeoutError:
                pass  # The visible window can still finish loading.
            write_json(directory / 'status.json', {'state': 'waiting', 'message': '请在弹出的抖音窗口登录，登录后会自动保存 Cookie'})
            deadline = time.monotonic() + 600
            while time.monotonic() < deadline:
                if (directory / 'cancel').exists() or not context.pages:
                    return None
                try:
                    values = login_cookies(context.cookies([DOUYIN, 'https://douyin.com/']))
                    return values
                except ValueError:
                    pass
                page.wait_for_timeout(1000)
            raise ValueError('等待登录已超时，请重新打开登录窗口')
        finally:
            context.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=['existing', 'login'], required=True)
    parser.add_argument('--browser', choices=['edge', 'chrome', 'firefox'], required=True)
    parser.add_argument('--directory', type=Path, required=True)
    parser.add_argument('--profile', type=Path, required=True)
    args = parser.parse_args()
    try:
        values = read_existing(args.browser) if args.mode == 'existing' else login_browser(args.browser, args.profile, args.directory)
        if values is None:
            write_json(args.directory / 'status.json', {'state': 'cancelled', 'message': '已取消获取 Cookie'})
            return
        write_json(args.directory / 'result.json', {'cookie': values})
        write_json(args.directory / 'status.json', {'state': 'captured', 'message': '已读取，正在保存 Cookie'})
    except ValueError as exc:
        # Only application-authored errors are safe to show.
        message = str(exc) if str(exc).startswith(('请先登录', '登录窗口支持', '等待登录')) else '读取失败，请使用“登录后自动获取”'
        write_json(args.directory / 'status.json', {'state': 'error', 'message': message})
    except Exception:
        message = ('无法读取该浏览器的 Cookie，可能被加密或占用。请使用“登录后自动获取”' if args.mode == 'existing'
                   else '登录窗口未能完成获取。请确认已安装所选浏览器、能打开抖音，再重试')
        write_json(args.directory / 'status.json', {'state': 'error', 'message': message})


if __name__ == '__main__':
    main()
