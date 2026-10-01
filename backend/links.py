"""Normalize platform links without depending on upstream UI/menu implementation."""

import re
from urllib.parse import parse_qs, urlparse

URL_PATTERN = re.compile(r'https?://[^\s<>"\x27]+')
ID_PATTERN = re.compile(r"^\d{15,22}$")


def extract_links(text: str) -> list[str]:
    urls = URL_PATTERN.findall(text.replace("\\&", "&"))
    if not urls and ID_PATTERN.fullmatch(text.strip()):
        urls = [f"https://www.douyin.com/video/{text.strip()}"]
    result = []
    for url in urls:
        url = url.rstrip(".,，。；;！!）)】]")
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        if parsed.port is not None or parsed.username or parsed.password:
            raise ValueError("链接不能包含端口或登录信息")
        if not any(host == domain or host.endswith("." + domain) for domain in ("douyin.com", "tiktok.com")):
            raise ValueError("请粘贴抖音或 TikTok 视频链接")
        if url not in result:
            result.append(url)
    if not result:
        raise ValueError("没有找到视频链接，请粘贴完整的分享内容或视频网址")
    if len(result) > 50:
        raise ValueError("每次最多添加 50 个视频链接")
    return result


def identify(url: str) -> tuple[str, str, str] | None:
    parsed = urlparse(url)
    platform = "douyin" if (parsed.hostname or "").endswith("douyin.com") else "tiktok"
    query = parse_qs(parsed.query)
    video_id = query.get("modal_id", query.get("aweme_id", [""]))[0]
    if not ID_PATTERN.fullmatch(video_id):
        match = re.search(r"/(?:video|note)/(\d{15,22})(?:/|$)", parsed.path)
        video_id = match.group(1) if match else ""
    if not video_id:
        return None
    canonical = f"https://www.douyin.com/video/{video_id}" if platform == "douyin" else url
    return platform, video_id, canonical
