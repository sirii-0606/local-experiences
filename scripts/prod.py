"""Build the frontend and run the single-port production server (API + built SPA on :8000).

    python scripts/prod.py               # builds frontend/dist, starts uvicorn on 0.0.0.0:8000
    python scripts/prod.py --build-only  # installs deps + builds frontend/dist, then exits
    python scripts/prod.py --no-build    # starts uvicorn using an existing frontend/dist
    python scripts/prod.py --reset       # wipes backend/data/local.db before starting
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND, FRONTEND = ROOT / "backend", ROOT / "frontend"
DIST = FRONTEND / "dist"
WINDOWS = os.name == "nt"
VENV_PY = BACKEND / ".venv" / ("Scripts/python.exe" if WINDOWS else "bin/python")
NPM = "npm.cmd" if WINDOWS else "npm"


def fail(msg: str) -> None:
    sys.exit(f"\n  ERROR: {msg}\n")


if sys.version_info < (3, 12):  # noqa: UP036 - friendly message when run with an older system python
    fail(f"Python 3.12+ needed (this is {sys.version.split()[0]}).")
if not shutil.which(NPM):
    fail("Node.js 22+ (with npm) is needed.")

if not VENV_PY.exists():
    print("  Setting up backend virtualenv...", flush=True)
    subprocess.run([sys.executable, "-m", "venv", ".venv"], cwd=BACKEND, check=True)
    subprocess.run([str(VENV_PY), "-m", "pip", "install", "-q", "-e", ".[dev]"], cwd=BACKEND,
                   check=True)

if "--no-build" not in sys.argv:
    if not (FRONTEND / "node_modules").exists():
        print("  Installing frontend packages...", flush=True)
        subprocess.run([NPM, "ci"], cwd=FRONTEND, check=True)
    print("  Building frontend for production...", flush=True)
    subprocess.run([NPM, "run", "build"], cwd=FRONTEND, check=True)

if not (DIST / "index.html").is_file():
    fail("frontend/dist/index.html is missing. Run without --no-build first.")

if "--build-only" in sys.argv:
    print(f"  OK - production build ready in {DIST.relative_to(ROOT)}\n", flush=True)
    sys.exit(0)

if "--reset" in sys.argv:
    (BACKEND / "data" / "local.db").unlink(missing_ok=True)

env = {**os.environ, "STATIC_DIR": str(DIST)}
host = os.environ.get("HOST", "0.0.0.0")
port = os.environ.get("PORT", "8000")
print(f"\n  Serving Local & Experiences (production) on http://{host}:{port}\n", flush=True)
sys.exit(subprocess.call(
    [str(VENV_PY), "-m", "uvicorn", "app.main:app", "--host", host, "--port", port,
     "--proxy-headers", "--forwarded-allow-ips", "*"],
    cwd=BACKEND, env=env,
))
