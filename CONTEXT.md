# Current Context

_Last updated: 2026-09-26 · latest entry: [docs/context/2026-09-26-09-m8-polish.md](docs/context/2026-09-26-09-m8-polish.md)_

## Where we are
- **All core milestones (M0–M8) are built.** `main` has M7; `feat/m8-polish` is waiting to be merged. The repo is https://github.com/sirii-0606/local-experiences. There is no branch protection, by team choice.
- **Run everything:** `python scripts/dev.py [--reset]` → http://localhost:5173. The demo script is `docs/demo.md`.
- **Engine** (`backend/app/engine/`): feasibility with reasons, confidence, ranking (utility + localness + learned taste + diversity) with explanations, gap-aware planning + `insert`, localized replanning, and learning from feedback.
- **API** (`backend/app/main.py`, contract `docs/api.md`): `/chat`, `/discover`, `/plan`, `/events`, `/feedback`, `/catalog`, plus `/providers/draft|listings|availability|insights`.
- **AI** (`backend/app/intent.py`): `claude_parse` (claude-opus-5, structured output, refusal fallback) for intents and listing drafts, with offline rule parsers. It's verified offline only.
- **Data:** a read-only JSON seed (50 Jaipur experiences) plus a SQLite overlay (`store.py`) for listings, pauses, the demand log and feedback. Aggregates only; location is never stored.
- **Web app** (`frontend/`):
  - Traveler: chat, cards with reasons and confidence and feedback, learned chips (forgettable), group editor, map, plan timeline, disruption diff, "why not".
  - Provider: free-text onboarding → reviewed draft → publish; insights with lost-demand reasons and tips; pause.
- **Tests/CI:** backend 66 pass (1 skipped: live LLM). The frontend builds. CI runs backend, frontend and the context check.
- **Team:** 5 people. Stretch items are M9.

## Next steps
1. Merge M8. Then, as a team: rehearse `docs/demo.md`, add README screenshots, do one live LLM run (`RUN_LLM_TESTS=1`), and review the seed data.
2. **M9 stretch**, in order: live weather (Open-Meteo), post-visit ratings as evidence, Hindi UI, 360° previews, provider accounts, listing edits and a location picker, and a booking stub. Details are in the latest context file.

## Setup
`python scripts/dev.py` (first run installs the backend venv and frontend node_modules). For manual steps, see the README.
