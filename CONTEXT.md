# Current Context

_Last updated: 2026-09-26 · latest entry: [docs/context/2026-09-26-02-m1-models-seed.md](docs/context/2026-09-26-02-m1-models-seed.md)_

## Where we are
- **M0 and M1 are done.** The repo is on GitHub (https://github.com/sirii-0606/local-experiences). There is no branch protection, by team choice.
- **Models:** `backend/app/models.py`.
- **Seed:** `backend/data/seed/` has 50 experiences, 23 providers and 27 places in Jaipur. The businesses are fictional; the monuments are real.
- **Loader:** `backend/app/seed.py` provides `load_seed()`.
- **Tests:** 4 passing. CI runs ruff and pytest on the backend, plus the context check on PRs.
- The team is 5 people. The work split is in `docs/roadmap.md`. Stretch items (AR, real feeds, etc.) come last, as M9.

## Next steps (in parallel)
- **Engine (critical path), M2:** feasibility, confidence, ranking and explanations in `backend/app/engine/`. Details are in the latest context file.
- **API:** write `docs/api.md` first, then M5.
- **Traveler UI (M6)** and **Provider side (M7):** build against mocks that follow `docs/api.md`.
- **Data/demo:** 10 labelled personas, and review the seed for Jaipur accuracy.

## Setup
`cd backend && python -m venv .venv && .venv/Scripts/python -m pip install -e ".[dev]" && .venv/Scripts/python -m pytest`
