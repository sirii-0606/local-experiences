# Current Context

_Last updated: 2026-09-26 · latest entry: [docs/context/2026-09-26-08-m7-provider.md](docs/context/2026-09-26-08-m7-provider.md)_

## Where we are
- **M0–M7 are done.** `main` has M6; `feat/m7-provider` is waiting to be merged. The repo is https://github.com/sirii-0606/local-experiences. There is no branch protection, by team choice.
- **Engine** (`backend/app/engine/`): feasibility, confidence, ranking + reasons, gap-aware planning + `insert`, and localized replanning.
- **API** (`backend/app/main.py`): traveler endpoints (`/chat`, `/discover`, `/plan`, `/events`, `/catalog`) plus provider endpoints (`/providers/draft|listings|availability|insights`). The contract is `docs/api.md`.
- **AI** (`backend/app/intent.py`): `claude_parse` (claude-opus-5, structured output, refusal fallback) for traveler intents and provider drafts, with offline rule parsers as fallback. It's verified offline only.
- **Runtime data** (`backend/app/store.py`): SQLite overlay on the JSON seed for provider listings and pauses, plus an aggregate-only demand log. Delete `backend/data/local.db` to reset a demo.
- **Web app** (`frontend/`), with Traveler and Provider tabs:
  - Traveler: chat, cards with reasons and confidence, map, plan timeline with lock/remove/fill/add, disruption panel with a diff, "why not".
  - Provider: free text → editable draft → publish; demand insights with lost-demand reasons and tips; pause/resume.
- **Scenarios A, B and C** all run end to end in the browser.
- **Tests/CI:** backend 59 pass (1 skipped: live LLM). The frontend builds. CI runs backend, frontend and the context check.
- **Team:** 5 people. The work split is in `docs/roadmap.md`. Stretch items come last, as M9.

## Next steps
- **M8:** feedback loop (accept/reject shifts ranking and evidence), group-mode UI, demo polish (screenshots, one-command start, rehearsal), and one live LLM run.
- **M9 stretch** (after M8): 360°/3D previews, real weather API, booking stub, Hindi UI, provider auth, listing edits, and a map location picker.

## Setup
Backend: `cd backend && python -m venv .venv && .venv/Scripts/python -m pip install -e ".[dev]" && .venv/Scripts/python -m uvicorn app.main:app --reload`
Frontend: `cd frontend && npm install && npm run dev`, then open http://localhost:5173
