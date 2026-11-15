"""Rebuild approved illustrated wall tiles through the shared Node/Sharp pipeline."""
from pathlib import Path
import shutil, subprocess
root = Path(__file__).resolve().parents[1]
node = shutil.which("node")
if not node:
    node = str(Path.home()/".cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe")
subprocess.run([node, str(root/"scripts/build-wall-tiles.cjs")], cwd=root, check=True)
