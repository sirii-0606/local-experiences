# Local & Experiences

An intelligent local discovery and experience platform. It answers *"What should I do next, given my situation?"* rather than *"What exists nearby?"*: it filters local experiences by what is actually feasible (time, budget, distance, hours, group, accessibility, existing itinerary), ranks them with reasons you can read, replans when something changes, and helps local providers reach travelers who genuinely fit.

**Status:** M6 (engine + API + traveler web app). See [`docs/roadmap.md`](docs/roadmap.md) and [`CONTEXT.md`](CONTEXT.md).

## Run it
Use two terminals:
```bash
cd backend
python -m venv .venv && .venv/Scripts/python -m pip install -e ".[dev]"   # .venv/bin on macOS/Linux
.venv/Scripts/python -m pytest                                          # no network needed
.venv/Scripts/python -m uvicorn app.main:app --reload                   # API on :8000, schema at /docs
```
```bash
cd frontend
npm install
npm run dev                                                             # http://localhost:5173
```
In the app, click **Send** on the pre-filled family example to get recommendations, a map and a plan. Then use **Something changed?** (late, rain, closure, tired, budget) to see local replanning. The demo clock is fixed at 26 Sep 2026 15:30 so results are reproducible. The chat works offline. Set `ANTHROPIC_API_KEY` to have Claude parse free text instead. See [`docs/api.md`](docs/api.md).

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
