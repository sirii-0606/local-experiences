# Local & Experiences

An intelligent local discovery and experience platform. It answers *"What should I do next, given my situation?"* rather than *"What exists nearby?"*: it filters local experiences by what is actually feasible (time, budget, distance, hours, group, accessibility, existing itinerary), ranks them with reasons you can read, replans when something changes, and helps local providers reach travelers who genuinely fit.

**Status:** M4 (engine complete: discovery, itinerary, replanning). See [`docs/roadmap.md`](docs/roadmap.md) and [`CONTEXT.md`](CONTEXT.md).

## Docs
- Concept baseline: [`docs/ideation/`](docs/ideation/) (original docx + text copy)
- Prototype decisions: [`docs/ideation/decisions.md`](docs/ideation/decisions.md)
- MVP scope, metrics, demo script: [`docs/ideation/mvp-scope.md`](docs/ideation/mvp-scope.md)
- Change history with next steps: [`docs/context/`](docs/context/)

## Stack
FastAPI + Pydantic (engine and API), React + Vite + Leaflet (UI), SQLite, and the Claude API for intent parsing, with a rule-based fallback.

## Contributing
1. Branch from `main` as `feat/…`, `fix/…` or `docs/…`, and use conventional commits.
2. Add a `docs/context/YYYY-MM-DD-NN-slug.md` file and update `CONTEXT.md` in every PR. CI enforces this.
3. Open a PR using the template and squash merge.
