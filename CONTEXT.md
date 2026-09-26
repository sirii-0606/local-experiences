# Current Context

_Last updated: 2026-09-26 · latest entry: [docs/context/2026-09-26-06-m5-api.md](docs/context/2026-09-26-06-m5-api.md)_

## Where we are
- **M0–M5 are done.** `main` has M4; `feat/m5-api` is waiting to be merged. The repo is https://github.com/sirii-0606/local-experiences. There is no branch protection, by team choice.
- **Models + seed:** `backend/app/models.py` and `backend/data/seed/` (Jaipur: 50 experiences, 23 providers). The businesses are fictional; the monuments are real.
- **Engine** (`backend/app/engine/`):
  - `feasibility.check()` handles the hard constraints, with reasons.
  - `rank.discover()` ranks and explains.
  - `itinerary.plan/validate` builds gap-aware plans around locked stops.
  - `adapt.replan()` handles localized replanning.
- **API** (`backend/app/main.py`) is stateless FastAPI: `/chat`, `/discover`, `/plan`, `/events`, `/catalog`, `/health`. **The contract is `docs/api.md`**, and the live schema is at `/docs`.
- **Intent** (`backend/app/intent.py`): Claude (`claude-opus-5`, structured output, refusal fallback) with an offline rule parser as fallback. It's chosen by `INTENT_PARSER`. The Claude path is verified offline but hasn't been run against the real API (no credentials here).
- **Tests:** 48 passing, 1 skipped (live LLM). CI runs ruff and pytest.
- **Team:** 5 people. The work split is in `docs/roadmap.md`. Stretch items come last, as M9.

## Next steps (in parallel)
- **M6, traveler UI:** Vite + React + Leaflet against `docs/api.md`, with chat, cards, map, timeline and a disruption demo panel, plus the frontend CI job.
- **M7, provider side:** SQLite overlay on the seed, LLM onboarding (free text → `Experience`), and demand insights.
- **Data/demo:** 10 labelled personas, planner tuning, and one live LLM run (`RUN_LLM_TESTS=1`).

## Setup
`cd backend && python -m venv .venv && .venv/Scripts/python -m pip install -e ".[dev]" && .venv/Scripts/python -m pytest`
Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`, then open http://localhost:8000/docs
