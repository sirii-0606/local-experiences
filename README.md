# Local & Experiences

An intelligent local discovery and experience platform. It answers *"What should I do next, given my situation?"* rather than *"What exists nearby?"*: it filters local experiences by what is actually feasible (time, budget, distance, hours, group, accessibility, existing itinerary), ranks them with reasons you can read, replans when something changes, and helps local providers reach travelers who genuinely fit.

**Status:** M5 (engine + HTTP API + chat intent parsing). See [`docs/roadmap.md`](docs/roadmap.md) and [`CONTEXT.md`](CONTEXT.md).

## Run it
```bash
cd backend
python -m venv .venv && .venv/Scripts/python -m pip install -e ".[dev]"   # .venv/bin on macOS/Linux
.venv/Scripts/python -m pytest                                          # 48 tests, no network
.venv/Scripts/python -m uvicorn app.main:app --reload                   # http://localhost:8000/docs
```
Try it: `POST /chat` with `{"text": "family of 4 with two kids near Hawa Mahal, free 4-6 pm, Rs 1500, local food and something cultural", "now": "2026-09-26T15:30:00"}`. The chat works offline. Set `ANTHROPIC_API_KEY` to have Claude parse free text instead. See [`docs/api.md`](docs/api.md).

## Docs
- Concept baseline: [`docs/ideation/`](docs/ideation/) (original docx + text copy)
- Prototype decisions: [`docs/ideation/decisions.md`](docs/ideation/decisions.md)
- MVP scope, metrics, demo script: [`docs/ideation/mvp-scope.md`](docs/ideation/mvp-scope.md)
- API contract: [`docs/api.md`](docs/api.md)
- Change history with next steps: [`docs/context/`](docs/context/)

## Stack
FastAPI + Pydantic (engine and API), React + Vite + Leaflet (UI), SQLite, and the Claude API for intent parsing, with a rule-based fallback.

## Contributing
1. Branch from `main` as `feat/…`, `fix/…` or `docs/…`, and use conventional commits.
2. Add a `docs/context/YYYY-MM-DD-NN-slug.md` file and update `CONTEXT.md` in every PR. CI enforces this.
3. Open a PR using the template and squash merge.
