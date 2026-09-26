# Website v2 plan (approved 2026-09-26): accounts, onboarding, trip planner, interactive + printable itinerary

## Context
The user wants the app to become a full website with:
1. User management: authentication, authorisation, admin login, profile.
2. Onboarding that captures the user's preferences and accessibility needs.
3. A **"Plan a trip"** workflow:
   - wizard: budget, dates, destination, stay, travelers
   - per-traveler preferences, with "apply mine to all"
   - scoring of attractions by liking, distance, travel mode, en-route extras and duration
   - a shortlist where each item is *AR / in person / skip*
   - restaurant, stay and quick-stop suggestions
   - a feedback loop ("too hectic / too slow")
   - an interactive itinerary with hover details (costs, travel by mode, bookings, links, phones, guides, AR, review sentiment)
   - a printable PDF with images, a route map, ticket and guide suggestions
   - support for **group splits**

**User decisions:**
- **Evolve the existing app** (same repo and stack; reuse the engine).
- **Email + password with server sessions** (stdlib only).
- **PDF = print-ready page → browser "Save as PDF"** (zero dependencies, clickable links).
- **Clearly labelled sample data** for contacts, guides, reviews and photos.

Nothing is built until approval. Branch `feat/website-skeleton` off `main` (`56097d9`, which already holds all M0–M9 work). Note: `CONTEXT.md` is stale. It says the branches are awaiting merge, but they're on `main`; P1's context file fixes it.

**"Skeleton" here means:** every page, route, endpoint and data model is wired end to end and works on the Jaipur data. Placeholders are explicit where real data or features don't exist yet (AR, real photos and contacts).

## Revision: the backend is still in development (user, after the first review)
"Use this plan but don't take the backend as fully granted." So the plan is **contract-first, additive and decoupled**.

**1. Contract before code.**
- Each phase starts by writing its endpoints in `docs/api.md` (a "v2 website" section) as Pydantic request/response models in `backend/app/schemas.py`.
- The FastAPI OpenAPI schema is snapshotted to `docs/openapi.json`. A CI step fails if the schema changes without the snapshot being updated, so the frontend team is warned when the backend moves.

**2. Frontend doesn't depend on the backend being finished.**
- `frontend/src/api.ts` gets a **mock adapter** (`VITE_API_MOCK=1`): in-memory fixtures in `frontend/src/mocks/` that satisfy the same types. No new dependency.
- Every new page works in mock mode, and against the real backend once its endpoint lands.
- The types for new endpoints live in one file (`frontend/src/types.ts`), mirroring `schemas.py`.

**3. Backend changes are additive only.**
- New routers (`routes/auth.py`, `me.py`, `admin.py`, `trips.py`) are added via `app.include_router`.
- **Existing endpoints and `main.py` structure stay untouched** (the earlier idea of moving them into routers is dropped), which avoids churn against teammates' in-flight work.
- New engine logic lives in new modules (`engine/trip.py`, `engine/nearby.py`) that only call the existing *public* engine functions. Existing engine signatures don't change; new model fields are optional with defaults.

**4. Stub → real, per phase.**
- Each new endpoint first ships as a **schema-valid stub** (deterministic sample data, marked `"stub": true` in the response), so pages can be built.
- Its real logic replaces the stub within the same phase or a later one. A test asserts every endpoint's response validates against its schema, both as a stub and when real.

**5. Isolation.** Feature flag `WEBSITE_V2=1` (default on in dev) mounts the new routers, so the team can disable them if the backend is mid-refactor. The existing app (Explore / Provider) keeps working either way.

**Phase order is unchanged (P1 → P9).** Each phase's steps are now: contract + schemas → stubs + mocks → pages → real logic → tests → context file.

## What we reuse (not rebuild)
- **Engine** (`backend/app/engine/`):
  - `feasibility.check`, `travel_min`, `km_between`, `SPEED_KMH`
  - `rank.discover` (factors, reasons, group fairness `0.7·mean + 0.3·min`)
  - `itinerary.gaps/fill_gap/insert/plan/validate/upcoming`
  - `adapt.replan`, `learn.learn`, `confidence.with_ratings`
- `TravelerState.end_lat/end_lon` ("be back at the stay") and locked stops → multi-day plans and group-split rejoin points.
- `intent.claude_parse` + `llm_or_rules` → review sentiment (Claude with a rule fallback).
- `store._run` (SQLite, stdlib) and its `create table if not exists` pattern; `store.current_seed()` overlay.
- `/bookings` stub → "reserve a table" / "book" in hover cards.
- Frontend: `MapView.tsx`, `GroupEditor.tsx` (becomes the traveler editor), `api.ts` fetch helper, `styles.css` tokens.

## Architecture changes
- **Backend:** `main.py` stays as is; the new routers `backend/app/routes/{auth,me,admin,trips}.py` are included from it (see the revision above: additive only).
- **New modules:**
  - `backend/app/accounts.py`: users, sessions, profiles SQL + password hashing
  - `backend/app/trips.py`: trip storage + orchestration
  - `backend/app/engine/trip.py`: multi-day scoring and planning, pure
  - `backend/app/engine/nearby.py`: meals, quick stops, stays, guides, pure
  - `backend/app/reviews.py`: sentiment
- **Frontend:** `react-router` (the only new dependency). `App.tsx` (~420 lines) is split into pages under `frontend/src/pages/`, plus an `AuthContext` and `<RequireAuth role>` guards.
  - **Explore** (the current traveler screen) and **Provider** stay usable without login, so demo continuity holds.
  - **Trips require login.**

## Phases

### P1 — Accounts, authorisation, admin, profile shell (~1.5 d)
- **`accounts.py`:**
  - `hash_password`: `hashlib.scrypt`, random 16-byte salt; compared with `hmac.compare_digest`.
  - Sessions: `secrets.token_urlsafe(32)`, stored as sha256 with a 7-day expiry. Cookie `le_session`: HttpOnly, SameSite=Lax, Secure over https.
  - Tables: `users(id, email unique, password_hash, role: traveler|provider|admin, disabled, created)`, `sessions`, `profiles(user_id, json)`.
- **FastAPI dependencies:** `current_user` (401), `require_role(...)` (403).
- **CSRF:** mutating requests need the `X-Requested-With: le` header, on top of SameSite.
- **Login throttle:** 5 failures per email+IP per 15 min → 429. Passwords are never logged.
- **Admin bootstrap:** env `ADMIN_EMAIL` + `ADMIN_PASSWORD` creates or updates the admin at startup. **No default password in code**; `dev.py` prints a hint if unset.
- **Endpoints:**
  - `POST /auth/register|login|logout`, `GET /auth/me`
  - `GET/PUT /me/profile`, `PUT /me/password`, `GET /me/export` (all my data as JSON), `DELETE /me` (wipes account, profile, trips)
  - `GET /admin/users`, `PATCH /admin/users/{id}` (role, disable, set temporary password, which stands in for forgot-password since there's no email service), `GET /admin/stats`
  - Admin can pause any curated experience, replacing the `SEED_ADMIN_TOKEN` env (kept as a fallback).
- **Pages:**
  - `/login`, `/register`, `/profile` (details, password, export, delete account)
  - `/admin` (users table with role and disable controls, stats)
  - A header with a user menu
- Listings published while logged in record `owner_user_id`; the edit-token path still works.

### P2 — Onboarding (~0.5 d)
- **`Profile` model:**
  - display name, age, home city (used for tickets)
  - `interests: list[Tag]`, `dislikes: list[Tag]`
  - `accessibility: list[Access]`, walking limit (km), needs rest breaks
  - diet (veg / non-veg / vegan / jain), pace, budget style
  - preferred transport modes (walk / auto / bus / car), languages
  - `companions: list[TripTraveler]` (saved people)
- **`/onboarding`**, 4 short steps right after registering: About you → Likes & dislikes → Accessibility & pace → Travel style.
  - Every field is optional except the name.
  - Accessibility carries a clear "why we ask, who sees it (only you)" note and can be edited or deleted anytime.
- **Using the profile:**
  - Explore pre-fills the group member (interests, accessibility).
  - **Dislikes seed `state.learned` at −0.6** (reuses the learning loop; visible and forgettable).
  - Diet is a soft food filter (the `vegetarian` tag).
- **Privacy:** accessibility, age and diet never reach providers or admin views. Admin sees only email, role, status and dates.

### P3 — Trip model + "Plan a trip" wizard (~1 d)
- **`Trip`**, stored as JSON in a `trips(id, user_id, created, updated, json)` table:
  - title, destination (only **Jaipur** is enabled; others shown as "coming soon"), origin city, start/end date (≤ 7 days)
  - daily window (default 09:30–20:30), total budget, stay preference (type hotel/homestay/hostel/any, max per night, area or "near a must-see")
  - `travelers: list[TripTraveler]` (the Traveler fields + likes, dislikes, diet, is_me), `use_my_prefs_for_all`, `must_see: list[exp_id]`
  - `shortlist: dict[exp_id, "in_person"|"ar"|"skip"]`, `stay_id`, `itinerary: Itinerary` (stops carry datetimes, so one itinerary spans days), `splits: list[Split]`, `feedback: list[PlanFeedback]`
- **Wizard at `/trips/new`:**
  1. Where, when and budget
  2. Stay preference + number of people
  3. Travelers: name and age each, plus optional likes, dislikes and accessibility; **"Use my preferences for everyone"** copies the profile, still editable
  4. Must-sees (optional) + review
  Then "Find attractions".
- **`/trips`:** list, open, rename, delete.
- **Seed `stays.json`:** about 10 fictional stays (hotel / homestay / hostel) across neighbourhoods with price per night, accessibility flags, rating and sample contact.

### P4 — Scoring + shortlist (~1 d)
- **Multi-day scoring** in `engine/trip.py::score_candidates(trip, seed)`:
  - For each day it builds a trip-level `TravelerState` (group = trip travelers, window = that day, origin/end = stay, or city centre until a stay is chosen; budget = daily activity budget) and runs `check`/`discover`. An item is a candidate if feasible on ≥ 1 day.
  - Its score is the existing utility plus two new factors:
    - **`along_route`:** closeness to the path from the stay to the must-sees (point-to-segment km).
    - **`must_see`:** a pin bonus.
  - It returns a **per-mode travel table** (walk / auto / bus / car, in minutes) plus duration, cost and reasons.
- **Transport:** `feasibility.SPEED_KMH` gains `bus` (14 km/h + 10 min wait via `MODE_WAIT`), a small change. Scoring uses each trip's preferred mode.
- **Shortlist at `/trips/:id/shortlist`:** top ~15 cards with reasons and the travel table. Each card has **In person / AR preview / Skip**:
  - Skip goes through `learn()` (taste) and excludes the item.
  - **AR** is saved and shows a clearly marked "AR preview coming soon" placeholder (hooks into the parked immersive plan in the appendix). AR items aren't scheduled.
- **Stay recommendation:** once the shortlist is chosen, the top 3 stays are scored by price fit, accessibility match, type and **distance to the centroid of the in-person picks**; the user picks one.

### P5 — Itinerary builder: meals, quick stops, splits (~1.5 d)
- **`engine/trip.py::build_itinerary`:**
  - Per day, `plan()` from the stay back to the stay (`end_lat/lon`) using only in-person picks first (via a sub-seed), then the budget split per day.
  - Days are ordered so must-sees land on days where they're open.
  - Every day is checked with `validate`.
- **`engine/nearby.py`:**
  - `meal_suggestions`: lunch 12:30–14:30 and dinner 19:00–21:00. If there's no food stop, it offers the top 3 food experiences reachable from the neighbouring stops (reuses `fill_gap` with a food-only sub-seed), respecting diet.
  - `quick_stops`: ≤ 45 min, within 1 km of a planned stop, fits a gap (uses `insert`).
  - `guide_driver_suggestion`: suggests a driver when the group is ≥ 4, a senior or access need exists, or daily travel is over 60 min; a guide on heritage-heavy days.
  - `move_suggestions`: "Move X to day 2 morning: open then, 20 min less travel" (tries each unlocked stop in other days' gaps and keeps it if total travel drops).
- **Group splits:**
  - `Stop.who: list[str] = []` (empty means everyone).
  - `Split{day, start, end, rejoin (name, lat, lon), groups: [[traveler ids], …]}`.
  - Each subgroup is planned independently between the split start and a locked rejoin stop (`TravelerState` for the subset, end = rejoin point). Validation runs per lane.
  - **Auto-suggest** a split when the best shared option leaves one member unhappy (per-member fit < 0.2) while subgroup options fit > 0.6. The suggestion explains why ("the kids would love kite-making while the adults prefer Amer Fort: split 14:00–16:00, meet at …"). The user accepts, edits or dismisses it.

### P6 — Feedback loop (~0.5 d)
- After each (re)plan, the page asks **"Happy with this plan?"** with these options:
  - Too hectic: relaxed pace, one fewer stop a day, more slack
  - Too slow or too empty: packed pace, fill gaps
  - Too much travel: prefer walking, lower max distance
  - Too expensive: 15% lower daily target
  - More like / less like: a tag, via `learn`
  - Looks great
- Each choice adjusts the trip parameters and **replans only unlocked stops** (reusing `plan` and `adapt`). The before/after metrics are recorded in `trip.feedback`: stops per day, travel minutes, cost.
- **Honest naming:** it's an explicit preference-update loop, not a trained reinforcement-learning model. `ponytail:` a contextual bandit on accept rates later.

### P7 — Interactive itinerary page (~1.5 d)
- **`/trips/:id/plan`:** day tabs, a map with each day's route (reusing `MapView`), a timeline with lanes during splits, lock/remove/add, the feedback bar, and meal / quick-stop / move / split suggestions inline.
- **Hover (and keyboard-focus) card per stop:**
  - cost; duration; travel from the previous stop **by each mode**
  - booking (the `/bookings` stub, "Reserve a table" for food)
  - website and phone, guides serving that place (sample, labelled)
  - "AR preview" placeholder
  - **Reviews: a sentiment summary** (positive / mixed / negative, pros and cons, one line) plus 2 snippets
- **Data:**
  - `Provider` gains `website`, `phone`, `languages`, `sample_contact: bool` (rendered "(sample)").
  - Real monuments get only verifiable official info, otherwise left empty.
  - `guides.json`: sample guides and drivers (languages, day rate, areas).
  - `reviews` table: users can add short text with a rating, ≤ 280 chars.
  - `reviews.json`: **sample reviews, labelled "sample"**.
- **`reviews.py`:** `summarize(reviews)` uses `claude_parse` (schema: sentiment, pros, cons, summary) with a **lexicon + aspect-keyword rule fallback**. It's deterministic offline, cached per (experience, review count). There's no scraping of third-party reviews (terms-of-service and legal risk).

### P8 — Printable / PDF itinerary (~1 d)
- **`/trips/:id/print`:** an `@media print` layout with page breaks per day.
  - Cover: title, dates, travelers.
  - Per day: a timeline table with times, costs, travel mode, contacts as **clickable links**, and a route map (Leaflet with tiles; an SVG route sketch if offline).
  - Attraction images: free-licensed Wikimedia Commons photos in `backend/data/images/` with `docs/CREDITS.md`; placeholders until each is sourced.
  - **Getting there:** train and flight **search deep links** only (IRCTC, and a flights search URL with origin/destination/dates). No booking or scraping.
  - Guide and driver suggestions, stay details, credits.
- A **"Download PDF"** button calls `window.print()`; Chrome keeps the links clickable. The interactive page is the "show it interactively" version.

### P9 — Hardening, docs, context (~0.5 d)
- Update the docs: `api.md`, `decisions.md` (auth, privacy of sensitive fields, splits, feedback loop, sample-data policy), `demo.md` (a new "Plan a trip" flow), README, `CLAUDE.md` rules (auth patterns; never log passwords or sensitive profile fields).
- A context file per phase plus `CONTEXT.md` (also fixing the stale merge status).

**Total ≈ 9 working days.** With 5 people, backend (P1, P3–P6 engine) and frontend (pages) can run in parallel once P1's API contract is written.

## Verification
- **pytest** (temp DB per test; no network):
  - **Auth:** hash round-trip; wrong password; throttle → 429; expired or forged session → 401; traveler hitting `/admin` → 403; missing CSRF header → 403; admin bootstrap from env; `DELETE /me` removes profile and trips; `/me/export` completeness; admin views never include accessibility or age.
  - **Profile:** validation; dislikes seed `learned`.
  - **Trips:** CRUD is owner-only (another user gets 404).
  - **Engine:**
    - Every multi-day itinerary passes an **independent validator per day**, including start and end at the stay.
    - Must-sees are scheduled on open days.
    - Skip and AR items are never scheduled.
    - Meal suggestions are food-only, inside the window, and diet-respecting.
    - Each split lane validates and reaches the rejoin point.
    - "Too hectic" measurably reduces stops per day; "too expensive" lowers cost.
    - Bus travel time includes the wait.
    - Review summary fallback is deterministic.
  - **Existing 90 tests stay green** after the router split.
- **Frontend:** `npm run build` (type-check), and routes guarded (logged out → redirected to `/login`).
- **Browser (preview tools, local test accounts only):**
  - register → onboarding → profile; admin login (from env) → users table
  - Plan a trip: a 2-day Jaipur trip, family of 4 with "use my prefs for all" → shortlist (in person / AR / skip) → stay pick → itinerary with meals
  - Hover cards show mode times, sample contacts, sentiment
  - Accept a suggested split; "too hectic" → lighter day
  - Print view → Save as PDF (links clickable, map present)
  - 375 px layout
  - Reset `local.db` afterwards.

## Out of scope (explicit)
Real payments or bookings, real ticket or flight APIs, email verification and password-reset emails, OAuth, cities other than Jaipur, scraping third-party reviews, a real AR implementation (see the appendix).

## Risks
- **Scope size:** about 9 days. If the deadline is tight, ship P1 → P5 plus P8 first (accounts, onboarding, wizard, shortlist, itinerary, print); P6 and P7 details come next.
- **Sensitive data** (accessibility, ages): purpose shown, optional, owner-only, exportable and deletable, never logged or shown to providers or admins.
- **Sample data can be mistaken for real:** it's always labelled "(sample)" and never used for real monuments.

---
## Appendix — parked: immersive previews (Unity WebGL)
There's an earlier, unapproved plan for data-driven illustrative Unity WebGL scenes: 6 templates driven by listing facts, a pre-rendered 360 fallback, and the Unity CLI pipeline. It needs the user to install Unity Hub and sign in. It stays parked. This skeleton's "AR preview" buttons are the hook where it would plug in.
