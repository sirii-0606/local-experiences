# Current Context

<<<<<<< Updated upstream
_Last updated: 2026-09-26 · latest entry: [docs/context/2026-09-26-20-jaipur-luxury-ui-redesign.md](docs/context/2026-09-26-20-jaipur-luxury-ui-redesign.md)_
=======
_Last updated: 2026-09-26 · latest entry: [docs/context/2026-09-26-17-ec2-deployment.md](docs/context/2026-09-26-17-ec2-deployment.md)_
>>>>>>> Stashed changes

## Where we are
- **`main` has everything through M9 + Website v2 P1 & P3 + EC2 Production Deployment:**
  - the core engine and app
  - live weather, the evaluation UI, ratings as evidence, provider edit tokens, bookings
<<<<<<< Updated upstream
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
=======
  - the demo guide and AWS EC2 deployment workflow ([`docs/deploy-ec2.md`](docs/deploy-ec2.md))
- **In progress: Website v2** (plan: [`docs/website-v2-plan.md`](docs/website-v2-plan.md), phases P1–P9).
  - **P1 is done:** accounts, sessions, roles, admin, profile shell, and routed pages.
  - **P3 is done** (built before P2, by the user's choice):
    - the trips dashboard `/trips` and the 4-step "Plan a trip" wizard `/trips/new`, which also edits at `/trips/:id`
    - owner-scoped `/trips` CRUD
  - **Design identity "Sanganer block print"** across the whole app: lime-wash, indigo and rani tokens; Rozha One + Hind; a block-print motif border; trip covers as dyed swatches. See `decisions.md` and the context history. Reuse `--butti`, `.postcard.dye-N` and `.display` on new screens.
  - **Production & AWS EC2 ready:** FastAPI strips `/api` prefixes, serves `STATIC_DIR` (`frontend/dist`) with SPA fallback, honors `X-Forwarded-Proto` / `X-Forwarded-For`, and runs SQLite in WAL mode. `scripts/ec2_setup.sh` provisions EC2 (Nginx + systemd + `/var/lib/local-experiences/local.db`), and `scripts/ec2_update.sh` updates code in ~2s via Git or live `rsync` (`--sync`).
  - **Working rule:** the backend is still in development, so v2 is **contract-first and additive** (`backend/app/schemas.py`, `docs/openapi.json` + contract test, new routers only, `WEBSITE_V2` kill switch, frontend mock mode `VITE_API_MOCK=1`, `API_TARGET`).
- **Run it:**
  - Dev: `python scripts/dev.py [--reset]` → http://localhost:5173.
  - Prod (single port): `python scripts/prod.py` → http://0.0.0.0:8000.
  - EC2: `bash scripts/ec2_setup.sh` (once), then `./scripts/ec2_update.sh` (see [`docs/deploy-ec2.md`](docs/deploy-ec2.md)).
  - Routes: `/` Explore, `/provider`, `/login`, `/register`, `/profile`, `/trips`, `/trips/new`, `/trips/:id`, `/admin`.
- **Engine** (`backend/app/engine/`): feasibility, confidence, ranking and explanations, gap-aware planning, localized replanning, learning.
- **API:** the existing endpoints in `docs/api.md` plus the v2 section (`/auth/*`, `/me/*`, `/admin/*`, `/trips`).
- **Tests/CI:** backend 110 pass (1 skipped: live LLM), including the contract snapshot test, trip tests, and production routing/SPA tests. The frontend builds cleanly. CI runs backend, frontend and the context check; `deploy-ec2.yml` auto-deploys when EC2 secrets are set.

## Next steps
1. **Deploy / update on AWS EC2:** follow [`docs/deploy-ec2.md`](docs/deploy-ec2.md) (`bash scripts/ec2_setup.sh` once on EC2, then `EC2_HOST=ubuntu@<ip> ./scripts/ec2_update.sh --sync` or `git push` for frequent updates).
2. **P4:** multi-day scoring and shortlist (in person / AR / skip), plus `stays.json` and the top-3 stay pick. Add `shortlist` and `stay_id` to `TripDraft` as optional fields. That turns the wizard's "saved" note into a real next step.
3. **P2, onboarding** (still open): the 4-step `/onboarding`, a full preferences editor with companions, and Explore pre-filled from the profile. It makes "Use my preferences for everyone" richer.
4. Later: **P5** itinerary with meals, quick stops and group splits. **P6** feedback loop. **P7** interactive itinerary. **P8** print/PDF. **P9** docs.
5. **Parked:** Unity/AR immersive previews (plan appendix); the "AR" buttons in P4 are the hook.
6. **Team:** rehearse `docs/demo.md` (the Explore flow is unchanged), README screenshots, and one live LLM run.

## Setup
`python scripts/dev.py` (first run installs everything). For production build: `python scripts/prod.py`. For AWS EC2: see [`docs/deploy-ec2.md`](docs/deploy-ec2.md).
>>>>>>> Stashed changes
