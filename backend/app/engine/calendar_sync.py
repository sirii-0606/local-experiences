"""Google Calendar Integration Engine Adapter (doc / features).

Pure conversion layer: converts external Google Calendar API event payloads into unmovable
locked Stop objects (locked=True) in the engine's Itinerary, and formats accepted itinerary
stops into Google Calendar event payloads.
"""
from datetime import date, datetime, time, timedelta
from typing import Any

from app.models import Itinerary, Stop
from app.schemas import Trip

JAIPUR_LAT = 26.9124
JAIPUR_LON = 75.7873


def _parse_dt(raw: dict[str, Any], default_date: date | None = None) -> datetime:
    if "dateTime" in raw:
        return datetime.fromisoformat(raw["dateTime"].replace("Z", "+00:00")).replace(tzinfo=None)
    elif "date" in raw:
        d = date.fromisoformat(raw["date"])
        return datetime.combine(d, time(9, 0))
    elif default_date:
        return datetime.combine(default_date, time(9, 0))
    return datetime.now().replace(microsecond=0)


def google_event_to_locked_stop(g_event: dict[str, Any], default_date: date | None = None) -> Stop:
    """Converts a raw Google Calendar API event dict into an unmovable locked engine Stop."""
    title = g_event.get("summary") or "📅 Busy Event"
    if not title.startswith("📅"):
        title = f"📅 {title}"

    start_dt = _parse_dt(g_event.get("start", {}), default_date)
    end_dt = _parse_dt(g_event.get("end", {}), default_date)
    if end_dt <= start_dt:
        end_dt = start_dt + timedelta(hours=1)

    # Coordinates fallback to Jaipur centre if not provided in location field
    lat, lon = JAIPUR_LAT, JAIPUR_LON

    return Stop(
        title=title,
        experience_id=None,
        lat=lat,
        lon=lon,
        start=start_dt,
        end=end_dt,
        cost_inr=0,
        locked=True,
        status="confirmed",
    )


def merge_calendar_events_into_trip(trip: Trip, g_events: list[dict[str, Any]]) -> tuple[Trip, int]:
    """Ingests external calendar events as locked stops into the trip's itinerary."""
    updated = trip.model_copy(deep=True)
    if updated.itinerary is None:
        updated.itinerary = Itinerary()

    existing_titles = {s.title for s in updated.itinerary.stops}
    added_count = 0

    for ge in g_events:
        stop = google_event_to_locked_stop(ge, default_date=trip.start_date)
        if stop.title not in existing_titles:
            updated.itinerary.stops.append(stop)
            existing_titles.add(stop.title)
            added_count += 1

    updated.itinerary.stops.sort(key=lambda s: s.start)
    return updated, added_count


def itinerary_to_google_events(itinerary: Itinerary, summary_prefix: str = "[Local Experience] ") -> list[dict[str, Any]]:
    """Formats active itinerary stops into Google Calendar event payloads for outbound sync."""
    events = []
    for s in itinerary.stops:
        if s.status in ("skipped", "replaced"):
            continue
        event_payload = {
            "summary": f"{summary_prefix}{s.title}",
            "location": f"Jaipur ({s.lat:.4f}, {s.lon:.4f})",
            "description": (
                f"Planned via Local & Experiences.\n"
                f"Cost: {'Free' if s.cost_inr == 0 else f'₹{s.cost_inr}'}\n"
                f"Status: {s.status.capitalize()}\n"
            ),
            "start": {"dateTime": s.start.isoformat() + "+05:30"},
            "end": {"dateTime": s.end.isoformat() + "+05:30"},
            "reminders": {
                "useDefault": False,
                "overrides": [{"method": "popup", "minutes": 30}],
            },
        }
        events.append(event_payload)
    return events
