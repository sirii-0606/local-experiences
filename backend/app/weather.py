from __future__ import annotations

import json
import math
import os
import time
import urllib.request
from collections.abc import Callable
from datetime import date, datetime
from functools import partial

from pydantic import BaseModel

from app.engine.feasibility import km_between
from app.models import Stop
from app.seed import Seed

CITY = (26.92, 75.82)  # Jaipur centre: the default when no location is known
URL = ("https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}"
       "&hourly=temperature_2m,precipitation,precipitation_probability,weather_code"
       "&timezone=Asia%2FKolkata&start_date={day}&end_date={day}")
RAIN_CODES = set(range(51, 68)) | set(range(80, 83)) | set(range(95, 100))  # WMO drizzle..storm
HEAT_C = 38.0
TTL_S = 1800
_cache: dict[tuple[date, float, float], tuple[float, dict]] = {}


class Hour(BaseModel):
    at: datetime
    condition: str  # "rain" | "heat" | "clear"
    temp_c: float
    precip_mm: float
    precip_prob: int | None


def classify(
    temp_c: float | None,
    precip_mm: float | None,
    prob: int | None,
    code: int | None,
) -> str:
    c = 1 if code is None else int(code)
    mm = 0.0 if precip_mm is None else float(precip_mm)
    p = 0 if prob is None else int(prob)
    t = 25.0 if temp_c is None else float(temp_c)
    if c in RAIN_CODES or mm >= 0.5 or p >= 70:
        return "rain"
    return "heat" if t >= HEAT_C else "clear"


def jaipur_climatology(day: date) -> dict:
    """Jaipur monthly climatology (Tmin/Tmax) with 24-hour diurnal sine curve."""
    m = day.month
    monthly_stats = {
        1: (8.5, 22.5), 2: (11.5, 26.0), 3: (16.5, 32.0), 4: (22.5, 38.0),
        5: (26.5, 41.0), 6: (28.0, 40.0), 7: (26.0, 34.0), 8: (24.5, 32.5),
        9: (23.5, 33.5), 10: (19.0, 33.5), 11: (13.5, 29.0), 12: (9.5, 24.5),
    }
    tmin, tmax = monthly_stats.get(m, (20.0, 32.0))
    tmean = (tmin + tmax) / 2.0
    amp = (tmax - tmin) / 2.0

    times, temps, precips, probs, codes = [], [], [], [], []
    for h in range(24):
        angle = (h - 9) * 2 * math.pi / 24
        temp = round(tmean + amp * math.sin(angle), 1)
        times.append(f"{day.isoformat()}T{h:02d}:00")
        temps.append(temp)
        prob = 40 if m in (7, 8) else 5
        precips.append(0.5 if (m in (7, 8) and h in (14, 15, 16)) else 0.0)
        probs.append(prob)
        codes.append(63 if (m in (7, 8) and h in (14, 15, 16)) else 1)
    return {
        "hourly": {
            "time": times,
            "temperature_2m": temps,
            "precipitation": precips,
            "precipitation_probability": probs,
            "weather_code": codes,
        }
    }


def _typical(day: date, lat: float, lon: float) -> dict:
    """Jaipur's monthly climatology, only for Jaipur: anywhere else we'd be inventing weather."""
    if km_between(lat, lon, *CITY) > 60:
        raise LookupError("no forecast and no climatology for this location")
    return jaipur_climatology(day)


def _fetch_openmeteo(day: date, key: str | None = None, lat: float = CITY[0],
                     lon: float = CITY[1]) -> dict:
    if day < date.today():
        try:
            archive_url = (
                f"https://archive-api.open-meteo.com/v1/archive?latitude={lat}&longitude={lon}"
                f"&start_date={day.isoformat()}&end_date={day.isoformat()}"
                f"&hourly=temperature_2m,precipitation,weather_code&timezone=Asia%2FKolkata"
            )
            with urllib.request.urlopen(archive_url, timeout=4) as r:
                res = json.load(r)
            if "precipitation_probability" not in res.get("hourly", {}):
                res["hourly"]["precipitation_probability"] = [0] * len(res["hourly"]["time"])
            return res
        except Exception:
            return _typical(day, lat, lon)

    days_ahead = (day - date.today()).days
    if days_ahead <= 16:
        url = URL.format(lat=lat, lon=lon, day=day.isoformat())
        if key:
            url += f"&apikey={key}"
        try:
            with urllib.request.urlopen(url, timeout=4) as r:
                return json.load(r)
        except Exception:
            return _typical(day, lat, lon)

    return _typical(day, lat, lon)


def _fetch_weatherapi(day: date, key: str, lat: float = CITY[0], lon: float = CITY[1]) -> dict:
    url = (
        f"https://api.weatherapi.com/v1/forecast.json?key={key}&q={lat},{lon}"
        f"&dt={day.isoformat()}&days=1"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "local-experiences/1.0"})
    with urllib.request.urlopen(req, timeout=4) as r:
        raw = json.load(r)
    hours = raw.get("forecast", {}).get("forecastday", [{}])[0].get("hour", [])
    if not hours:
        return _fetch_openmeteo(day, lat=lat, lon=lon)
    times, temps, precips, probs, codes = [], [], [], [], []
    for h in hours:
        t_str = h.get("time", "").replace(" ", "T")
        times.append(t_str)
        temps.append(float(h.get("temp_c", 25.0)))
        precips.append(float(h.get("precip_mm", 0.0)))
        prob = int(h.get("chance_of_rain", 0))
        probs.append(prob)
        w_code = int(h.get("condition", {}).get("code", 1000))
        mapped = 63 if (w_code >= 1063 or prob >= 50) else 1
        codes.append(mapped)
    return {
        "hourly": {
            "time": times,
            "temperature_2m": temps,
            "precipitation": precips,
            "precipitation_probability": probs,
            "weather_code": codes,
        }
    }


def _fetch_openweathermap(day: date, key: str, lat: float = CITY[0],
                          lon: float = CITY[1]) -> dict:
    # OpenWeatherMap 5-day forecast covers only today to today + 5 days
    days_ahead = (day - date.today()).days
    if not (0 <= days_ahead <= 5):
        return _fetch_openmeteo(day, lat=lat, lon=lon)

    url = (
        f"https://api.openweathermap.org/data/2.5/forecast?lat={lat}&lon={lon}"
        f"&appid={key}&units=metric"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "local-experiences/1.0"})
    with urllib.request.urlopen(req, timeout=4) as r:
        raw = json.load(r)
    items = raw.get("list", [])
    if not items:
        return _fetch_openmeteo(day, lat=lat, lon=lon)

    times, temps, precips, probs, codes = [], [], [], [], []
    for h in range(24):
        target_dt = datetime(day.year, day.month, day.day, h, 0)
        target_ts = target_dt.timestamp()
        best = min(items, key=lambda it: abs(it.get("dt", target_ts) - target_ts))

        times.append(target_dt.isoformat())
        temps.append(float(best.get("main", {}).get("temp", 25.0)))
        precip = float(best.get("rain", {}).get("3h", 0.0)) / 3.0
        precips.append(precip)
        prob = int(best.get("pop", 0.0) * 100)
        probs.append(prob)
        w_id = best.get("weather", [{}])[0].get("id", 800)
        codes.append(63 if (w_id < 700 or precip > 0.1 or prob >= 60) else 1)

    return {
        "hourly": {
            "time": times,
            "temperature_2m": temps,
            "precipitation": precips,
            "precipitation_probability": probs,
            "weather_code": codes,
        }
    }


def _fetch(day: date, lat: float = CITY[0], lon: float = CITY[1]) -> dict:
    key = os.environ.get("WEATHER_API_KEY", "").strip()
    provider = os.environ.get("WEATHER_PROVIDER", "").strip().lower()

    if not provider or provider == "auto":
        if os.environ.get("OPENWEATHER_API_KEY"):
            provider = "openweathermap"
            key = os.environ.get("OPENWEATHER_API_KEY", "").strip()
        elif os.environ.get("WEATHERAPI_KEY"):
            provider = "weatherapi"
            key = os.environ.get("WEATHERAPI_KEY", "").strip()

    if key and provider in ("openweathermap", "openweather"):
        try:
            return _fetch_openweathermap(day, key, lat, lon)
        except Exception:
            return _fetch_openmeteo(day, lat=lat, lon=lon)

    if key and provider in ("weatherapi",):
        try:
            return _fetch_weatherapi(day, key, lat, lon)
        except Exception:
            return _fetch_openmeteo(day, lat=lat, lon=lon)

    return _fetch_openmeteo(day, lat=lat, lon=lon)


def forecast(day: date, fetch: Callable[[date], dict] | None = None, lat: float = CITY[0],
             lon: float = CITY[1]) -> list[Hour] | None:
    """Hourly conditions for one day at a place (~10 km cells), cached 30 min.
    None if the service can't be reached."""
    key = (day, round(lat, 1), round(lon, 1))
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < TTL_S:
        data = hit[1]
    else:
        try:
            data = (fetch or partial(_fetch, lat=lat, lon=lon))(day)
        except Exception:  # offline, timeout, bad payload: weather is optional context
            return None
        _cache[key] = (time.monotonic(), data)
    h = data.get("hourly", {})
    times = h.get("time", [])
    temps = h.get("temperature_2m", [])
    precips = h.get("precipitation", [])
    probs = h.get("precipitation_probability", [None] * len(times))
    codes = h.get("weather_code", [1] * len(times))

    out: list[Hour] = []
    for t, temp, mm, prob, code in zip(times, temps, precips, probs, codes, strict=False):
        t_dt = datetime.fromisoformat(t)
        safe_temp = 25.0 if temp is None else float(temp)
        safe_mm = 0.0 if mm is None else float(mm)
        safe_prob = None if prob is None else int(prob)
        safe_code = 1 if code is None else int(code)
        cond = classify(safe_temp, safe_mm, safe_prob, safe_code)
        out.append(
            Hour(
                at=t_dt,
                temp_c=safe_temp,
                precip_mm=safe_mm,
                precip_prob=safe_prob,
                condition=cond,
            )
        )
    return out or None


def at_hour(hours: list[Hour], when: datetime) -> Hour | None:
    if not hours:
        return None
    match = next((h for h in hours if h.at.hour == when.hour), None)
    if match:
        return match
    return min(hours, key=lambda h: abs(h.at.hour - when.hour))


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
