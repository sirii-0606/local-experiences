# Current Context

_Last updated: 2026-09-26 · latest entry: [docs/context/2026-09-26-07-m6-traveler-ui.md](docs/context/2026-09-26-07-m6-traveler-ui.md)_

## Where we are
- **M0–M6 are done.** `main` has M5; `feat/m6-traveler-ui` is waiting to be merged. The repo is https://github.com/sirii-0606/local-experiences. There is no branch protection, by team choice.
- **Engine** (`backend/app/engine/`): feasibility, confidence, ranking + reasons, gap-aware planning, `insert` (fit a chosen experience into a feasible gap), and localized replanning.
- **API** (`backend/app/main.py`): `/chat`, `/discover`, `/plan` (with `add`), `/events`, `/catalog`, `/health`. The contract is `docs/api.md`.
- **Intent** (`backend/app/intent.py`): Claude `claude-opus-5` structured output with a refusal fallback, plus an offline rule parser. The Claude path is verified offline only.
- **Traveler app** (`frontend/`): React + Leaflet. Chat, situation chips, cards with reasons and confidence badges, map, plan timeline with lock/remove/fill, a disruption panel with a diff, "why not", and a demo clock. It was verified end to end in a browser. The demo steps are in the latest context file.
- **Tests/CI:** backend 51 pass (1 skipped: live LLM). The frontend `npm run build` (tsc + vite) passes. CI runs backend, frontend and the context check.
- **Team:** 5 people. The work split is in `docs/roadmap.md`. Stretch items come last, as M9.

## Next steps
- **M7, provider side:** a SQLite overlay on the seed, Claude-drafted listings from free text, demand insights from aggregate chat logs, and a `/provider` view. Scenario C is the acceptance test.
- **M8:** feedback loop (accept/reject shifts ranking), group mode UI, README polish, demo rehearsal.
- **Data/demo:** 10 labelled personas, planner tuning, and one live LLM run (`RUN_LLM_TESTS=1`).

## Setup
Backend: `cd backend && python -m venv .venv && .venv/Scripts/python -m pip install -e ".[dev]" && .venv/Scripts/python -m uvicorn app.main:app --reload`
Frontend: `cd frontend && npm install && npm run dev`, then open http://localhost:5173
