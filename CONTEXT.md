# Current Context

_Last updated: 2026-09-26 · latest entry: [docs/context/2026-09-26-14-website-p1-accounts.md](docs/context/2026-09-26-14-website-p1-accounts.md)_

## Where we are
- **`main` (`56097d9`) has everything through M9:**
  - the core engine and app
  - live weather, the evaluation UI, ratings as evidence, provider edit tokens, bookings
  - the demo guide
- **In progress: Website v2** on `feat/website-skeleton` (plan: [`docs/website-v2-plan.md`](docs/website-v2-plan.md), phases P1–P9).
  - **P1 is done:** accounts, sessions, roles, admin, profile shell, and routed pages.
  - **Working rule:** the backend is still in development, so v2 is **contract-first and additive** (`backend/app/schemas.py`, `docs/openapi.json` + contract test, new routers only, `WEBSITE_V2` kill switch, frontend mock mode `VITE_API_MOCK=1`, `API_TARGET`).
- **Run it:**
  - `python scripts/dev.py [--reset]` → http://localhost:5173. Set `ADMIN_EMAIL`/`ADMIN_PASSWORD` first for an admin account.
  - Routes: `/` Explore, `/provider`, `/login`, `/register`, `/profile`, `/trips` (placeholder), `/admin`.
- **Engine** (`backend/app/engine/`): feasibility, confidence, ranking and explanations, gap-aware planning, localized replanning, learning.
- **API:** the existing endpoints in `docs/api.md` plus the v2 section (`/auth/*`, `/me/*`, `/admin/*`).
- **Tests/CI:** backend 105 pass (1 skipped: live LLM), including the contract snapshot test. The frontend builds. CI runs backend, frontend and the context check.

## Next steps
1. **P2, onboarding:** the 4-step `/onboarding`, a full preferences editor with companions, and Explore pre-filled from the profile (dislikes seed learned taste).
2. **P3:** the trip model and "Plan a trip" wizard (stubs first). **P4:** multi-day scoring and shortlist (in person / AR / skip) and stays. **P5:** itinerary with meals, quick stops and group splits. **P6:** the feedback loop. **P7:** interactive itinerary with hover details and review sentiment. **P8:** print/PDF. **P9:** docs.
3. **Parked:** Unity/AR immersive previews (plan appendix); the "AR" buttons in P4 are the hook.
4. **Team:** rehearse `docs/demo.md` (the Explore flow is unchanged), README screenshots, and one live LLM run.

## Setup
`python scripts/dev.py` (first run installs everything). For manual steps, see the README. For frontend-only work: `cd frontend && VITE_API_MOCK=1 npm run dev`.
