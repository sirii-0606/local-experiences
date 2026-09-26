# 2026-09-26-15 · Website v2, P3: trips dashboard and the "Plan a trip" wizard

## What changed
The user shared a UI brief (`trip-planner-ui-brief.md`, outside the repo) and chose: **the P3 screens first**, a **warm, editorial** feel, and **desktop-first but responsive**. They also installed a design skill. It didn't show up in this session, so the design follows the existing tokens plus the direction recorded in `decisions.md`.

**Backend** (additive; existing endpoints untouched):
- `app/schemas.py`: `TripTraveler` (a `Companion` plus `is_me`), `StayPref`, `TripDraft`, and `Trip`. The validator rejects a trip that ends before it starts, lasts more than 7 days (`MAX_TRIP_DAYS`), or has a day that ends before it starts. There are 1–12 travelers and up to 20 must-sees. The destination is `Literal["jaipur"]`.
- `app/accounts.py`: a `trips` table (id, user_id, created, updated, json) and owner-scoped `list_trips`, `get_trip`, `create_trip`, `update_trip` and `delete_trip`. Account delete wipes trips, and export includes them.
- `app/routes/trips.py`: `GET/POST /trips` and `GET/PUT/DELETE /trips/{id}`. Unknown must-see ids return 422, and another user's trip returns 404. Mounted in `main.py`'s v2 block.
- `docs/openapi.json` was regenerated (29 paths). `tests/test_trips.py` covers CRUD and sort order, owner isolation and 401, validation and CSRF, and export plus delete.

**Frontend:**
- `pages/TripsPage.tsx` (`/trips`): the dashboard.
  - An editorial hero and Upcoming / Past sections, split by the **demo clock**.
  - Trip cards with a CSS postcard cover, a status ("In 7 days", "Happening now", "Travelled"), traveler initials and the budget.
  - Open, inline rename (Enter saves, Esc cancels) and delete (with a confirm).
  - An empty state, and a "trip saved, the shortlist is next" note with the saved card highlighted.
  - Exports the shared helpers `Postcard`, `dateRange`, `tripDays`, `inr`, `toDraft` and `msg`.
- `pages/TripWizard.tsx` (`/trips/new`, and `/trips/:id` to edit), with 4 steps:
  1. Where & when: city cards (Jaipur live, 3 "coming soon"), dates with a days/nights hint, the daily window, budget with a per-person-per-day hint, origin, and an auto-title ("Jaipur in October") until you type your own.
  2. Stay: type cards, price cap, area.
  3. Who's coming: traveler cards with name, age, food and access needs, plus tri-state like/dislike chips over the tag vocabulary. "Use my preferences for everyone" and quick-add from saved companions.
  4. Must-sees & review: a chip picker from `/catalog` and a summary with Edit links.
  - A sticky live postcard + "ticket" summary on the right. The stepper lets you jump back.
  - Edit mode unlocks every step and puts "Save changes" on each one.
  - Client-side problems mirror the server's rules.
- `v2api.ts`: `trips`, `trip`, `createTrip`, `updateTrip`, `deleteTrip`, plus `catalog` (the real `/catalog`, or a fixture in mock mode). `mocks/v2.ts` has in-memory trips with the same rules and a 12-experience catalog slice (real seed ids).
- `types.ts`: the trip types and `MAX_TRIP_DAYS`. `App.tsx`: the new routes, signed-in only.
- Design:
  - `index.html` loads **Fraunces** (Google Fonts; falls back to Georgia offline), and `--serif` is a token. The header brand uses it too.
  - `styles.css` has a new "trips (P3)" section: display type, postcards, cards, stepper, choice cards, traveler cards. It works in dark and light, and down to 375px.

## Why
P3 is the next phase in the plan, and the user wanted the trip-planner screens from their brief built in a warm editorial style. Trips are the backbone for P4–P6 (shortlist, stays, itinerary), so the contract and storage come first and stay additive.

## Files touched
`backend/app/{schemas,accounts,main}.py`, `backend/app/routes/trips.py`, `backend/tests/test_trips.py`, `docs/{openapi.json,api.md,website-v2-plan.md}`, `docs/ideation/decisions.md`, `frontend/index.html`, `frontend/src/{App,types,v2api,styles}.*`, `frontend/src/mocks/v2.ts`, `frontend/src/pages/{TripsPage,TripWizard}.tsx`, `CONTEXT.md`

## Current state
- Backend: **109 pass**, 1 skipped (live LLM). Ruff is clean. The frontend `npm run build` passes in both normal and mock mode.
- **Browser, against an isolated backend on :8001 with a scratch DB and the UI on :5174** (your `local.db` was never touched; the scratch DB was deleted afterwards):
  - The empty state shows. The full wizard ran with a homestay, a second traveler, "use my preferences" copying a like, a dislike and wheelchair access, and 2 must-sees. The saved trip matched the server byte for byte.
  - Rename persisted, and Upcoming/Past split correctly. Edit mode loads normalised times, and "Save changes" from step 1 persisted. `/trips/999` shows "no such trip" with a way back.
  - Checked in dark and light at 1366px, and at 375px with no horizontal overflow.
- **Mock mode on :5175:** register → wizard (mocked must-sees) → save → dashboard.
- Local-only `.claude/launch.json` (gitignored) gained `backend-scratch`, `frontend-scratch` and `frontend-mock` configs for this kind of isolated check.

## Known gaps
- **There's no shortlist yet.** Saving a trip ends at the dashboard with a "next update" note (P4).
- `stays.json` moved to P4. The stay step records preferences only.
- Profile preferences are still thin until **P2 onboarding** lands, so "Use my preferences" copies whatever the "You" traveler holds (seeded from the profile).
- The Google Fonts request sends the visitor's IP to Google. To avoid that, self-host the font file later.
- The P1 header nav wraps awkwardly at phone width ("Plan a trip" breaks onto two lines). It's pre-existing and outside this change.
- The mock catalog is a 12-item slice. The mock doesn't check must-see ids.

## How to proceed next
1. Restart `python scripts/dev.py` (the backend needs the new `/trips` router), then sign in and try `/trips`.
2. **P4:** `engine/trip.py::score_candidates` (multi-day `TravelerState` per day, the `along_route` and `must_see` factors, a per-mode travel table), `/trips/{id}/shortlist` with In person / AR / Skip, `stays.json` and the top-3 stay pick. Add `shortlist` and `stay_id` to `TripDraft` as optional fields, then regenerate the snapshot, types and mock.
3. **Or P2 onboarding** first, if the team wants richer profiles feeding "Use my preferences".
