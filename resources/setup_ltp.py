#!/usr/bin/env python3
"""Create an isolated inference environment without changing system Python."""
import argparse
from pathlib import Path
import shutil
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--python", default="3.12", help="inference Python (default: 3.12)")
    args = parser.parse_args()
    uv = shutil.which("uv")
    if not uv:
        parser.exit(1, "Install uv first: python -m pip install uv\n")
    root = Path(__file__).resolve().parent.parent
    env = root / ".venv-ltp"
    python = env / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
    if not python.exists():
        subprocess.check_call([uv, "venv", "--python", args.python, str(env)])
    subprocess.check_call([
        uv, "pip", "install", "--python", str(python),
        "-r", str(root / "resources/requirements-ltp.txt"),
    ])
    print(f"Ready: {python}\nStart: npm start")


if __name__ == "__main__":
    main()

