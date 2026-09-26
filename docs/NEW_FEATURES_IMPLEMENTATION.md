# Advanced System Features Implementation: Google Calendar Integration, Dynamic User Context & History, and Manual Stop Deletion

---

## 1. Overview

This document details three major features added to **Local & Experiences**:

1. **Google Calendar Integration Backend & Engine Sync**: Bi-directional integration that ingests external calendar events as locked time slots and pushes confirmed itineraries to Google Calendar.
2. **Dynamic User Account History & Context Retention**: Long-term memory tracking user interactions, taste score adjustments (`learned`), and rejected places (`rejected`) across sessions.
3. **Manual Stop Deletion & Instant Dynamic Replanning**: Endpoint allowing users to delete any suggested stop, updating negative taste preferences, and instantly repair/refill the itinerary.

---

## 2. Google Calendar Integration

### Architecture & Components
- **Engine Adapter** (`backend/app/engine/calendar_sync.py`):
  - `google_event_to_locked_stop()`: Converts raw Google Calendar event JSON into an unmovable `Stop` (`locked=True`).
  - `merge_calendar_events_into_trip()`: Merges external busy time slots into a trip's `Itinerary`.
  - `itinerary_to_google_events()`: Formats active itinerary stops into Google Calendar event payloads.
- **SQLite Table** (`user_oauth_tokens` in `accounts.py`):
  Stores user_id, provider, access_token, refresh_token, expires_at, and scopes.
- **REST Router** (`backend/app/routes/calendar.py`):
  - `GET /calendar/auth-url`: OAuth 2.0 authorization link generation.
  - `GET /calendar/callback`: Authorization code exchange and token persistence.
  - `GET /me/calendar/status`: Connection status check.
  - `POST /trips/{id}/calendar/sync-inbound`: Import external Google Calendar events as locked stops.
  - `POST /trips/{id}/calendar/sync-outbound`: Export trip stops to Google Calendar.
  - `DELETE /me/calendar/disconnect`: Revokes saved tokens.

---

## 3. Dynamic User Account History & Context Retention

### Architecture & Components
- **SQLite Table** (`user_history` in `accounts.py`):
  Tracks `user_id`, `created`, `kind` (`chat`, `discover`, `feedback`, `stop_deleted`, `calendar_sync`), and `data_json`.
- **Context Summarization Engine** (`accounts.get_user_context_summary(user_id)`):
  Aggregates positive/negative taste deltas from past sessions and compiles a deduplicated list of rejected experience IDs.
- **Session Wire-Up**:
  When a logged-in user initiates `/discover` or `/chat`, historical learned taste weights and rejected places automatically seed their initial `TravelerState`.

---

## 4. Manual Stop Deletion & Instant Dynamic Replanning

### Endpoint & Workflow
- **Endpoint**: `DELETE /trips/{id}/stops/{experience_id}` (`backend/app/routes/trips.py`)
- **Execution Steps**:
  1. Sets stop status in itinerary to `"skipped"`.
  2. Updates `trip.shortlist[experience_id] = "skip"`.
  3. Invokes `engine.learn.learn()` with negative feedback for the experience's tags.
  4. Records `stop_deleted` event in `user_history`.
  5. Calls `engine.trip.build_itinerary()` to dynamically fill the time gap with the next best candidate.
  6. Saves updated trip to SQLite and returns `StopDeleteResponse`.

---

## 5. Verification & Testing

Run the full pytest suite (123 tests):
```bash
cd backend
.venv/bin/pytest tests
```

Key test files created:
- `backend/tests/test_calendar.py`
- `backend/tests/test_history.py`
- `backend/tests/test_stop_deletion.py`
