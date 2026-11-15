#!/usr/bin/env python3
"""Bundle OpenDTA (MIT) for Pyodide.

Copies every Python module of an OpenDTA checkout at the pinned commit into one
JSON bundle, opendta.json, which installOpenDTA() writes into Pyodide's file
system. Left out, because they need a desktop or a network: the Qt interface
(gui/), the updater, the command-line entry points, the help files and the ICD
code tables.

    python3 -I scripts/bundle-opendta.py /path/to/opendta
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

PIN = "29a3b28"
SOURCE = "https://github.com/yaskepalhares/opendta"
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "opendta.json"
SKIP_DIRS = {"gui", "help", "__pycache__"}
SKIP_FILES = {"updater.py", "cli.py", "__main__.py"}


def main() -> int:
    checkout = Path(sys.argv[1]).resolve()
    head = subprocess.run(["git", "-C", str(checkout), "rev-parse", "--short=7", "HEAD"],
                          capture_output=True, text=True, check=True).stdout.strip()
    if head != PIN:
        print(f"OpenDTA checkout is at {head}; check out {PIN} first", file=sys.stderr)
        return 1
    src = checkout / "src"
    files: dict[str, str] = {}
    for path in sorted((src / "opendta").rglob("*.py")):
        rel = path.relative_to(src)
        if SKIP_DIRS.intersection(rel.parts[1:-1]) or (len(rel.parts) == 2 and rel.name in SKIP_FILES):
            continue
        files[rel.as_posix()] = path.read_text()
    bundle = {
        "source": SOURCE,
        "commit": PIN,
        "licence": (checkout / "LICENSE").read_text(),
        "patched": [],
        "files": files,
    }
    OUT.write_text(json.dumps(bundle, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
    lines = sum(t.count("\n") for t in files.values())
    print(f"{OUT.name}: {len(files)} modules, {lines} lines, {OUT.stat().st_size} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
