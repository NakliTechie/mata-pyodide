#!/usr/bin/env python3
"""Bundle OpenDTA's Mata interpreter (MIT) for Pyodide.

Copies the modules Mata needs from an OpenDTA checkout at the pinned commit
into one bundle, opendta-mata.json, which installMata()
writes into Pyodide's file system. The module list comes from importing
the Mata package (and the modules it imports lazily) and reading sys.modules,
so nothing unused ships.

One patch: opendta/commands/__init__.py imports every Stata command; the
bundle replaces it with an empty package file, because Mata uses only
commands.matrix, commands.preserve and commands.registry.

    uv run --no-project --python 3.12 --with numpy==2.0.2 --with scipy \
        python -I scripts/bundle-opendta.py /path/to/opendta
"""

from __future__ import annotations

import importlib
import json
import pkgutil
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

PIN = "29a3b28"
SOURCE = "https://github.com/yaskepalhares/opendta"
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "opendta-mata.json"
STUB = '"""Stata commands (mata-pyodide ships only the modules Mata uses)."""\n'

LAZY = [
    "opendta.core.rng",
    "opendta.core.varlist",
    "opendta.core.output",
    "opendta.core.formats",
    "opendta.estimation.numerics",
    "opendta.estimation.results",
    "opendta.estimation.ml",
    "opendta.commands.matrix",
    "opendta.commands.preserve",
    "opendta.lang.words",
    "opendta.lang.lexer",
    "opendta.lang.macros",
]


def main() -> int:
    checkout = Path(sys.argv[1]).resolve()
    head = subprocess.run(["git", "-C", str(checkout), "rev-parse", "--short=7", "HEAD"],
                          capture_output=True, text=True, check=True).stdout.strip()
    if head != PIN:
        print(f"OpenDTA checkout is at {head}; check out {PIN} first", file=sys.stderr)
        return 1
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "src"
        shutil.copytree(checkout / "src", src)
        (src / "opendta" / "commands" / "__init__.py").write_text(STUB)
        sys.path.insert(0, str(src))
        import opendta.mata as mata
        for m in pkgutil.iter_modules(mata.__path__):
            importlib.import_module(f"opendta.mata.{m.name}")
        for name in LAZY:
            importlib.import_module(name)
        files: dict[str, str] = {}
        for name, mod in sorted(sys.modules.items()):
            path = getattr(mod, "__file__", None)
            if not name.startswith("opendta") or not path:
                continue
            rel = Path(path).resolve().relative_to(src.resolve()).as_posix()
            files[rel] = Path(path).read_text()
        bundle = {
            "source": SOURCE,
            "commit": PIN,
            "licence": (checkout / "LICENSE").read_text(),
            "patched": ["opendta/commands/__init__.py"],
            "files": files,
        }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(bundle, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
    lines = sum(t.count("\n") for t in files.values())
    print(f"{OUT.relative_to(ROOT)}: {len(files)} modules, {lines} lines, {OUT.stat().st_size} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
