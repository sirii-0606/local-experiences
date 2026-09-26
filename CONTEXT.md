# Current Context

_Last updated: 2026-09-26 · latest entry: [docs/context/2026-09-26-01-bootstrap.md](docs/context/2026-09-26-01-bootstrap.md)_

## Where we are
**M0 is done.** The repo, docs, and GitHub scaffolding are in place. There is no app code yet. The prototype decisions (`docs/ideation/decisions.md`) and MVP scope (`docs/ideation/mvp-scope.md`) are *proposed* and waiting for team review.

## Next step
**M1: domain models + seed data** (branch `feat/m1-models-seed`)
- Add `backend/pyproject.toml` (fastapi, pydantic; dev: pytest, ruff).
- In `backend/app/models.py`, add Pydantic models for Traveler, TravelerState, Experience, Provider, Place, AvailabilityWindow, Itinerary/Stop, ContextEvent, Feedback, and Evidence (per-attribute value + source + updated_at).
- In `backend/data/seed/`, add about 50 Jaipur experiences from about 15 providers. Mix formal and informal providers and fill in accessibility, localness inputs, and tourist_index.
- Add `backend/tests/test_seed.py`, which checks that the seed loads and validates.
- Add a backend job (ruff + pytest) to `.github/workflows/ci.yml`.

## Before starting
- Create the GitHub remote and push `main`. See "How to proceed next" in the latest context file.
