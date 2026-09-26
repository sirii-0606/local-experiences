"""One command for the demo: API on :8000 + web app on :5173, opens the browser. Ctrl+C stops both.

    python scripts/dev.py              # installs dependencies on first run
    python scripts/dev.py --reset      # also wipes provider listings, feedback and demand log
    python scripts/dev.py --no-browser
"""
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND, FRONTEND = ROOT / "backend", ROOT / "frontend"
WINDOWS = os.name == "nt"
VENV_PY = BACKEND / ".venv" / ("Scripts/python.exe" if WINDOWS else "bin/python")
NPM = "npm.cmd" if WINDOWS else "npm"
APP_URL = "http://localhost:5173"


def fail(msg: str) -> None:
    sys.exit(f"\n  ERROR: {msg}\n")


def port_busy(port: int) -> bool:
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def stop(p: subprocess.Popen) -> None:
    if WINDOWS:  # npm spawns vite as a child; kill the whole tree
        subprocess.run(["taskkill", "/T", "/F", "/PID", str(p.pid)], capture_output=True)
    else:
        p.terminate()


def wait_until_up(url: str, seconds: int = 60) -> bool:
    for _ in range(seconds * 2):
        try:
            urllib.request.urlopen(url, timeout=1)
            return True
        except OSError:
            time.sleep(0.5)
    return False


if sys.version_info < (3, 12):
    fail(f"Python 3.12+ needed (this is {sys.version.split()[0]}). Install it from python.org.")
if not shutil.which(NPM):
    fail("Node.js 22+ (with npm) is needed. Install it from nodejs.org, then reopen the terminal.")
for port in (8000, 5173):
    if port_busy(port):
        fail(f"Port {port} is already in use. Is the app already running? Close it and retry.")

if not VENV_PY.exists():
    print("  Setting up the backend (first run only)...", flush=True)
    subprocess.run([sys.executable, "-m", "venv", ".venv"], cwd=BACKEND, check=True)
    subprocess.run([str(VENV_PY), "-m", "pip", "install", "-q", "-e", ".[dev]"], cwd=BACKEND,
                   check=True)
if not (FRONTEND / "node_modules").exists():
    print("  Setting up the web app (first run only)...", flush=True)
    subprocess.run([NPM, "install"], cwd=FRONTEND, check=True)
if "--reset" in sys.argv:
    (BACKEND / "data" / "local.db").unlink(missing_ok=True)

procs = [
    subprocess.Popen([str(VENV_PY), "-m", "uvicorn", "app.main:app", "--port", "8000"],
                     cwd=BACKEND),
    subprocess.Popen([NPM, "run", "dev"], cwd=FRONTEND),
]
try:
    if wait_until_up("http://localhost:8000/health") and wait_until_up(APP_URL):
        print(f"\n  OK - Local & Experiences is running: {APP_URL}"
              "\n    API docs: http://localhost:8000/docs | demo script: docs/demo.md"
              "\n    Press Ctrl+C to stop.\n", flush=True)
        if "--no-browser" not in sys.argv:
            webbrowser.open(APP_URL)
    else:
        print("\n  ERROR: servers did not come up within a minute; see the output above.\n")
    while all(p.poll() is None for p in procs):
        time.sleep(0.5)
except KeyboardInterrupt:
    pass
finally:
    for p in procs:
        stop(p)
