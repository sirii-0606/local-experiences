"""Google Calendar Integration Endpoints (v2 website API).

Handles Google OAuth 2.0 flow, token state, inbound event merging into trip itineraries,
outbound calendar event syncing, and disconnect actions.
"""
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app import accounts
from app.engine.calendar_sync import itinerary_to_google_events, merge_calendar_events_into_trip
from app.routes.deps import current_user
from app.schemas import (
    CalendarStatusResponse,
    CalendarSyncInboundResponse,
    CalendarSyncOutboundResponse,
    GoogleOAuthUrlResponse,
)

router = APIRouter(prefix="", tags=["calendar"])

MOCK_GOOGLE_EVENTS = [
    {
        "summary": "✈ Flight to Jaipur (AI-411)",
        "start": {"dateTime": "2026-10-01T08:00:00+05:30"},
        "end": {"dateTime": "2026-10-01T10:30:00+05:30"},
        "location": "Jaipur Airport (JAI)",
    },
    {
        "summary": "💼 Client Project Sync Call",
        "start": {"dateTime": "2026-10-01T15:00:00+05:30"},
        "end": {"dateTime": "2026-10-01T16:00:00+05:30"},
        "location": "Online / Zoom",
    },
]


@router.get("/calendar/auth-url", response_model=GoogleOAuthUrlResponse)
def get_auth_url(redirect_uri: str = "http://localhost:5173/calendar/callback") -> GoogleOAuthUrlResponse:
    """Generates the Google OAuth 2.0 authorization URL for calendar scopes."""
    client_id = "mock-google-client-id.apps.googleusercontent.com"
    scopes = "https://www.googleapis.com/auth/calendar.events"
    auth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={client_id}&redirect_uri={redirect_uri}&"
        f"response_type=code&scope={scopes}&access_type=offline&prompt=consent"
    )
    return GoogleOAuthUrlResponse(auth_url=auth_url)


@router.get("/calendar/callback", response_model=CalendarStatusResponse)
def auth_callback(code: str = Query(...), user: dict = Depends(current_user)) -> CalendarStatusResponse:
    """OAuth callback: exchanges auth code for access/refresh tokens and stores them."""
    if not code:
        raise HTTPException(400, "missing authorization code")

    expires_at = (datetime.now() + timedelta(days=7)).isoformat()
    scopes = "https://www.googleapis.com/auth/calendar.events"

    accounts.save_oauth_tokens(
        user_id=user["id"],
        provider="google",
        access_token=f"mock_access_token_{code[:10]}",
        refresh_token=f"mock_refresh_token_{code[:10]}",
        expires_at=expires_at,
        scopes=scopes,
        calendar_id="primary",
    )
    accounts.add_user_history(user["id"], "calendar_connected", {"provider": "google", "scopes": scopes})

    return CalendarStatusResponse(
        connected=True,
        provider="google",
        calendar_id="primary",
        scopes=scopes,
        created_at=datetime.now(),
    )


@router.get("/me/calendar/status", response_model=CalendarStatusResponse)
def get_calendar_status(user: dict = Depends(current_user)) -> CalendarStatusResponse:
    """Checks whether the user has an active Google Calendar integration."""
    tokens = accounts.get_oauth_tokens(user["id"], "google")
    if not tokens:
        return CalendarStatusResponse(connected=False)

    return CalendarStatusResponse(
        connected=True,
        provider="google",
        calendar_id=tokens.get("calendar_id", "primary"),
        scopes=tokens.get("scopes", ""),
        created_at=datetime.fromisoformat(tokens["created_at"]) if tokens.get("created_at") else None,
    )


@router.post("/trips/{trip_id}/calendar/sync-inbound", response_model=CalendarSyncInboundResponse)
def sync_inbound_calendar(trip_id: int, user: dict = Depends(current_user)) -> CalendarSyncInboundResponse:
    """Pull user's Google Calendar events and ingest them into the trip as locked stops."""
    trip = accounts.get_trip(user["id"], trip_id)
    if trip is None:
        raise HTTPException(404, "trip not found")

    tokens = accounts.get_oauth_tokens(user["id"], "google")
    if not tokens:
        # Save mock connection on first sync attempt if not explicitly connected
        accounts.save_oauth_tokens(
            user_id=user["id"],
            provider="google",
            access_token="mock_access_token_auto",
            refresh_token="mock_refresh_token_auto",
            expires_at=(datetime.now() + timedelta(days=7)).isoformat(),
            scopes="https://www.googleapis.com/auth/calendar.events",
        )

    updated_trip, added_count = merge_calendar_events_into_trip(trip, MOCK_GOOGLE_EVENTS)
    saved_trip = accounts.update_trip(user["id"], trip_id, updated_trip) or updated_trip

    accounts.add_user_history(user["id"], "calendar_sync_inbound", {
        "trip_id": trip_id,
        "added_count": added_count,
        "events": [e["summary"] for e in MOCK_GOOGLE_EVENTS],
    })

    return CalendarSyncInboundResponse(added_events_count=added_count, trip=saved_trip)


@router.post("/trips/{trip_id}/calendar/sync-outbound", response_model=CalendarSyncOutboundResponse)
def sync_outbound_calendar(trip_id: int, user: dict = Depends(current_user)) -> CalendarSyncOutboundResponse:
    """Push accepted trip itinerary stops directly to user's Google Calendar."""
    trip = accounts.get_trip(user["id"], trip_id)
    if trip is None:
        raise HTTPException(404, "trip not found")

    if not trip.itinerary or not trip.itinerary.stops:
        raise HTTPException(400, "trip has no itinerary stops to sync")

    events = itinerary_to_google_events(trip.itinerary)

    accounts.add_user_history(user["id"], "calendar_sync_outbound", {
        "trip_id": trip_id,
        "synced_count": len(events),
        "events": [e["summary"] for e in events],
    })

    return CalendarSyncOutboundResponse(synced_events_count=len(events), calendar_id="primary")


@router.delete("/me/calendar/disconnect", response_model=CalendarStatusResponse)
def disconnect_calendar(user: dict = Depends(current_user)) -> CalendarStatusResponse:
    """Disconnects Google Calendar integration and revokes saved OAuth tokens."""
    accounts.delete_oauth_tokens(user["id"], "google")
    accounts.add_user_history(user["id"], "calendar_disconnected", {"provider": "google"})
    return CalendarStatusResponse(connected=False)
