"""One command for the demo: API on :8000 + web app on :5173. Ctrl+C stops both.

    python scripts/dev.py           # installs dependencies on first run
    python scripts/dev.py --reset   # also wipes provider listings, feedback and demand log
"""
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND, FRONTEND = ROOT / "backend", ROOT / "frontend"
WINDOWS = os.name == "nt"
VENV_PY = BACKEND / ".venv" / ("Scripts/python.exe" if WINDOWS else "bin/python")
NPM = "npm.cmd" if WINDOWS else "npm"


def stop(p: subprocess.Popen) -> None:
    if WINDOWS:  # npm spawns vite as a child; kill the whole tree
        subprocess.run(["taskkill", "/T", "/F", "/PID", str(p.pid)], capture_output=True)
    else:
        p.terminate()


if not VENV_PY.exists():
    subprocess.run([sys.executable, "-m", "venv", ".venv"], cwd=BACKEND, check=True)
    subprocess.run([str(VENV_PY), "-m", "pip", "install", "-q", "-e", ".[dev]"], cwd=BACKEND,
                   check=True)
if not (FRONTEND / "node_modules").exists():
    subprocess.run([NPM, "install"], cwd=FRONTEND, check=True)
if "--reset" in sys.argv:
    (BACKEND / "data" / "local.db").unlink(missing_ok=True)

procs = [
    subprocess.Popen([str(VENV_PY), "-m", "uvicorn", "app.main:app", "--port", "8000"],
                     cwd=BACKEND),
    subprocess.Popen([NPM, "run", "dev"], cwd=FRONTEND),
]
print("\n  Local & Experiences -> http://localhost:5173   (API docs: http://localhost:8000/docs)"
      "\n  Ctrl+C to stop.\n", flush=True)
try:
    while all(p.poll() is None for p in procs):
        time.sleep(0.5)
except KeyboardInterrupt:
    pass
finally:
    for p in procs:
        stop(p)
