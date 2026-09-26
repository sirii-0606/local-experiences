# Any city, right now: open data, live context, profile context, calendar

## What changed
- **Any city in India** (`backend/app/opendata.py`): the named place is geocoded (Open-Meteo/GeoNames); places within 15 km come from Wikidata by type (Wikipedia GeoSearch as fallback) and become ordinary `Experience`s, merged with curated/provider supply within 40 km (curated wins over duplicates). Unknown hours/prices = typical values per kind of place with new `estimate` evidence, so they're always flagged. Heritage designations (ASI, state, municipal) = verified government-listed providers. Stations/airports are kept as landmarks. SQLite cache (`cache`, `areas` tables): Wikidata 14 days, Wikipedia fallback 1 hour then retried. `scripts/warm_places.py` pre-fetches demo cities.
- **Live context in `/chat`**: location (text > device `lat/lon` > previous > profile home city > Jaipur with a note), live weather at that place for the window (becomes `state.weather` unless stated), a time-of-day traffic estimate (Mon–Sat rush ×1.5 in `travel_min`), "before my train/flight" → back at a station/airport by the cutoff, `closed_now` (good matches ruled out only by the clock, with `next_open`), and `assumptions`. All in the new `ChatResponse.context`.
- **Parser fixes** found by tracing the two scenarios: "iam 76 years old" was a 76-year-old *child*; "not any other park" was an intent; "skipped the nightlife" was a like. New: `place_name`, `my_age`, `avoid`, `with_companions`, `return_to`, `budget_hint`, "it's 6 pm", beach keywords, church/mosque/gurdwara → spiritual.
- **Dislikes are hard constraints** (`TravelerState.avoid`, "you'd rather skip X") unless asked for. **Intent matches rank before non-matches** in the MMR pass.
- **Profile context ("RAG")**: `user_context` table + `app/personal.py`. Onboarding questionnaire `GET /me/onboarding`; profile + learned weights + saved trips build the signed-in starting state (companions when "with my family", relaxed pace at 70+); chats/feedback/imported itineraries update it; `GET/POST/DELETE /me/context…`. Summary goes to the LLM as background only. Profile gained `avoid_crowds`, `hidden_gems`.
- **Calendar**: `POST /calendar/export` → `.ics` with "leave now" alarms (travel time at that hour + 15 min) and Google Calendar links.
- **Providers anywhere**: `ListingDraft.lat/lon/area`; drafts outside Jaipur get geocoded; `fits` (traveler segments) in drafts and insights.
- Weather is location-aware; Jaipur climatology is only used for Jaipur (elsewhere: "unavailable", never invented).
- Contract: `docs/openapi.json`, `docs/api.md`, `frontend/src/types.ts`, `api.ts`, `v2api.ts`, mock. No UI changes.

## Why
The user's scenarios (a 76-year-old heritage lover at 6 PM in Pune; a student with 4 hours in Mumbai before a train) are examples of the core promise: work wherever the traveler is, from their context, without making things up. The backend was Jaipur-only.

## Files touched
`backend/app/{opendata,personal}.py` (new), `backend/app/routes/calendar.py` (new), `backend/app/{main,intent,models,provider,schemas,store,accounts,weather}.py`, `backend/app/routes/me.py`, `backend/app/engine/{feasibility,itinerary,adapt,rank,confidence}.py`, `backend/tests/test_anywhere.py` + `tests/fixtures/*` (real Pune/Mumbai responses), `tests/{conftest,test_feedback,test_weather}.py`, `scripts/warm_places.py`, `frontend/src/{types,api,v2api}.ts`, `frontend/src/mocks/v2.ts`, `docs/{api.md,openapi.json}`, `docs/ideation/decisions.md`, `CONTEXT.md`.

## Current state
- Backend: 130 passed, 1 skipped (live LLM); ruff clean; frontend `npm run build` clean.
- Both scenarios verified against live data on the running server (rule parser, no LLM key here):
  - Pune 18:00, age 76, family, heritage, "not any park": 5 open heritage sites (ASI/municipal-listed), no parks; Shaniwar Wada, Aga Khan Palace, Kelkar Museum reported closed → open tomorrow 09:00/10:00; plan validates; calendar reminders correct.
  - Mumbai 14:00, student, 4 h, train, beach + view: Mahim Beach, Versova Beach, Bandstand Promenade...; back at Bandra Terminus by 18:00; ₹600 budget; plan validates.
- `backend/data/local.db` has Pune and Mumbai cached from Wikidata.

## Known gaps
- Open-data hours/prices are typical values (flagged). Coverage = Wikidata's (e.g. no Juhu Beach item typed as a beach; "Kabootar Khana" is mis-described as a lake). Curated data and provider listings fill gaps.
- Wikidata's public endpoint can be limited to 1 query/min: a second new city within a minute gets the weaker Wikipedia fallback for up to an hour. Warm demo cities first.
- Traffic is an estimate, not live. Weather applies to the whole window.
- Google Calendar: no direct account sync (needs an OAuth client); .ics + links only.
- Multi-day trips (`/trips`) are still Jaipur-only (`TripDraft.destination`).
- Review verification ("AI slop" engine): waiting for the user's instructions. AR untouched.
- UI doesn't show `context`, onboarding, profile context or calendar yet.

## How to proceed next
1. User's verification-engine instructions → build it (reviews/evidence).
2. UI phase: landing page (no Jaipur), onboarding from `/me/onboarding`, profile "context" section, `context` panel in Explore (closed-now, assumptions, weather), "Add to calendar", `/catalog?lat&lon` for non-Jaipur cards.
3. Optional: Google OAuth calendar sync; `/trips` for any city.
