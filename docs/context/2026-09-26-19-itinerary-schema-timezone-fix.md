# Itinerary Schema Field & Timezone-Safe Generation Fix

## What changed
1. **Pydantic Schema & Persistence Fix (`itinerary` on `TripDraft` & `Trip`)**:
   - `backend/app/schemas.py`: Added `itinerary: Itinerary | None = None` to `TripDraft` (inherited by `Trip`). Previously, when `accounts.update_trip()` validated the dictionary with `TripDraft.model_validate()`, the `itinerary` key was dropped as an unmodeled field, preventing the multi-day schedule from saving to the SQLite database and causing empty itinerary responses.
   - Updated `docs/openapi.json` via `scripts/openapi_snapshot.py` to maintain OpenAPI contract synchronization.
2. **Timezone-Independent Date Parsing & Rendering**:
   - `frontend/src/pages/TripItineraryPage.tsx`: Replaced `new Date(string).toISOString()` logic with timezone-safe local date decomposition (`getDaysBetween` and `formatDayLabel`). This avoids 1-day shifts when comparing ISO stop timestamps across different browser timezones.
   - Added instant generation action button (`⚡ Generate Itinerary Now`) directly within empty day states so travelers can plan without backtracking.
3. **Mock Mode Synchronization**:
   - `frontend/src/mocks/v2.ts`: Updated `mockV2.generateItinerary()` to use timezone-safe dates and prioritize the user's shortlisted `in_person` attractions across trip days.
4. **End-to-End Test Verification**:
   - `backend/tests/test_trip_p4_p5.py`: Added assertions to `test_trip_endpoints_e2e` verifying that `POST /trips/{id}/itinerary/generate` returns populated stops and subsequent `GET /trips/{id}` retains the saved itinerary.

## Files touched
- `backend/app/schemas.py`
- `backend/tests/test_trip_p4_p5.py`
- `docs/openapi.json`
- `frontend/src/pages/TripItineraryPage.tsx`
- `frontend/src/mocks/v2.ts`
- `docs/context/2026-09-26-19-itinerary-schema-timezone-fix.md`
- `CONTEXT.md`

## Current state
- Backend: 116 tests passing (115 passed, 1 skipped).
- Frontend: TypeScript clean build (`tsc --noEmit && vite build`).
- Multi-day itinerary generation and retrieval verified end-to-end.
