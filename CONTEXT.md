# Current Context

_Last updated: 2026-09-26 · latest entry: [docs/context/2026-09-26-16-block-print-design.md](docs/context/2026-09-26-16-block-print-design.md)_

## Where we are
- **`main` (`56097d9`) has everything through M9:**
  - the core engine and app
  - live weather, the evaluation UI, ratings as evidence, provider edit tokens, bookings
  - the demo guide
- **In progress: Website v2** on `feat/website-skeleton` (plan: [`docs/website-v2-plan.md`](docs/website-v2-plan.md), phases P1–P9).
  - **P1 is done:** accounts, sessions, roles, admin, profile shell, and routed pages.
  - **P3 is done** (built before P2, by the user's choice):
    - the trips dashboard `/trips` and the 4-step "Plan a trip" wizard `/trips/new`, which also edits at `/trips/:id`
    - owner-scoped `/trips` CRUD
  - **Design identity "Sanganer block print"** across the whole app: lime-wash, indigo and rani tokens; Rozha One + Hind; a block-print motif border; trip covers as dyed swatches. See `decisions.md` and the latest context file. Reuse `--butti`, `.postcard.dye-N` and `.display` on new screens.
  - **Working rule:** the backend is still in development, so v2 is **contract-first and additive** (`backend/app/schemas.py`, `docs/openapi.json` + contract test, new routers only, `WEBSITE_V2` kill switch, frontend mock mode `VITE_API_MOCK=1`, `API_TARGET`).
- **Run it:**
  - `python scripts/dev.py [--reset]` → http://localhost:5173. Set `ADMIN_EMAIL`/`ADMIN_PASSWORD` first for an admin account.
  - Routes: `/` Explore, `/provider`, `/login`, `/register`, `/profile`, `/trips`, `/trips/new`, `/trips/:id`, `/admin`.
- **Engine** (`backend/app/engine/`): feasibility, confidence, ranking and explanations, gap-aware planning, localized replanning, learning.
- **API:** the existing endpoints in `docs/api.md` plus the v2 section (`/auth/*`, `/me/*`, `/admin/*`, `/trips`).
- **Tests/CI:** backend 109 pass (1 skipped: live LLM), including the contract snapshot test and the trip tests. The frontend builds. CI runs backend, frontend and the context check.

## Next steps
1. **Restart `dev.py`** so the backend picks up `/trips`.
2. **P4:** multi-day scoring and shortlist (in person / AR / skip), plus `stays.json` and the top-3 stay pick. Add `shortlist` and `stay_id` to `TripDraft` as optional fields. That turns the wizard's "saved" note into a real next step.
3. **P2, onboarding** (still open): the 4-step `/onboarding`, a full preferences editor with companions, and Explore pre-filled from the profile. It makes "Use my preferences for everyone" richer.
4. Later: **P5** itinerary with meals, quick stops and group splits. **P6** feedback loop. **P7** interactive itinerary. **P8** print/PDF. **P9** docs.
5. **Parked:** Unity/AR immersive previews (plan appendix); the "AR" buttons in P4 are the hook.
6. **Team:** rehearse `docs/demo.md` (the Explore flow is unchanged), README screenshots, and one live LLM run.

## Setup
`python scripts/dev.py` (first run installs everything). For manual steps, see the README. For frontend-only work: `cd frontend && VITE_API_MOCK=1 npm run dev`.
