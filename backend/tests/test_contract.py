"""The API contract (docs/openapi.json) must match the backend, so the frontend team always knows
when an endpoint or schema moved. The backend is still evolving: changing it is fine, just
regenerate the snapshot in the same commit and mention it in the context file."""

import json
from pathlib import Path

from app.main import app

SNAPSHOT = Path(__file__).resolve().parents[2] / "docs" / "openapi.json"


def test_openapi_snapshot_is_current():
    assert SNAPSHOT.exists(), "run: python scripts/openapi_snapshot.py (with the backend venv)"
    committed = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    live = app.openapi()
    changed = sorted(set(live["paths"]) ^ set(committed["paths"]))
    assert live == committed, (
        "API contract changed. Regenerate docs/openapi.json with "
        "`backend/.venv/Scripts/python scripts/openapi_snapshot.py` and tell the frontend team. "
        f"Paths added/removed: {changed or 'none (a schema or parameter changed)'}"
    )
