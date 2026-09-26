# Context: Google Calendar Integration, User Account History, and Manual Stop Deletion

_Date: 2026-09-27 · Entry 21_

## What changed
1. **Google Calendar Integration Backend & Engine Adapter**:
   - Built `backend/app/engine/calendar_sync.py` to parse external Google Calendar API events into unmovable locked engine stops (`locked=True`) and format active itinerary stops into Google Calendar payloads.
   - Extended `backend/app/accounts.py` with `user_oauth_tokens` SQLite table to store user OAuth credentials and tokens.
   - Built `backend/app/routes/calendar.py` with endpoints for OAuth authorization URL generation, OAuth callback, connection status, inbound event syncing, outbound event pushing, and disconnection.
2. **Dynamic User Account History & Context Retention**:
   - Added `user_history` SQLite table in `backend/app/accounts.py` to record interactions, search queries, feedback, and stop deletions per user.
   - Built `get_user_context_summary()` to aggregate user learned taste weights and rejected experience IDs across sessions.
3. **Manual Stop Deletion & Instant Dynamic Replanning**:
   - Built `DELETE /trips/{id}/stops/{experience_id}` endpoint in `backend/app/routes/trips.py`.
   - Automatically marks deleted stop as skipped, updates shortlist, records negative sentiment for experience tags via `learn.learn()`, and dynamically replans remaining itinerary gaps.
4. **Documentation & OpenAPI Contract**:
   - Updated `README.md` and created `docs/NEW_FEATURES_IMPLEMENTATION.md` and `docs/MULTI_SOURCE_API_AND_YOUTUBE_PIPELINE.md`.
   - Updated `docs/openapi.json` snapshot with 41 paths.
5. **Testing**:
   - Added unit test suites `test_calendar.py`, `test_history.py`, and `test_stop_deletion.py`. 123 tests pass cleanly.

## Why
Users requested the ability to sync personal schedules with Google Calendar, remember user history and taste preferences dynamically across account sessions, and manually delete any model-suggested stop with instant schedule repair.

## Files touched
- `backend/app/accounts.py`
- `backend/app/schemas.py`
- `backend/app/main.py`
- `backend/app/routes/trips.py`
- `backend/app/engine/calendar_sync.py` (new)
- `backend/app/routes/calendar.py` (new)
- `backend/tests/test_calendar.py` (new)
- `backend/tests/test_history.py` (new)
- `backend/tests/test_stop_deletion.py` (new)
- `docs/openapi.json`
- `README.md`
- `docs/NEW_FEATURES_IMPLEMENTATION.md` (new)
- `docs/MULTI_SOURCE_API_AND_YOUTUBE_PIPELINE.md` (new)
- `docs/PROJECT_ANALYSIS_AND_CALENDAR_FEATURE.md` (new)

## Current state
- Branch `feat/calendar-history-stop-deletion` created.
- 123 pytest backend tests passing 100%.

## Known gaps
- Frontend UI button for Google Calendar connection can be wired to backend `/calendar/auth-url` and `/trips/{id}/calendar/sync-inbound`.

## How to proceed next
1. Merge `feat/calendar-history-stop-deletion` into `main` after review.
2. Wire frontend UI calendar status badge in `TripItineraryPage.tsx`.
