# Current Context

_Last updated: 2026-09-27 · latest entry: [docs/context/2026-09-27-01-any-city-context.md](docs/context/2026-09-27-01-any-city-context.md)_

**TrueLocal** — "Local Experiences, Intelligently Planned". A context-aware local experience discovery and planning platform (hackathon). Baseline: `docs/ideation/`. Decisions: `docs/ideation/decisions.md`. API: `docs/api.md` + `docs/openapi.json`.

## The product in one flow
1. A traveler lands on the site, signs up, and answers a short onboarding questionnaire (`GET /me/onboarding` → `PUT /me/profile`).
2. They type what they want right now. The engine works out who, where, when, weather, traffic and budget, filters what's feasible, ranks it, explains why, and builds a plan (`POST /chat`).
3. Their profile context keeps learning from chats, feedback, pasted past itineraries and saved trips (`/me/context…`), and they can see and correct it.
4. They approve the plan and add it to their calendar with "leave now" reminders (`POST /calendar/export`).
5. When things change (rain, delay, closure, tired, budget), only the affected part is replanned (`/events`, `/context/check`).
6. Local vendors list themselves in plain words, get structured and classified, and are matched to the travelers they suit (`/providers/*`).

## Architecture (unchanged rules)
- One pure-Python engine (`backend/app/engine/`) decides: feasibility → ranking → itinerary → replanning. UI, chat and API are thin consumers.
- The LLM (`claude-opus-5`, with a rule-based fallback that always works offline) only parses text into a `TravelerState`. It never decides.
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
- **Calendar:** `.ics` with travel-aware reminders, plus Google Calendar links per stop.
- **Social signals and digital twin** (teammate, [2026-09-27-21](docs/context/2026-09-27-21-additional-integration-tasks.md)): `/social/signals`, `/social/report`, `/simulation/presets`, `/simulation/what-if` (weather what-if with plan repair via `replan()`), plus map layers and modals in Explore. Jaipur-scoped. **The social feed is hardcoded sample posts**, some attributed to real-sounding accounts: label it as demo data or replace it before anyone treats it as live.

## Verified scenarios (live data, real server, rule parser)
- **76-year-old, family, heritage, 6 PM in Pune, "not any park"**
  - Recommends 5 open heritage sites and no parks.
  - Kelkar Museum, Shaniwar Wada and Aga Khan Palace show as closed, opening tomorrow.
  - The plan validates, and calendar reminders are correct.
- **Student, 4 hours in Mumbai before a train, beach + views**
  - Recommends Mahim Beach, Versova Beach and Bandstand Promenade.
  - The plan gets back to Bandra Terminus by 18:00 on a ₹600 budget.

## Frontend (current UI, not yet updated for the above)
- TrueLocal design with a Jaipur look: marquee header, cinematic hero with a quick planner, a map with a sliding AI chat drawer, and a 3D/WebGL monuments view.
- Routes: `/` Explore, `/3d` (also `/spatial`), `/provider`, `/login`, `/register`, `/profile`, `/trips`, `/trips/new`, `/trips/:id`, `/trips/:id/shortlist`, `/trips/:id/itinerary`, `/admin`.
- Types and the mock mirror the new contract; no screens use it yet.

## Health
- Backend: 136 passed, 1 skipped (live LLM); runs offline with `LIVE_DATA=0`. Ruff is clean. Frontend `npm run build` is clean.
- The latest work is **not committed yet** (on `main`); it's meant to go on a `feat/*` branch.

## Known gaps
- Coverage and data quality are only as good as Wikidata, which is limited to about 1 query/min at times. Warm demo cities first.
- Traffic is an estimate, not a live feed. Weather is one condition for the whole window.
- There's no direct Google Calendar sync; that needs an OAuth client.
- `/trips` (multi-day) is still Jaipur-only.
- The review verification engine ("AI slop" filter) isn't built.
- AR/3D is a presentation layer only.

## Next steps
1. **Review verification engine:** waiting for the user's instructions.
2. **UI phase**, keeping the current UI as the base:
   - a product landing page that names no city
   - onboarding screens
   - a profile "context" section
   - a chat context panel (closed-now, assumptions, weather, traffic)
   - "Add to calendar"
   - `/catalog?lat&lon` so non-Jaipur results render as cards
3. Later: Google Calendar OAuth, `/trips` for any city, P6 feedback loop, P7 interactive cards, P8 print/PDF.

## Run it
- Everything: `python scripts/dev.py [--reset]` → http://localhost:5173. Set `ADMIN_EMAIL`/`ADMIN_PASSWORD` in `.env` for an admin account.
- Warm demo cities: `backend/.venv/Scripts/python scripts/warm_places.py Pune Mumbai`
- Tests: `cd backend && .venv/Scripts/python -m pytest` · lint: `.venv/Scripts/ruff check .`
- Prod on a single port: `python scripts/prod.py` · EC2: `docs/deploy-ec2.md`
- Frontend only: `cd frontend && VITE_API_MOCK=1 npm run dev`
