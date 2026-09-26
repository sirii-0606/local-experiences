# Current Context

_Last updated: 2026-09-26 · latest entry: [docs/context/2026-09-26-19-itinerary-schema-timezone-fix.md](docs/context/2026-09-26-19-itinerary-schema-timezone-fix.md)_

## Where we are
- **`main` (`56097d9`) has everything through M9:**
  - the core engine and app
  - live weather, the evaluation UI, ratings as evidence, provider edit tokens, bookings
  - the demo guide
- **Website v2 in progress:**
  - **P1 is done:** accounts, sessions, roles, admin, profile shell, and routed pages.
  - **P3 is done:** the trips dashboard `/trips` and the 4-step "Plan a trip" wizard `/trips/new`, which also edits at `/trips/:id`.
  - **P4 is done:** multi-day candidate scoring, travel mode times table, 3-way shortlist (*In Person* / *AR Preview* / *Skip*), `stays.json` seed, and stay recommendation by centroid of in-person activity picks.
  - **P5 is done:** multi-day itinerary builder starting & ending at stay, nearby meal suggestions (lunch & dinner windows), quick stops (≤45m en-route), driver/guide suggestions, and auto-suggested group splits.
  - **Design identity "Sanganer block print"** across the whole app: lime-wash, indigo and rani tokens; Rozha One + Hind; a block-print motif border; trip covers as dyed swatches.
  - **Working rule:** contract-first and additive (`backend/app/schemas.py`, `docs/openapi.json` + contract test, new routers only, `WEBSITE_V2` kill switch, frontend mock mode `VITE_API_MOCK=1`, `API_TARGET`).
- **Run it:**
  - `python scripts/dev.py [--reset]` → http://localhost:5173. Set `ADMIN_EMAIL`/`ADMIN_PASSWORD` in `.env` for an admin account.
  - Routes: `/` Explore, `/provider`, `/login`, `/register`, `/profile`, `/trips`, `/trips/new`, `/trips/:id`, `/trips/:id/shortlist`, `/trips/:id/itinerary`, `/admin`.
- **Engine** (`backend/app/engine/`): feasibility, confidence, ranking and explanations, gap-aware planning, multi-day scoring (`trip.py`), nearby suggestions (`nearby.py`), localized replanning, learning.
- **Tests/CI:** backend 116 tests (115 passed, 1 skipped: live LLM), frontend builds cleanly.

## Next steps
1. **P2, onboarding**: the 4-step `/onboarding`, a full preferences editor with companions, and Explore pre-filled from the profile.
2. Later: **P6** feedback loop ("too hectic" / "too expensive"). **P7** interactive cards with review sentiment. **P8** print/PDF view.
3. User-requested additional features.

## Setup
`python scripts/dev.py` (first run installs everything). For frontend-only work: `cd frontend && VITE_API_MOCK=1 npm run dev`.
