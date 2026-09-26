"""Write docs/openapi.json from the live FastAPI app, the API contract the frontend relies on.

Run after any backend change to endpoints or schemas (tests/test_contract.py fails until you do):
    backend/.venv/Scripts/python scripts/openapi_snapshot.py      (.venv/bin/python on macOS/Linux)
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.main import app  # noqa: E402

out = ROOT / "docs" / "openapi.json"
out.write_text(json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"wrote {out.relative_to(ROOT)} ({len(app.openapi()['paths'])} paths)")
