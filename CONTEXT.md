# Current Context

_Last updated: 2026-09-27 · latest entry: [docs/context/2026-09-27-07-host-loop.md](docs/context/2026-09-27-07-host-loop.md)_

**TrueLocal** — "Local Experiences, Intelligently Planned". A context-aware local experience discovery and planning platform (hackathon). Baseline: `docs/ideation/`. Decisions: `docs/ideation/decisions.md`. API: `docs/api.md` + `docs/openapi.json`.

## The product in one flow
1. A traveler lands on the site, signs up, and answers a short onboarding questionnaire (`GET /me/onboarding` → `PUT /me/profile`).
2. They type what they want right now. The engine works out who, where, when, weather, traffic and budget, filters what's feasible, ranks it, explains why, and builds a plan (`POST /chat`).
3. Their profile context keeps learning from chats, feedback, pasted past itineraries and saved trips (`/me/context…`), and they can see and correct it.
4. They approve the plan and add it to their calendar with "leave now" reminders (`POST /calendar/export`).
5. When things change (rain, delay, closure, tired, budget), only the affected part is replanned (`/events`, `/context/check`).
6. Local vendors list themselves in plain words, get structured and classified, and are matched to the travelers they suit (`/providers/*`).
7. Travelers request a slot with a host; the host accepts (a real booking with a code, which unlocks a verified review) or declines. Hosts see what travelers nearby asked for and found nothing for (`/requests`, `/me/requests…`, `/providers/demand`).

## Architecture (unchanged rules)
- One pure-Python engine (`backend/app/engine/`) decides: feasibility → ranking → itinerary → replanning. UI, chat and API are thin consumers.
- The LLM (NVIDIA NIM from `.env`, or `claude-opus-5`) only parses text into a `TravelerState`. It never decides. Its output is validated and merged with the rule parse (rules win on times, money, counts), with a 10 s deadline (`LLM_TIMEOUT_S`); the rule parser always works offline.
- Hard constraints ≠ soft preferences. Low confidence is flagged, never hidden.

## What works now (backend)
- **Any city in India.** The place a traveler names is geocoded (Open-Meteo/GeoNames). Places within 15 km come from Wikidata, or Wikipedia when Wikidata is busy, and are cached in SQLite. The curated Jaipur data wins where it exists.
  - Open-data hours and prices are typical values, always marked "⚠ typical, not confirmed".
  - Sites on ASI, state or municipal heritage lists are verified, government-listed providers.
- **Live context in `/chat`:**
  - location, with priority: text > device > previous turn > profile home city > Jaipur (with a note)
  - live weather at that place
  - a time-of-day traffic estimate
  - "before my train/flight" → back at a station or airport in time
  - `closed_now`, with when each place next opens
  - every assumption spelled out
- **Traveler understanding:** age, family or companions, dislikes ("not a park", a hard constraint), student/luxury budget, "it's 6 pm", and follow-up refinements.
- **Profile context ("RAG"):** per-user tag weights plus the profile and past trips build the signed-in starting state. A short summary is the LLM's background. It's owner-only, exportable and deletable.
- **Engine:**
  - group fairness, confidence and evidence, and post-visit ratings as evidence
  - multi-day trips with stays, meals, quick stops and group splits (Jaipur only)
  - localized replanning, a feedback learning loop, and bookings (a stub with no payment)
- **Accounts:** sessions, roles, admin (who never sees profile data), trips CRUD.
- **Providers:** free text → draft → listing, anywhere (pin + area). Pause, edit token, demand insights, and the traveler segments each listing fits.
- **Host loop:** listings published while signed in belong to the account (`GET /me/listings`), booking requests with an accept/decline inbox, and "demand near you" (a ~5 km cell, aggregates only, hidden below 3 searches).
- **Calendar:** `.ics` with travel-aware reminders, plus Google Calendar links per stop.
- **Review verification:** every review gets a trust score and reasons (machine-written style, no specifics, bursts, near-copies, repeated claims; extremes weigh less; booking-verified visits trusted most). Only trusted reviews feed ratings. `/reviews`, `/reviews/check`.
- **Social signals and digital twin** (teammate, [2026-09-27-21](docs/context/2026-09-27-21-additional-integration-tasks.md)): `/social/signals`, `/social/report`, `/simulation/presets`, `/simulation/what-if` (weather what-if with plan repair via `replan()`), plus map layers and modals in Explore. Jaipur-scoped. **The social feed is hardcoded sample posts**, some attributed to real-sounding accounts: label it as demo data or replace it before anyone treats it as live.

## Verified scenarios (live data, real server, rule parser)
- **76-year-old, family, heritage, 6 PM in Pune, "not any park"**
  - Recommends 5 open heritage sites and no parks.
  - Kelkar Museum, Shaniwar Wada and Aga Khan Palace show as closed, opening tomorrow.
  - The plan validates, and calendar reminders are correct.
- **Student, 4 hours in Mumbai before a train, beach + views**
  - Recommends Mahim Beach, Versova Beach and Bandstand Promenade.
  - The plan gets back to Bandra Terminus by 18:00 on a ₹600 budget.

## Frontend
- Current TrueLocal design kept. `/` is the product landing page (no city named). `/explore` is the planner, a calm two-column page that scrolls with a sticky map: an Ask box at the top with location sharing, a context strip (where, weather, traffic, closed-now, assumptions), verified reviews per place, "Add to calendar". `/onboarding` after sign-up; `/profile` shows preferences and what we've learned (correctable); `/verify` checks any pasted reviews; `/provider` has three tabs (List an experience · My listings with insights and demand near you · Requests inbox); Explore cards for host listings have "Request to book"; Profile lists your booking requests.
- Other routes: `/3d` (also `/spatial`), `/provider`, `/login`, `/register`, `/trips`, `/trips/new`, `/trips/:id`, `/trips/:id/shortlist`, `/trips/:id/itinerary`, `/admin`.
- Nothing is invented on screen: no fake fallbacks, ratings, weather or photos; the social feed is labelled sample data.

## Health
- Backend: 158 passed, 1 skipped (live LLM); tests stay offline whatever `.env` holds. Ruff is clean. Frontend `npm run build` is clean.
- Keys live in `.env` (gitignored): NVIDIA NIM (working, 0.3–30 s per call), OpenWeatherMap (used as the weather backup). `ADMIN_PASSWORD` there is under 8 characters, so no admin is created.
- Not on `main` yet: `feat/photos-empty-plan` (real photos, no invented plan) and `feat/host-loop` (this change).
- `main` on GitHub has: any-city, review verification, the new UI, live keys, and the teammate's trips/simulation work (`c1176b4`), merged 2026-09-27.
- Teammate's rain/heat "convenience" scores default to 30–40% for places without a curated value (all open-data places) and are shown as a precise percentage: worth labelling as an estimate.

## Known gaps
- Coverage and data quality are only as good as Wikidata, which is limited to about 1 query/min at times. Warm demo cities first.
- Traffic is an estimate, not a live feed. Weather is one condition for the whole window.
- There's no direct Google Calendar sync; that needs an OAuth client.
- `/trips` (multi-day) is still Jaipur-only.
- AR/3D is a presentation layer only.

## Next steps
1. Push `feat/photos-empty-plan` + `feat/host-loop` to `main` when asked (fetch first).
2. Polish: notifications for new/decided requests; Escape closes modals; Explore's filters edit the chat state instead of demo groups; tie reviews to signed-in users.
3. Later: Google Calendar OAuth, `/trips` for any city, P6 feedback loop, P7 interactive cards, P8 print/PDF.

## Run it
- Everything: `python scripts/dev.py [--reset]` → http://localhost:5173. Set `ADMIN_EMAIL`/`ADMIN_PASSWORD` in `.env` for an admin account.
- Warm demo cities: `backend/.venv/Scripts/python scripts/warm_places.py Pune Mumbai`
- Tests: `cd backend && .venv/Scripts/python -m pytest` · lint: `.venv/Scripts/ruff check .`
- Prod on a single port: `python scripts/prod.py` · EC2: `docs/deploy-ec2.md`
- Frontend only: `cd frontend && VITE_API_MOCK=1 npm run dev`
