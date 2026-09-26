# Current Context

_Last updated: 2026-09-26 · latest entry: [docs/context/2026-09-26-04-m3-itinerary.md](docs/context/2026-09-26-04-m3-itinerary.md)_

## Where we are
- **M0–M3 are done.** The repo is https://github.com/sirii-0606/local-experiences. There is no branch protection, by team choice.
- **Models + seed:** `backend/app/models.py` and `backend/data/seed/` (Jaipur: 50 experiences, 23 providers). The businesses are fictional; the monuments are real.
- **Engine:** `backend/app/engine/`
  - `feasibility.check()` handles the hard constraints (now including reaching an end point) and gives reasons for exclusions.
  - `confidence.attr_confidence()` scores each attribute from its evidence.
  - `rank.discover()` returns top-k feasible, diverse recommendations with factors, reasons, lat/lon, and an `excluded` map.
  - `itinerary.gaps/fill_gap/plan/validate` find gaps, fill them, build a plan around locked stops, and check whole-sequence feasibility.
- **Tests:** 24 passing, with independent feasibility and sequence validators.
- **Branch stack:** `main` (M0 only) ← `feat/m1-models-seed` ← `feat/m2-engine` ← `feat/m3-itinerary`. **No PRs have been opened yet.** Merge them in order.
- **Team:** 5 people. The work split is in `docs/roadmap.md`. Stretch items (AR, real feeds, etc.) come last, as M9.

## Next steps (in parallel)
- **Engine (critical path), M4:** `adapt.replan()` for closure, cancellation, rain, delay, budget and fatigue. It replaces only the affected segment and reports a diff. Details are in the latest context file.
- **API:** write `docs/api.md`, then M5. `discover()`, `plan()` and `validate()` are ready to wrap.
- **Traveler UI (M6)** and **Provider side (M7):** build against mocks that follow `docs/api.md`.
- **Data/demo:** 10 labelled personas. Use them to tune the greedy planner's preference for short stops.

## Setup
`cd backend && python -m venv .venv && .venv/Scripts/python -m pip install -e ".[dev]" && .venv/Scripts/python -m pytest`
