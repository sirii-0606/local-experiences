"""An approved plan -> calendar: an .ics file (Google, Apple, Outlook) whose reminders fire when
it's time to leave, plus a one-click "add to Google Calendar" link per stop.

The reminder is context-aware: travel time from the previous stop (or where they are) at that
time of day, plus 15 minutes. No Google account connection is needed; see decisions.md for the
direct-sync upgrade (needs an OAuth client).
"""

from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

from fastapi import APIRouter
from pydantic import BaseModel

from app.engine.feasibility import km_between, travel_min
from app.engine.itinerary import upcoming
from app.models import Itinerary, TravelerState
from app.schemas import CalendarEvent, CalendarExport

router = APIRouter(prefix="/calendar", tags=["calendar"])
IST = timedelta(hours=5, minutes=30)  # engine times are naive India time; India has no DST
LEAD_MIN = 15


class CalendarRequest(BaseModel):
    state: TravelerState
    itinerary: Itinerary


def _utc(t: datetime) -> str:
    return (t - IST).strftime("%Y%m%dT%H%M%SZ")


def _esc(text: str) -> str:
    return text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _fold(line: str) -> list[str]:
    """RFC 5545: at most 75 octets per line; continuation lines start with a space."""
    out, cur = [], ""
    for ch in line:
        if len((cur + ch).encode()) > 75:
            out.append(cur)
            cur = " "
        cur += ch
    return [*out, cur]


def ics(events: list[CalendarEvent], stamp: datetime) -> str:
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//TrueLocal//Plan//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
    ]
    for i, e in enumerate(events):
        lines += [
            "BEGIN:VEVENT",
            f"UID:{_utc(e.start)}-{i}@truelocal",
            f"DTSTAMP:{stamp:%Y%m%dT%H%M%SZ}",
            f"DTSTART:{_utc(e.start)}",
            f"DTEND:{_utc(e.end)}",
            f"SUMMARY:{_esc(e.title)}",
            f"DESCRIPTION:{_esc(e.reminder)}",
            "BEGIN:VALARM",
            "ACTION:DISPLAY",
            f"DESCRIPTION:{_esc(e.reminder)}",
            f"TRIGGER:-PT{e.remind_min}M",
            "END:VALARM",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    return "\r\n".join(x for line in lines for x in _fold(line)) + "\r\n"


@router.post("/export")
def export(req: CalendarRequest) -> CalendarExport:
    state, events = req.state, []
    pos = (state.lat, state.lon)
    for stop in upcoming(req.itinerary):
        travel = travel_min(km_between(*pos, stop.lat, stop.lon), state.mode, stop.start)
        leave = stop.start - timedelta(minutes=travel)
        where = f"{stop.lat:.5f},{stop.lon:.5f}"
        maps = f"https://www.google.com/maps/dir/?api=1&destination={where}"
        reminder = (
            f"Leave by {leave:%H:%M} for {stop.title} (~{travel} min by {state.mode})."
            if travel
            else f"{stop.title} starts at {stop.start:%H:%M}."
        )
        details = f"{reminder}\nDirections: {maps}"
        google = "https://calendar.google.com/calendar/render?" + urlencode(
            {
                "action": "TEMPLATE",
                "text": stop.title,
                "dates": f"{_utc(stop.start)}/{_utc(stop.end)}",
                "details": details,
                "location": where,
                "ctz": "Asia/Kolkata",
            }
        )
        events.append(
            CalendarEvent(
                title=stop.title,
                start=stop.start,
                end=stop.end,
                remind_min=travel + LEAD_MIN,
                reminder=details,
                google_url=google,
            )
        )
        pos = (stop.lat, stop.lon)
    return CalendarExport(ics=ics(events, datetime.now(UTC)), events=events)
