# Current Context

_Last updated: 2026-09-26 · latest entry: [docs/context/2026-09-26-03-m2-engine.md](docs/context/2026-09-26-03-m2-engine.md)_

## Where we are
- **M0, M1 and M2 are done.** The repo is https://github.com/sirii-0606/local-experiences. There is no branch protection, by team choice.
- **Models + seed:** `backend/app/models.py` and `backend/data/seed/` (Jaipur: 50 experiences, 23 providers). The businesses are fictional; the monuments are real.
- **Engine:** `backend/app/engine/`
  - `feasibility.check()` handles the hard constraints and gives reasons for exclusions.
  - `confidence.attr_confidence()` scores each attribute from its evidence.
  - `rank.discover()` returns the top-k feasible, diverse recommendations, each with factors and reasons, plus an `excluded` map of why everything else was dropped.
- **Tests:** 18 passing, including 8 personas checked by an independent feasibility validator.
- **Branch state:** `feat/m2-engine` is stacked on `feat/m1-models-seed`. Merge M1 first; the rebase command is in the latest context file.
- **Team:** 5 people. The work split is in `docs/roadmap.md`. Stretch items (AR, real feeds, etc.) come last, as M9.

## Next steps (in parallel)
- **Engine (critical path), M3:** the itinerary engine. Gaps, gap filling that reuses `check`, and sequence validation. Details are in the latest context file.
- **API:** write `docs/api.md`, then M5. `discover()` and `Recommendation` are ready to wrap.
- **Traveler UI (M6)** and **Provider side (M7):** build against mocks that follow `docs/api.md`.
- **Data/demo:** 10 labelled personas and a review of the seed for Jaipur accuracy.

## Setup
`cd backend && python -m venv .venv && .venv/Scripts/python -m pip install -e ".[dev]" && .venv/Scripts/python -m pytest`
