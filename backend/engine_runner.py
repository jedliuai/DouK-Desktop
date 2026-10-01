"""Start an unmodified upstream engine on loopback using its public API class.

This small adapter is the only code aware of upstream Python entry points.
Run with the upstream version's own virtual environment, never the bridge's.
"""

import argparse
import asyncio
import sys
from pathlib import Path


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", required=True)
    parser.add_argument("--volume", required=True)
    parser.add_argument("--port", required=True, type=int)
    args = parser.parse_args()
    sys.path.insert(0, args.engine)
    volume = Path(args.volume).resolve()
    volume.mkdir(parents=True, exist_ok=True)
    import src.custom as custom
    import src.custom.internal as internal
    custom.VOLUME = internal.VOLUME = volume
    from src.application import TikTokDownloader
    from src.application.main_server import APIServer
    async with TikTokDownloader() as downloader:
        downloader.project_info()
        downloader.check_config()
        await downloader.check_settings(False)
        await APIServer(downloader.parameter, downloader.database).run_server("127.0.0.1", args.port)


if __name__ == "__main__":
    asyncio.run(main())
