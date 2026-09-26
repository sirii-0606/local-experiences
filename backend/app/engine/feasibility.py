"""Hard constraints (doc §7.2): an experience is feasible right now or it isn't. No scoring here.

Times are naive local (Asia/Kolkata) datetimes; one traveler window = one calendar day.
"""
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from math import asin, ceil, cos, radians, sin, sqrt

from app.engine.confidence import LOW_CONFIDENCE, attr_confidence
from app.models import AvailabilityWindow, Experience, TravelerState
from app.seed import Seed

SPEED_KMH = {"walk": 4.5, "auto": 18, "car": 22}
ROAD_FACTOR = 1.3  # straight line -> street distance
BUFFER_MIN = 10  # finding the place, parking, getting in


def km_between(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    dlat, dlon = radians(lat2 - lat1), radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * 6371 * asin(sqrt(a))


def travel_min(km: float, mode: str) -> int:
    # ponytail: straight line x road factor, no traffic; swap for OSRM if routes matter.
    if km < 0.1:
        return 0
    return ceil(km * ROAD_FACTOR / SPEED_KMH[mode] * 60) + BUFFER_MIN


def group_cost(exp: Experience, size: int) -> int:
    return {"per_person": exp.price_inr * size, "per_group": exp.price_inr}.get(exp.price_model, 0)


def runs_on(w: AvailabilityWindow, day: date) -> bool:
    return w.on_date == day if w.on_date else day.weekday() in w.days


def earliest_start(exp: Experience, not_before: datetime) -> datetime | None:
    """Earliest start on not_before's day that still finishes inside an open window."""
    day, dur, best = not_before.date(), timedelta(minutes=exp.duration_min), None
    for w in exp.availability:
        if not runs_on(w, day):
            continue
        close = datetime.combine(day, w.end)
        starts = [datetime.combine(day, s) for s in w.slots] or [
            max(not_before, datetime.combine(day, w.start))
        ]
        for s in starts:
            if s >= not_before and s + dur <= close and (best is None or s < best):
                best = s
    return best


def _hours(exp: Experience, day: date) -> str:
    return ", ".join(
        "slots " + "/".join(f"{s:%H:%M}" for s in w.slots) if w.slots
        else f"{w.start:%H:%M}–{w.end:%H:%M}"
        for w in exp.availability if runs_on(w, day)
    )


def _ceil5(dt: datetime) -> datetime:
    dt = dt.replace(second=0, microsecond=0)
    return dt + timedelta(minutes=-dt.minute % 5)


@dataclass
class Fit:
    km: float
    travel_min: int
    cost_inr: int
    start: datetime | None = None
    end: datetime | None = None
    reasons: list[str] = field(default_factory=list)  # why infeasible; empty = feasible

    @property
    def ok(self) -> bool:
        return not self.reasons


def check(exp: Experience, state: TravelerState, seed: Seed) -> Fit:
    place, provider = seed.places[exp.place_id], seed.providers[exp.provider_id]
    size = len(state.group)
    km = km_between(state.lat, state.lon, place.lat, place.lon)
    fit = Fit(round(km, 2), travel_min(km, state.mode), group_cost(exp, size))
    r = fit.reasons

    if fit.cost_inr > state.budget_inr:
        r.append(f"costs ₹{fit.cost_inr} for {size}, over your ₹{state.budget_inr} budget")
    if size > exp.capacity:
        r.append(f"takes at most {exp.capacity} people")
    if (youngest := min(t.age for t in state.group)) < exp.min_age:
        r.append(f"minimum age {exp.min_age}, youngest in your group is {youngest}")
    needed = {a for t in state.group for a in t.accessibility}
    if missing := needed - set(exp.accessibility):
        r.append("lacks " + ", ".join(sorted(missing)) + " access")
    elif needed and attr_confidence(
        exp, provider, "accessibility", state.window_start.date()
    ) < LOW_CONFIDENCE:
        r.append("accessibility claim is unconfirmed")
    if state.indoor_only and not exp.indoor:
        r.append("not indoors")
    if state.max_distance_km is not None and km > state.max_distance_km:
        r.append(f"{km:.1f} km away, beyond your {state.max_distance_km:g} km limit")

    arrive = _ceil5(state.window_start + timedelta(minutes=fit.travel_min))
    start = earliest_start(exp, arrive)
    if start is None:
        if not any(runs_on(w, arrive.date()) for w in exp.availability):
            r.append(f"not running on {arrive:%A %d %b}")
        else:
            r.append(f"no time left to fit its {exp.duration_min} min after you arrive at "
                     f"{arrive:%H:%M} (open {_hours(exp, arrive.date())})")
    else:
        fit.start, fit.end = start, start + timedelta(minutes=exp.duration_min)
        if fit.end > state.window_end:
            r.append(f"would end at {fit.end:%H:%M}, after your {state.window_end:%H:%M} cutoff")
        elif state.end_lat is not None:
            onward = travel_min(
                km_between(place.lat, place.lon, state.end_lat, state.end_lon), state.mode
            )
            if fit.end + timedelta(minutes=onward) > state.window_end:
                r.append(f"ends {fit.end:%H:%M}, leaving too little time for the {onward} min "
                         f"to your next stop by {state.window_end:%H:%M}")
    return fit
