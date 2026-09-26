"""Live weather context (doc §4 context layer, §9 dynamic adaptation) from Open-Meteo (no key).

Privacy: we query the fixed city centre, never the traveler's position. Resilience: any failure
returns None and the product works exactly as before (weather stays whatever the state says).
"""
import json
import time
import urllib.request
from collections.abc import Callable
from datetime import date, datetime

from pydantic import BaseModel

from app.models import Stop
from app.seed import Seed

CITY = (26.92, 75.82)  # Jaipur centre
URL = ("https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}"
       "&hourly=temperature_2m,precipitation,precipitation_probability,weather_code"
       "&timezone=Asia%2FKolkata&start_date={day}&end_date={day}")
RAIN_CODES = set(range(51, 68)) | set(range(80, 83)) | set(range(95, 100))  # WMO drizzle..storm
HEAT_C = 38.0
TTL_S = 1800
_cache: dict[date, tuple[float, dict]] = {}


class Hour(BaseModel):
    at: datetime
    condition: str  # "rain" | "heat" | "clear"
    temp_c: float
    precip_mm: float
    precip_prob: int | None


def classify(temp_c: float, precip_mm: float, prob: int | None, code: int) -> str:
    if code in RAIN_CODES or precip_mm >= 0.5 or (prob or 0) >= 70:
        return "rain"
    return "heat" if temp_c >= HEAT_C else "clear"


def _fetch(day: date) -> dict:
    url = URL.format(lat=CITY[0], lon=CITY[1], day=day.isoformat())
    with urllib.request.urlopen(url, timeout=4) as r:  # fixed https host, no user input in URL
        return json.load(r)


def forecast(day: date, fetch: Callable[[date], dict] | None = None) -> list[Hour] | None:
    """Hourly conditions for one day, cached 30 min. None if the service can't be reached."""
    hit = _cache.get(day)
    if hit and time.monotonic() - hit[0] < TTL_S:
        data = hit[1]
    else:
        try:
            data = (fetch or _fetch)(day)
        except Exception:  # offline, timeout, bad payload: weather is optional context
            return None
        _cache[day] = (time.monotonic(), data)
    h = data["hourly"]
    return [
        Hour(at=datetime.fromisoformat(t), temp_c=temp, precip_mm=mm or 0.0, precip_prob=prob,
             condition=classify(temp, mm or 0.0, prob, code))
        for t, temp, mm, prob, code in zip(h["time"], h["temperature_2m"], h["precipitation"],
                                          h["precipitation_probability"], h["weather_code"],
                                          strict=True)
    ]


def at_hour(hours: list[Hour], when: datetime) -> Hour | None:
    return next((h for h in hours if h.at.hour == when.hour), None)


class Risk(BaseModel):
    stop: str
    condition: str
    message: str


def plan_risks(stops: list[Stop], seed: Seed, hours: list[Hour]) -> list[Risk]:
    """Upcoming outdoor, weather-sensitive stops whose hours overlap forecast rain or heat."""
    risks = []
    for s in stops:
        exp = seed.experiences.get(s.experience_id) if s.experience_id else None
        if exp is None or exp.indoor or not exp.weather_sensitive:
            continue
        span = [h for h in hours if s.start.replace(minute=0) <= h.at < s.end]
        for cond in ("rain", "heat"):
            if bad := [h for h in span if h.condition == cond]:
                what = (f"{max(h.precip_prob or 0 for h in bad)}% chance of rain" if cond == "rain"
                        else f"{max(h.temp_c for h in bad):.0f}°C")
                risks.append(Risk(stop=s.title, condition=cond,
                                  message=f"{s.title} is outdoors at {s.start:%H:%M}: {what}"))
                break
    return risks
