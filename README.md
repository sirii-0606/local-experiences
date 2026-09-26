# Local & Experiences

**An intelligent local discovery and experience platform (Jaipur prototype).** It answers *"What can we actually do next, given our situation?"*, not *"What exists nearby?"*.

- **For travelers:** it filters local experiences by what is **feasible**: free time including travel, opening hours and slots, budget for the whole group, ages, accessibility, weather, and the rest of the plan. It ranks them with **reasons you can read**, builds a plan around your existing commitments, and **repairs only the affected part** when something changes (a delay, rain, a closure, tiredness, a budget cut).
- **For local providers:** an artisan describes their offering in their own words and gets a structured listing. They then see **aggregate demand**, and **why interested travelers didn't pick them**.

**Status:** the core milestones (M0–M8) plus live weather are done. See [`docs/roadmap.md`](docs/roadmap.md) and the latest [`CONTEXT.md`](CONTEXT.md).

## Run it (one command)
You need Python 3.12+ and Node 22+ (check with `python --version` and `node --version`).
```bash
python scripts/dev.py --reset    # first run installs everything (~1-2 min), then opens http://localhost:5173
```
- **Ctrl+C** stops both servers. Leave out `--reset` to keep providers you onboarded and the feedback you gave.
- **Offline:** everything works offline except map tiles and the live-weather chip.
- **Claude:** if `ANTHROPIC_API_KEY` is set, Claude parses free text instead of the offline parser. The engine's results don't depend on which parser ran.
- **Walkthrough:** **[`docs/demo.md`](docs/demo.md)** has the 5-minute demo and troubleshooting.

| Problem | Fix |
|---|---|
| `Port 8000/5173 is already in use` | An old copy is still running. Close its terminal and retry. |
| `python` not found (Windows) | Use `py scripts/dev.py --reset`. |
| `npm` not found | Install Node.js 22+ from nodejs.org, then reopen the terminal. |
| The map is grey | There's no internet for map tiles; the app still works. |

<details><summary>Manual setup / tests</summary>

```bash
cd backend
python -m venv .venv && .venv/Scripts/python -m pip install -e ".[dev]"   # .venv/bin on macOS/Linux
.venv/Scripts/python -m pytest                                          # 66 tests, no network
.venv/Scripts/python -m uvicorn app.main:app --reload                   # API :8000, schema at /docs
cd ../frontend && npm install && npm run dev                            # web app :5173
```
</details>

## How it works
```
 chat text ──► intent parser (Claude structured output │ offline rules) ──► TravelerState
                                                                              │
 JSON seed + SQLite overlay (provider listings, pauses) ──► ENGINE ◄──────────┘
   feasibility (hard constraints, with reasons) → ranking (weighted utility + confidence
   + localness + learned taste, then diversity) → explanations from the same factors
   → itinerary gaps / fill / validate → localized replanning on events → learning from feedback
                                                                              │
 React + Leaflet: traveler (chat, cards, map, plan, disruptions) · provider (onboarding, insights)
```
- **The engine is the product.** It's pure Python in `backend/app/engine/`, with no I/O. Every recommendation is re-checked in tests by an **independent validator**.
- **Claude only extracts** intent and listing drafts, and falls back to rules on any failure. It never ranks or decides.
- **Trust:** each attribute has a confidence based on its source and how recent it is. Low confidence is **flagged, never hidden**.
- **Privacy:** location is never stored. Providers see aggregates only.

## Key Advanced Features
- **Google Calendar Integration**: Connect your Google Calendar via OAuth 2.0 to automatically import external commitments (flights, meetings, hotel check-ins) as locked unmovable stops, and export confirmed itineraries directly to Google Calendar.
- **Dynamic Context & User Account History**: Retains your long-term search history, learned taste preferences, and rejected places across logins to personalize future trip plans.
- **Manual Stop Deletion & Instant Dynamic Replanning**: Manually delete any suggested stop from an itinerary (`DELETE /trips/{id}/stops/{experience_id}`), update your negative taste preferences instantly, and watch the engine automatically repair the schedule and fill time gaps.

## Docs
- New Features Architecture & Implementation: [`docs/NEW_FEATURES_IMPLEMENTATION.md`](docs/NEW_FEATURES_IMPLEMENTATION.md)
- Multi-Source Live APIs & YouTube AI Pipeline: [`docs/MULTI_SOURCE_API_AND_YOUTUBE_PIPELINE.md`](docs/MULTI_SOURCE_API_AND_YOUTUBE_PIPELINE.md)
- Concept baseline: [`docs/ideation/`](docs/ideation/) (the original ideation document and a text copy)
- Every design decision, with the numbers: [`docs/ideation/decisions.md`](docs/ideation/decisions.md)
- MVP scope, success metrics, scenarios: [`docs/ideation/mvp-scope.md`](docs/ideation/mvp-scope.md)
- API contract: [`docs/api.md`](docs/api.md) · Demo script: [`docs/demo.md`](docs/demo.md)
- Change history, each entry with "how to proceed next": [`docs/context/`](docs/context/)

## Stack
Python 3.12 · FastAPI · Pydantic · SQLite (stdlib) · Anthropic SDK (`claude-opus-5`) · React 19 · TypeScript · Vite · Leaflet + OpenStreetMap. Seed data: 50 Jaipur experiences. The monuments are real; **all businesses are fictional**.

## Contributing
1. Branch from `main` as `feat/…`, `fix/…` or `docs/…`, and use conventional commits.
2. Every change adds a `docs/context/YYYY-MM-DD-NN-slug.md` file and updates `CONTEXT.md`. CI enforces this.
3. CI runs backend ruff + pytest, the frontend type-check + build, and the context check.
