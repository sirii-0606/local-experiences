# Current Context

_Last updated: 2026-09-27 · latest entry: [docs/context/2026-09-27-21-google-calendar-history-stop-deletion.md](docs/context/2026-09-27-21-google-calendar-history-stop-deletion.md)_

## Where we are
- **`main` has everything through M9 & Website v2 P1–P5.**
- **Feature branch `feat/calendar-history-stop-deletion` built and verified:**
  - **Google Calendar Integration Backend & Engine Sync (`backend/app/engine/calendar_sync.py` & `routes/calendar.py`):** OAuth 2.0 flow, token storage in SQLite, inbound event parsing into locked engine stops, outbound trip export to Google Calendar.
  - **Dynamic User Account History & Context Retention (`user_history` table in `accounts.py`):** Persistent tracking of user queries, taste adjustments (`learned`), and rejected places (`rejected`) seeded into new sessions.
  - **Manual Stop Deletion & Instant Dynamic Replanning (`DELETE /trips/{id}/stops/{experience_id}` in `routes/trips.py`):** Delete any stop, record negative taste feedback, and dynamically repair/refill the itinerary.
- **Tests/CI:** Backend 123 tests passing 100% (122 passed, 1 skipped: live LLM). OpenAPI snapshot updated in `docs/openapi.json`.

## Next steps
1. Merge `feat/calendar-history-stop-deletion` into `main`.
2. Connect optional frontend UI trigger buttons for Google Calendar OAuth and sync.
