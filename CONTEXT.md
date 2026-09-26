# Current Context

_Last updated: 2026-09-26 · latest entry: [docs/context/2026-09-26-05-m4-adapt.md](docs/context/2026-09-26-05-m4-adapt.md)_

## Where we are
- **M0–M4 are done, and the engine is complete.** `main` has M3; `feat/m4-adapt` is waiting to be merged. The repo is https://github.com/sirii-0606/local-experiences. There is no branch protection, by team choice.
- **Models + seed:** `backend/app/models.py` and `backend/data/seed/` (Jaipur: 50 experiences, 23 providers). The businesses are fictional; the monuments are real.
- **Engine:** `backend/app/engine/`
  - `feasibility.check()` handles the hard constraints (time, hours, budget, capacity, age, accessibility, indoor, distance, end point, rain) with reasons.
  - `confidence.attr_confidence()` scores each attribute from its evidence.
  - `rank.discover()` returns top-k feasible, diverse recommendations with factors, reasons, lat/lon, and an `excluded` map.
  - `itinerary.gaps/fill_gap/plan/validate` handle gap-aware planning around locked stops.
  - `adapt.replan()` handles closure, cancellation, rain, heat, delay, fatigue and budget events. It repairs only the affected stops (retime, then replace, then drop), reports locked stops as `at_risk`, and returns a diff with reasons.
- **Tests:** 33 passing, with independent feasibility and sequence validators.
- **Team:** 5 people. The work split is in `docs/roadmap.md`. Stretch items (AR, real feeds, etc.) come last, as M9.

## Next steps (in parallel)
- **M5, API + LLM (now the critical path):** a FastAPI wrapper (`/discover`, `/plan`, `/events`, `/chat`), a Claude intent parser, a rule-based fallback, and `docs/api.md`. Details are in the latest context file.
- **Traveler UI (M6)** and **Provider side (M7):** start as soon as `docs/api.md` exists.
- **Data/demo:** 10 labelled personas; tune the greedy planner's preference for short stops.

## Setup
`cd backend && python -m venv .venv && .venv/Scripts/python -m pip install -e ".[dev]" && .venv/Scripts/python -m pytest`
