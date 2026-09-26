# 2026-09-26-17: Website v2 P4 & P5 — Multi-Day Scoring, Shortlist, Stays & Itinerary

## What changed
- **P4 — Multi-Day Candidate Scoring & Stays**:
  - `backend/data/seed/stays.json`: 10 curated stay options across Jaipur (heritage havelis, boutique hotels, homestays, hostels) with pricing, coordinates, ratings, and accessibility tags.
  - `backend/app/engine/feasibility.py`: Added `"bus"` (14 km/h + 10m wait) to `SPEED_KMH` and `travel_times_by_mode()` helper.
  - `backend/app/engine/trip.py`: Implemented `score_candidates(trip, seed)` with multi-modal travel time estimation (walk, auto, bus, car), along-route distance scoring to must-sees, and `score_stays(trip, seed, shortlist)` scoring stays based on geographic centroid of in-person activity picks, budget, and accessibility.
  - `frontend/src/pages/TripShortlist.tsx`: Interactive candidate cards with *In Person*, *AR Preview*, and *Skip* 3-way selectors, travel time comparison badges, and top-3 stay recommendations.
- **P5 — Multi-Day Itinerary Builder & Nearby Enhancements**:
  - `backend/app/engine/trip.py::build_itinerary(trip, seed)`: Generates multi-day schedules starting & ending at the selected stay, respecting daily windows, budgets, and open days.
  - `backend/app/engine/nearby.py`: Meal suggestions for lunch (12:30–14:30) and dinner (19:00–21:00), quick stops (≤45m en-route), private driver & certified guide recommendations, and automatic group split suggestions.
  - `frontend/src/pages/TripItineraryPage.tsx`: Day-by-day interactive timeline tabs, map view with active day's stops, transport/guide suggestions, and group split accept/reject controls.
- **API & Contract**:
  - Added endpoints `/trips/stays`, `/trips/{id}/candidates`, `/trips/{id}/stays/recommendations`, `/trips/{id}/itinerary/generate`, and `/trips/{id}/suggestions`.
  - Regenerated `docs/openapi.json` (34 paths) and synced `frontend/src/types.ts` & `frontend/src/mocks/v2.ts`.

## Why
- Implements Phases 4 & 5 of the Website v2 roadmap, enabling travelers to curate their candidate activities (physical vs virtual AR preview), choose proximity-optimal stays, and review an auto-planned multi-day itinerary with meals and group splits.

## Files touched
- `backend/app/engine/feasibility.py`
- `backend/app/engine/trip.py`
- `backend/app/engine/nearby.py`
- `backend/app/models.py`
- `backend/app/schemas.py`
- `backend/app/seed.py`
- `backend/app/store.py`
- `backend/app/routes/trips.py`
- `backend/data/seed/stays.json`
- `backend/tests/test_trip_p4_p5.py`
- `docs/openapi.json`
- `frontend/src/App.tsx`
- `frontend/src/types.ts`
- `frontend/src/v2api.ts`
- `frontend/src/mocks/v2.ts`
- `frontend/src/pages/TripWizard.tsx`
- `frontend/src/pages/TripsPage.tsx`
- `frontend/src/pages/TripShortlist.tsx`
- `frontend/src/pages/TripItineraryPage.tsx`

## Current state
- Backend tests: 116 tests passing (1 skipped: live LLM network test), 0 failing.
- Frontend: `npm run build` passes with zero type errors.
- Both real backend and in-memory mock mode (`VITE_API_MOCK=1`) support the full wizard -> shortlist -> itinerary flow.

## Known gaps
- P2 (Onboarding flow at `/onboarding`) to pre-populate companion preferences into the wizard.
- P6 feedback adjustment loop ("too hectic", "too expensive") on the interactive itinerary.
- P8 printable PDF page layout.

## How to proceed next
- Proceed with Phase 2 (Profile onboarding & preference syncing) or the next feature requested by the user.
