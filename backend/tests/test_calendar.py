"""Tests for Google Calendar Integration (calendar_sync.py and routes/calendar.py)."""
from datetime import date, datetime

from app import accounts
from app.engine.calendar_sync import (
    google_event_to_locked_stop,
    itinerary_to_google_events,
    merge_calendar_events_into_trip,
)
from app.models import Itinerary, Stop
from app.schemas import StayPref, TripDraft, TripTraveler


def test_google_event_to_locked_stop():
    g_event = {
        "summary": "Meeting with Artisan",
        "start": {"dateTime": "2026-10-01T10:00:00+05:30"},
        "end": {"dateTime": "2026-10-01T11:00:00+05:30"},
    }
    stop = google_event_to_locked_stop(g_event)
    assert stop.locked is True
    assert stop.title == "📅 Meeting with Artisan"
    assert stop.start.hour == 10
    assert stop.end.hour == 11


def test_merge_calendar_events_into_trip():
    draft = TripDraft(
        title="Jaipur Architecture Tour",
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 2),
        budget_inr=5000,
        stay=StayPref(),
        travelers=[TripTraveler(name="Sumit", age=25)],
    )
    user = accounts.create("cal_test@example.com", "password123", "Cal User")
    trip = accounts.create_trip(user["id"], draft)

    g_events = [
        {
            "summary": "✈ Flight Arrival",
            "start": {"dateTime": "2026-10-01T08:00:00+05:30"},
            "end": {"dateTime": "2026-10-01T09:30:00+05:30"},
        }
    ]

    updated_trip, added_count = merge_calendar_events_into_trip(trip, g_events)
    assert added_count == 1
    assert len(updated_trip.itinerary.stops) == 1
    assert updated_trip.itinerary.stops[0].locked is True
    assert "Flight" in updated_trip.itinerary.stops[0].title


def test_itinerary_to_google_events():
    it = Itinerary(stops=[
        Stop(
            title="Amber Fort Tour",
            experience_id="exp-amber-fort",
            lat=26.9855,
            lon=75.8513,
            start=datetime(2026, 10, 1, 10, 0),
            end=datetime(2026, 10, 1, 12, 0),
            cost_inr=500,
            status="confirmed",
        )
    ])

    events = itinerary_to_google_events(it)
    assert len(events) == 1
    assert events[0]["summary"] == "[Local Experience] Amber Fort Tour"
    assert "500" in events[0]["description"]


def test_calendar_routes():
    from fastapi.testclient import TestClient
    from app.main import app

    c = TestClient(app, headers={"X-Requested-With": "le"})
    assert c.post("/auth/register", json={"email": "cal_user@example.com", "password": "password123", "display_name": "Cal User"}).status_code == 201

    # Test auth url
    res = c.get("/calendar/auth-url")
    assert res.status_code == 200
    assert "accounts.google.com" in res.json()["auth_url"]

    # Test status initial (not connected)
    res = c.get("/me/calendar/status")
    assert res.status_code == 200
    assert res.json()["connected"] is False

    # Test callback
    res = c.get("/calendar/callback?code=mock_code_123")
    assert res.status_code == 200
    assert res.json()["connected"] is True

    # Test status connected after callback
    res = c.get("/me/calendar/status")
    assert res.status_code == 200
    assert res.json()["connected"] is True

    # Test disconnect
    res = c.delete("/me/calendar/disconnect")
    assert res.status_code == 200
    assert res.json()["connected"] is False

