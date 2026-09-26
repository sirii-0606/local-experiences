"""Dynamic adaptation (doc §9): react to a change by repairing only the affected segment.

Lifecycle (doc §9.2): freeze what's done -> walk upcoming stops under the new state -> for each
broken, unlocked stop try, in order: same experience at a later time, an alternative sharing its
intent, or dropping it -> explain every change. Locked stops are never moved; if one is at risk
it is reported instead. A provider cancellation or closure overrides the lock (it can't happen).
"""
from datetime import timedelta
from typing import Literal

from pydantic import BaseModel

from app.engine.feasibility import km_between, rained_out, travel_min
from app.engine.itinerary import PACE_SLACK_MIN, fill_gap, gaps, to_stop, upcoming
from app.engine.rank import Recommendation, is_strenuous
from app.models import ContextEvent, Itinerary, Stop, TravelerState
from app.seed import Seed


class Change(BaseModel):
    action: Literal["retimed", "replaced", "dropped", "at_risk"]
    stop: str
    reason: str  # why the original no longer works
    new_stop: str | None = None
    why: list[str] = []  # engine reasons for the new pick (same factors as discovery)


class Replan(BaseModel):
    itinerary: Itinerary
    state: TravelerState  # the state replanning ran under (new position/time/weather/budget)
    changes: list[Change]


def _freeze_past(it: Itinerary, now) -> list[Stop]:
    """Mark finished / in-progress stops; return the in-progress ones."""
    ongoing = []
    for s in it.stops:
        if s.status in ("proposed", "confirmed", "active"):
            if s.end <= now:
                s.status = "completed"
            elif s.start < now:
                s.status = "active"
                ongoing.append(s)
    return ongoing


def _new_state(state: TravelerState, event: ContextEvent, it: Itinerary, ongoing) -> TravelerState:
    """Where/when replanning starts, plus whatever the event changes about the traveler."""
    pos = (ongoing[-1].lat, ongoing[-1].lon) if ongoing else (state.lat, state.lon)
    start = max([event.at] + [s.end for s in ongoing]) + timedelta(minutes=event.delay_min or 0)
    update = {"lat": pos[0], "lon": pos[1], "window_start": start}
    if event.kind == "weather":
        update["weather"] = event.weather
    if event.kind == "fatigue":
        update["pace"] = "relaxed"
    if event.kind == "budget_change":
        # event.budget_inr = what's left for unlocked plans ahead; spent + locked bookings stay
        committed = sum(s.cost_inr for s in it.stops
                        if s.status in ("completed", "active") or (s.locked and s.status in
                                                                  ("proposed", "confirmed")))
        update["budget_inr"] = committed + event.budget_inr
    return state.model_copy(update=update)


def _problem(s: Stop, pos, t, spent: int, state: TravelerState, event: ContextEvent,
             seed: Seed) -> str | None:
    exp = seed.experiences.get(s.experience_id) if s.experience_id else None
    if exp and exp.id == event.experience_id and event.kind in ("closure", "provider_cancel"):
        return "cancelled by the provider" if event.kind == "provider_cancel" else "closed today"
    if exp and rained_out(exp, state):
        return "outdoors, and it's raining"
    if exp and event.kind == "fatigue" and is_strenuous(exp):
        return "too strenuous while you're tired"
    arrive = t + timedelta(minutes=travel_min(km_between(*pos, s.lat, s.lon), state.mode))
    if s.start < arrive:
        return f"you can't make {s.start:%H:%M} any more (earliest arrival {arrive:%H:%M})"
    if spent + s.cost_inr > state.budget_inr:
        return "doesn't fit your budget any more"
    if not s.locked and s.end > state.window_end:
        return f"runs past your {state.window_end:%H:%M} cutoff"
    return None


def _alternative(it: Itinerary, old: Stop, state: TravelerState, event: ContextEvent,
                 seed: Seed) -> Recommendation | None:
    """Smallest sensible change: same experience later, else something with the same intent."""
    gap = next((g for g in gaps(it, state, min_minutes=1) if g.end > old.start), None)
    orig = seed.experiences.get(old.experience_id) if old.experience_id else None
    if gap is None or orig is None:
        return None
    skip = {orig.id} if event.kind in ("closure", "provider_cancel") else set()
    if event.kind == "fatigue":
        skip |= {e.id for e in seed.experiences.values() if is_strenuous(e)}
    keep_intent = state.model_copy(
        update={"intents": [t for t in orig.tags if t in state.intents] or list(orig.tags)})
    if orig.id not in skip:
        only_orig = Seed(seed.providers, seed.places, {orig.id: orig})
        if same := fill_gap(it, gap, keep_intent, only_orig, k=1):
            return same[0]
    for r in fill_gap(it, gap, keep_intent, seed, k=10, skip=skip):
        if set(seed.experiences[r.experience_id].tags) & set(orig.tags):  # preserves intent
            return r
    return None


def replan(it: Itinerary, state: TravelerState, event: ContextEvent, seed: Seed) -> Replan:
    it = it.model_copy(deep=True)
    ongoing = _freeze_past(it, event.at)
    state = _new_state(state, event, it, ongoing)
    slack = timedelta(minutes=PACE_SLACK_MIN[state.pace])
    spent = sum(s.cost_inr for s in it.stops if s.status in ("completed", "active"))

    # 1. Walk the upcoming stops under the new state; mark what broke.
    changes, broken = [], []
    pos, t = (state.lat, state.lon), state.window_start
    for s in upcoming(it):
        problem = _problem(s, pos, t, spent, state, event, seed)
        cancelled = s.experience_id == event.experience_id and event.kind in (
            "closure", "provider_cancel")
        if problem and s.locked and not cancelled:
            changes.append(Change(action="at_risk", stop=s.title, reason=problem))
        elif problem:
            s.status = "replaced"
            broken.append((s, problem))
            continue
        pos, t, spent = (s.lat, s.lon), s.end + slack, spent + s.cost_inr

    # 2. Repair each broken stop inside the gap it left, earliest first.
    for old, problem in broken:
        if alt := _alternative(it, old, state, event, seed):
            new = to_stop(alt)
            it.stops.append(new)
            same = alt.experience_id == old.experience_id
            changes.append(Change(
                action="retimed" if same else "replaced", stop=old.title, reason=problem,
                new_stop=f"{new.title} at {new.start:%H:%M}", why=alt.reasons))
        else:
            changes.append(Change(action="dropped", stop=old.title,
                                  reason=f"{problem}; nothing comparable fits that slot"))
    it.stops.sort(key=lambda s: s.start)
    return Replan(itinerary=it, state=state, changes=changes)
