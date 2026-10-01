import argparse
from pathlib import Path

from .engine import Engine


def main():
    parser = argparse.ArgumentParser(description="Install or update the independent upstream engine")
    parser.add_argument("--version")
    parser.add_argument("--import-from", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    engine = Engine(root / ".runtime")
    source = args.import_from or root.parent / "Volume"
    engine.import_existing(source)
    try:
        engine.install(args.version)
        print(f"Engine {engine.config['engine_version']} installed and API verified.")
    finally:
        engine.close()


if __name__ == "__main__":
    main()
