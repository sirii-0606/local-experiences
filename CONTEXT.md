# Current Context

_Last updated: 2026-09-26 · latest entry: [docs/context/2026-09-26-10-m9-weather.md](docs/context/2026-09-26-10-m9-weather.md)_

## Where we are
- **The core (M0–M8) is on `main`.** M9 stretch is in progress: **live weather is done** on `feat/m9-weather`, waiting to be merged. The repo is https://github.com/sirii-0606/local-experiences. There is no branch protection, by team choice.
- **Run everything:** `python scripts/dev.py [--reset]` → http://localhost:5173. The demo script is `docs/demo.md`.
- **Engine** (`backend/app/engine/`): feasibility with reasons, confidence, ranking (utility + localness + learned taste + diversity) with explanations, gap-aware planning + `insert`, localized replanning, and learning from feedback.
- **API** (`backend/app/main.py`, contract `docs/api.md`): `/chat`, `/discover`, `/plan`, `/events`, `/feedback`, `/weather`, `/context/check`, `/catalog`, plus `/providers/draft|listings|availability|insights`.
- **Live context** (`backend/app/weather.py`): Open-Meteo for the city centre. It detects plan risks and *proposes* a replan; the traveler confirms. Offline is harmless.
- **AI** (`backend/app/intent.py`): `claude_parse` (claude-opus-5) for intents and listing drafts, with offline rule parsers. It's verified offline only.
- **Data:** a read-only JSON seed plus a SQLite overlay (listings, pauses, demand log, feedback). Aggregates only; location is never stored.
- **Web app** (`frontend/`): the Traveler tab (chat, cards, feedback, learned chips, group editor, map, plan, disruptions + live forecast, "why not") and the Provider tab (onboarding, insights, pause).
- **Tests/CI:** backend 78 pass (1 skipped: live LLM). The frontend builds. CI runs backend, frontend and the context check.

## Next steps
1. Merge M9.1 (weather).
2. **M9.2, post-visit ratings → traveler evidence → confidence.** The spec is in the latest context file.
3. Then Hindi UI → 360° previews → provider accounts/edits/location picker → booking stub.
4. **Team:** rehearse `docs/demo.md`, add README screenshots, and do one live LLM run.

## Setup
`python scripts/dev.py` (first run installs everything). For manual steps, see the README.
