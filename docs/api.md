# API

The API is a thin, **stateless** wrapper over the engine. The server keeps no session. The client holds `state` (the traveler's situation) and `itinerary`, and sends them back on each call. The full JSON schema is live at **`http://localhost:8000/docs`** when the server is running. This page covers the shapes and the intended flow.

```bash
cd backend && .venv/Scripts/python -m uvicorn app.main:app --reload
```

**Frontend dev (M6/M7):** proxy the API through Vite instead of adding CORS. For example, `server.proxy: { "/api": { target: "http://localhost:8000", rewrite: p => p.replace(/^\/api/, "") } }`.

## Intent parser (`/chat`)
| `INTENT_PARSER` | Behaviour |
|---|---|
| `auto` (default) | Uses Claude if `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_PROFILE` is set, otherwise the rule parser |
| `llm` | Always tries Claude first (e.g. after `ant auth login`) |
| `rules` | Offline regex/keyword parser only. The tests use this. |

- **Claude settings:** model `claude-opus-5` with structured output (`ParsedRequest`), `effort: low`, and server-side refusal fallback (`fallbacks: "default"`).
- **Failure handling:** any failure (auth, network, refusal) silently falls back to the rule parser. The response's `parser` field tells you which one ran.
- **Claude only extracts.** Ranking, feasibility and explanations always come from the engine.

## Endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/` | none | Redirects to `/docs`, the interactive API docs |
| GET | `/health` | none | `{ok, experiences}` |
| GET | `/catalog?lat=&lon=` | none | `{places[], providers[], experiences[], provider_listings[], paused[], vocabulary{tags, categories, accessibility}}`, i.e. everything the map and provider views need. Without `lat`/`lon`: the curated Jaipur seed. With them: what's offered around that point, in any city (see "Any city" below). |
| POST | `/chat` | `{text, state?, now?, lat?, lon?}` | `{parser, parsed, state, recommendations[], excluded{}, plan{itinerary, problems[]}, context}`. `lat`/`lon` = the device's location, if shared. `context` = `{location, location_source: text\|device\|previous\|profile\|default, lat, lon, data_source, places_considered, weather{available, condition, temp_c, rain_chance, applied}, traffic, closed_now[{experience_id, title, why, next_open, hours_confirmed}], assumptions[], profile_used}`. Signed in (cookie), the profile and learned context shape the starting state and each message nudges that context. |
| POST | `/discover` | `{state, k?=5}` | `{recommendations[], excluded{}}` |
| POST | `/plan` | `{state, itinerary?, max_new?=3, add?}` | `{itinerary, problems[]}`. It fills gaps around existing stops; locked stops never move. `add` is an experience id: the engine fits it into the earliest feasible gap, or returns **409** with a readable `detail` if it fits nowhere. |
| POST | `/events` | `{state, itinerary, event}` | `{itinerary, state, changes[], problems[]}` |
| GET | `/weather?at=ISO&lat=&lon=` | none | `{available, hour: {at, condition: rain\|heat\|clear, temp_c, precip_mm, precip_prob}}`. Live Open-Meteo data for that place (Jaipur centre by default); `available: false` when offline. |
| POST | `/calendar/export` | `{state, itinerary}` | `{ics, events[{title, start, end, remind_min, reminder, google_url}]}`. The approved plan as an `.ics` file (import into Google/Apple/Outlook) whose reminder fires when it's time to leave (travel time from the previous stop at that hour + 15 min), plus a one-click "add to Google Calendar" link per stop. Times in the file are UTC. |
| POST | `/context/check` | `{state, itinerary, now}` | `{available, risks[{stop, condition, message}], proposed: ContextEvent\|null}`. Finds upcoming outdoor, weather-sensitive stops that overlap forecast rain or heat. It **proposes** a weather event and never applies it; send `proposed` to `/events` if the traveler agrees. |
| POST | `/feedback` | `{state, feedback: {experience_id, kind: accept\|reject\|skip, reason?, at}}` | `{state, recommendations[], excluded{}}`. Reject hides the item (`state.rejected`). Only `not_interested` (strong) or no reason (weak) change `state.learned`; price, distance and time reasons don't. Keep the returned `state`. |
| POST | `/feedback` (rating) | `{state, feedback: {experience_id, kind: "rating", rating: 1-5, as_described?, at}}` | Post-visit rating. It updates the rating and review count. When most visitors say it was as described, their latest visit becomes **traveler evidence** for hours and price, so confidence rises and the ⚠ badge can clear. It never replaces a verified check. Returns re-ranked recommendations. |
| POST | `/bookings` | `{state, itinerary, experience_id}` | `{code, experience_id, start, people, itinerary}`. A **stub** with no payment: it holds spots for a stop already in the plan and marks it confirmed and locked. **409** with a readable reason if the stop doesn't validate or the start time is full (capacity minus booked people). |
| DELETE | `/bookings/{code}` | none | Cancels a booking and frees its spots. **404** if the code is unknown. |
| POST | `/providers/draft` | `{text}` | `{parser, draft: ListingDraft, fits[]}`. Free text becomes an editable draft; nothing is saved. Outside the curated city, the area it names is geocoded into `draft.lat/lon/area`. `fits` = the traveler segments it suits ("families with kids", "students and budget travelers", ...). |
| POST | `/providers/listings` | `{draft, today?}` | `{provider, place, experience, edit_token}`. **Keep `edit_token`:** it's shown only once and is needed to edit, pause or remove the listing (the web app keeps it in the browser's localStorage). Validates the reviewed draft and publishes it. A bad draft returns **422** with a readable `detail` (no known landmark and no pin, a pin outside India, hours shorter than the experience, no tags, no days). A listing can be pinned anywhere with `lat`/`lon` (+ `area`); it's then offered to travelers within 40 km. |
| POST | `/providers/availability` | `{experience_id, paused}` + header `X-Provider-Token` for provider listings | Pauses or resumes an experience. A provider listing needs its edit token (**403** otherwise). Curated seed experiences are open in the demo; set `SEED_ADMIN_TOKEN` to lock them. |
| GET | `/providers/listings/{id}` | none | `{draft}`: a provider listing as an editable draft |
| PUT | `/providers/listings/{id}` | `{draft, today?}` + `X-Provider-Token` | Edits in place (same id). **403** without the token. |
| DELETE | `/providers/listings/{id}` | `X-Provider-Token` | Removes the listing, its owner record and any pause |
| GET | `/providers/insights/{experience_id}` | none | Aggregate demand: `fits` (segments), `booked_people`, `rating`, `review_count`, `accepted`, `passed`, `matching_searches`, `shown`, `shown_to_matching`, `why_not_chosen[[reason, n]]`, `tips[]`, `start_hours`, `budget_per_person`, `with_kids`, `also_wanted`, `paused` |

Unknown experience ids return `422`. An empty `problems` means the whole plan is feasible.

**Storage:** provider listings, pauses and the demand log live in SQLite (`backend/data/local.db`, gitignored; override the location with `DB_PATH`). Delete the file to reset a demo. `/chat` logs **aggregates only**: start hour, duration, budget, group size, kids yes/no, intents, which ids were shown, and exclusion reasons. It never logs location or the chat text.

## Any city: open data (`app/opendata.py`)
- **Where:** the place the traveler names ("in Pune", geocoded with Open-Meteo/GeoNames, India only), else the device location, else the previous turn, else the profile's home city, else Jaipur with a note in `context.assumptions`.
- **What's there:** places within 15 km from **Wikidata** (typed: museum, fort, palace, temple, beach, promenade, viewpoint, park, zoo, market, station, airport...), or **Wikipedia GeoSearch** when Wikidata is busy (its public endpoint can be limited to 1 query/min). Cached in SQLite: Wikidata for 14 days, a Wikipedia fallback for an hour. Curated and provider supply within 40 km is merged in and wins over duplicates.
- **Honesty:** these sources have no hours or prices, so both are the typical values for the kind of place, with `estimate` evidence: always low confidence, shown as "⚠ hours: typical for this kind of place, not confirmed". A heritage designation (ASI Monument of National Importance, state protected, municipal list) makes the site a verified, government-listed provider.
- **Context:** live weather at the traveler's location for their window becomes `state.weather` unless they said otherwise. Traffic is a time-of-day estimate (Mon–Sat 8–11 and 17–21: road travel ×1.5), not a live feed. "Before my train/flight" plans the way back to a station/airport (one named in the text, else the best-known within 12 km).
- **Warm-up for demos:** `backend/.venv/Scripts/python scripts/warm_places.py Pune Mumbai` fetches each city once, 65 s apart. `LIVE_DATA=0` turns all network use off (tests).

## Flow for the traveler UI
1. **First message.** Call `POST /chat {text, now?}`, then render `recommendations` (cards and map pins, using `lat`/`lon`), `plan.itinerary` (timeline) and, optionally, `excluded` (a "why not X?" panel). **Keep `state` and `plan.itinerary`.**
2. **Refinement.** Call `POST /chat {text: "actually, something less crowded", state}`. It merges into the previous state: anything the text doesn't mention stays as it was.
3. **User edits the plan.**
   - To lock or remove a stop, send the edited itinerary to `POST /plan` with `max_new: 0`. That re-checks the plan without adding anything.
   - To add a recommendation, send `add: <experience_id>`. Don't insert it at the recommendation's own time yourself; that time ignores the rest of the plan.
   - To let the engine fill free time, send `max_new: 3`.
4. **Something changes** (demo buttons: delay, rain, closure, tired, budget). Call `POST /events {state, itinerary, event}`, show `changes` as a diff, then **replace your `state` and `itinerary` with the response's.**

## Key shapes (abridged; the full schema is at `/docs`)
```jsonc
// TravelerState
{ "lat": 26.9239, "lon": 75.8267,
  "window_start": "2026-09-26T16:00:00", "window_end": "2026-09-26T18:00:00",  // naive IST
  "budget_inr": 1500,                                   // whole group
  "group": [{"name": "adult1", "age": 30, "interests": [], "accessibility": []}],
  "intents": ["local-food", "heritage"],                // closed Tag vocabulary, see models.py
  "mode": "auto", "pace": "normal", "indoor_only": false, "max_distance_km": null,
  "avoid_crowds": false, "novelty": 0.15, "weather": "clear",
  "end_lat": null, "end_lon": null }                    // where you must be by window_end

// Recommendation (a real /chat response, scenario A)
{ "experience_id": "ex-puppet-show", "title": "Kathputli puppet show", "score": 0.68,
  "lat": 26.897, "lon": 75.8107, "start": "2026-09-26T17:00:00", "end": "2026-09-26T17:45:00",
  "km": 3.4, "travel_min": 25, "cost_inr": 400, "confidence": 0.48, "low_confidence": true,
  "factors": {"preference": 0.6, "intent": 1.0, "...": 0},
  "reasons": ["3.4 km away, ~25 min by auto", "17:00–17:45, done before your 18:00 cutoff",
              "₹400 for 4, within your ₹1500 budget", "matches performance, kids",
              "run by a local community host", "⚠ price not independently confirmed"] }

// excluded
{ "ex-hawa-mahal": ["no time left to fit its 45 min after you arrive at 16:00 (open 09:00–16:30)"] }

// Stop (itinerary.stops[])
{ "title": "Kathputli puppet show", "experience_id": "ex-puppet-show", "lat": 26.897, "lon": 75.8107,
  "start": "...", "end": "...", "status": "proposed", "locked": false, "cost_inr": 400 }
// status: proposed | confirmed | active | completed | skipped | replaced (hide "replaced" in the UI)

// ContextEvent (POST /events)
{ "kind": "delay", "at": "2026-09-26T16:05:00", "delay_min": 40 }
{ "kind": "weather", "at": "...", "weather": "rain" }                 // rain | heat | clear
{ "kind": "closure", "at": "...", "experience_id": "ex-jantar-mantar" } // or provider_cancel
{ "kind": "fatigue", "at": "..." }
{ "kind": "budget_change", "at": "...", "budget_inr": 300 }            // left for unlocked plans ahead

// Change (events response changes[])
{ "action": "replaced", "stop": "Jantar Mantar observatory", "reason": "outdoors, and it's raining",
  "new_stop": "Hawa Mahal: Palace of Winds at 13:45", "why": ["0.4 km away, ~12 min by auto", "..."] }
// action: retimed | replaced | dropped | at_risk (a locked stop that broke; shown, not moved)
```

## Demo reproducibility
Pass `"now": "2026-09-26T15:30:00"` to `/chat` so the scenarios in `docs/ideation/mvp-scope.md` behave the same way every time. The seed's one-off events are on 2026-09-27 and 2026-10-03.

## v2 website: accounts, profile, admin (P1), trips (P3)
Contract-first: request and response models are in `backend/app/schemas.py`, mirrored in `frontend/src/types.ts`. The full schema snapshot is **`docs/openapi.json`**. `tests/test_contract.py` fails if the backend changes without it, so regenerate with `backend/.venv/Scripts/python scripts/openapi_snapshot.py` and tell the frontend team. The frontend can run against an in-memory mock with `VITE_API_MOCK=1`, and against any backend with `API_TARGET=http://host:port`.

**Auth:** an HttpOnly `le_session` cookie (7 days, SameSite=Lax). Every write needs the header **`X-Requested-With: le`** (CSRF guard; `frontend/src/api.ts` sends it). 401 means not signed in, and 403 means the wrong role or a missing header. `WEBSITE_V2=0` unmounts all of these routes.

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/register` | `{email, password (8–128), display_name}` | 201 `User`, signed in. 409 if the email exists. |
| POST | `/auth/login` | `{email, password}` | `User`. 401 on wrong credentials (the same message either way), 403 if disabled, **429** after 5 failures per email+IP in 15 min |
| POST | `/auth/logout` | none | 204 |
| GET | `/auth/me` | none | `User {id, email, role, display_name, created, onboarded}`, or 401 |
| GET / PUT | `/me/profile` | `Profile` | Onboarding data: interests, dislikes, accessibility, diet, pace, transport, companions… **Owner-only.** GET returns a blank starting profile before onboarding. |
| PUT | `/me/password` | `{current_password, new_password}` | 204. Signs out your other devices. |
| GET | `/me/export` | none | Everything we hold about you (never the password hash) |
| DELETE | `/me` | `{password}` | 204. Deletes the account, profile and sessions. 409 if you're the last admin. |
| GET | `/me/onboarding` | none | `Question[] {id (the Profile field), text, kind: number\|text\|single\|multi\|bool\|companions, options[], max_choices, why}`: the questionnaire after sign-up. Answers are saved with `PUT /me/profile`. |
| GET | `/me/context` | none | `ProfileContext {entries[{tag, weight -1..1, source, updated}], from_trips[], summary}`: what the planner has learned (chats, feedback, imported itineraries, saved trips). **Owner-only**; the summary is what the LLM gets as background. |
| POST | `/me/context/import` | `{text}` | `ProfileContext`. A past itinerary in your own words ("Goa: Old Goa churches, the fort, beach sunsets; skipped the nightlife") → likes +0.3, dislikes −0.4. 422 if nothing usable. |
| DELETE | `/me/context/{tag}` · `/me/context` | none | 204. Forget one learned tag, or all of it. |
| GET | `/admin/users` | none | `AdminUserRow[]`: **account facts only, never profile data** |
| PATCH | `/admin/users/{id}` | `{role?, disabled?, temp_password?}` | Disabling or resetting signs that user out. The last admin can't be demoted or disabled (409). `temp_password` stands in for "forgot password" (there's no email service yet). |
| GET | `/admin/stats` | none | `{users, admins, providers, disabled, active_sessions, provider_listings}` |

**Admin account:** set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (8+ characters) in the backend's environment. The account is created, or promoted, on the first admin sign-in. There's no default admin password anywhere in the code.

### Trips (P3)
Signed-in only (401 otherwise). A trip is private to its owner: another user's trip id answers **404**, never 403. Writes need `X-Requested-With: le`.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/trips` | none | `Trip[]`, sorted by start date |
| POST | `/trips` | `TripDraft` | 201 `Trip` |
| GET | `/trips/{id}` | none | `Trip`, or 404 |
| PUT | `/trips/{id}` | `TripDraft` | `Trip` (a full replace; rename = PUT with a new title), or 404 |
| DELETE | `/trips/{id}` | none | 204, or 404 |

**`TripDraft`:** `{title (1–80), destination: "jaipur", origin_city?, start_date, end_date, day_start = "09:30", day_end = "20:30", budget_inr (total, for the whole group), stay: {type: any|hotel|homestay|hostel, max_per_night_inr?, area?}, travelers: TripTraveler[1–12], use_my_prefs_for_all, must_see: experience_id[≤20]}`. `TripTraveler` is a `Companion` plus `is_me`. **`Trip`** = `TripDraft` + `{id, created, updated}`.

**422 when:** the trip ends before it starts, lasts more than 7 days, a day ends before it starts, there are no travelers, the destination isn't Jaipur, or a must-see id isn't in the catalog. `/me/export` includes trips; `DELETE /me` deletes them. The shortlist, stay pick, itinerary, splits and feedback arrive as optional fields in P4–P6, so saved drafts stay valid.

