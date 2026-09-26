"""Itinerary intelligence (doc §8): find gaps, fill them, and check the whole sequence.

The existing itinerary is a first-class input: locked stops never move, new stops go in gaps.
"""

from collections.abc import Collection
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.engine.feasibility import earliest_start, km_between, rained_out, travel_min
from app.engine.rank import Recommendation, discover
from app.models import Itinerary, Stop, TravelerState
from app.seed import Seed

MIN_GAP_MIN = 30
PACE_SLACK_MIN = {"relaxed": 20, "normal": 0, "packed": 0}  # breathing room after each stop
INACTIVE = {"skipped", "replaced"}


@dataclass
class Gap:
    start: datetime
    end: datetime
    origin: tuple[float, float]  # where you are when the gap opens
    dest: tuple[float, float] | None  # where you must be when it closes (None = anywhere)


def active(it: Itinerary) -> list[Stop]:
    """Stops that count: done, in progress, or still ahead. Used for budget."""
    return sorted((s for s in it.stops if s.status not in INACTIVE), key=lambda s: s.start)


def upcoming(it: Itinerary) -> list[Stop]:
    """Stops still ahead. Planning starts from state.lat/lon at window_start."""
    return [s for s in active(it) if s.status in ("proposed", "confirmed")]


def remaining_budget(it: Itinerary, state: TravelerState) -> int:
    return state.budget_inr - sum(s.cost_inr for s in active(it))


def gaps(it: Itinerary, state: TravelerState, min_minutes: int = MIN_GAP_MIN) -> list[Gap]:
    slack = timedelta(minutes=PACE_SLACK_MIN[state.pace])
    end_dest = (state.end_lat, state.end_lon) if state.end_lat is not None else None
    out, pos, t = [], (state.lat, state.lon), state.window_start
    for s in upcoming(it):
        if s.start - t >= timedelta(minutes=min_minutes):
            out.append(Gap(t, s.start, pos, (s.lat, s.lon)))
        pos, t = (s.lat, s.lon), max(t, s.end + slack)
    if state.window_end - t >= timedelta(minutes=min_minutes):
        out.append(Gap(t, state.window_end, pos, end_dest))
    return out


def fill_gap(
    it: Itinerary,
    gap: Gap,
    state: TravelerState,
    seed: Seed,
    k: int = 5,
    skip: Collection[str] = (),
) -> list[Recommendation]:
    """Experiences reachable from the previous stop and done in time for the next."""
    narrowed = state.model_copy(
        update={
            "lat": gap.origin[0],
            "lon": gap.origin[1],
            "window_start": gap.start,
            "window_end": gap.end,
            "end_lat": gap.dest[0] if gap.dest else None,
            "end_lon": gap.dest[1] if gap.dest else None,
            "budget_inr": remaining_budget(it, state),
        }
    )
    used = {s.experience_id for s in active(it) if s.experience_id}
    return discover(narrowed, seed, k, skip=used | set(skip))[0]


def to_stop(rec: Recommendation) -> Stop:
    return Stop(
        title=rec.title,
        experience_id=rec.experience_id,
        lat=rec.lat,
        lon=rec.lon,
        start=rec.start,
        end=rec.end,
        cost_inr=rec.cost_inr,
    )


def insert(it: Itinerary, experience_id: str, state: TravelerState, seed: Seed) -> Itinerary | None:
    """Fit one chosen experience into the earliest gap where it's feasible; None if nowhere."""
    exp = seed.experiences[experience_id]
    only = Seed(seed.providers, seed.places, {exp.id: exp})
    for gap in gaps(it, state, min_minutes=1):
        if recs := fill_gap(it, gap, state, only, k=1):
            out = it.model_copy(deep=True)
            out.stops.append(to_stop(recs[0]))
            out.stops.sort(key=lambda s: s.start)
            return out
    return None


def plan(it: Itinerary, state: TravelerState, seed: Seed, max_new: int = 3) -> Itinerary:
    """Fill the itinerary's gaps, earliest first, around whatever is already planned.

    ponytail: greedy (best item for the earliest gap, repeat); beam search if plans look myopic.
    Intents already covered by a picked stop are dropped for the next pick so the plan mixes them.
    """
    it = it.model_copy(deep=True)
    intents = list(state.intents)
    for _ in range(max_new):
        pick = None
        for gap in gaps(it, state):
            if recs := fill_gap(it, gap, state.model_copy(update={"intents": intents}), seed, 1):
                pick = recs[0]
                break
        if pick is None:
            break
        it.stops.append(to_stop(pick))
        covered = set(seed.experiences[pick.experience_id].tags)
        intents = [i for i in intents if i not in covered] or list(state.intents)
    it.stops.sort(key=lambda s: s.start)
    return it


def validate(it: Itinerary, state: TravelerState, seed: Seed) -> list[str]:
    """Whole-sequence feasibility (doc §8.2). Empty list = the plan holds up."""
    problems = []
    pos, t = (state.lat, state.lon), state.window_start
    for s in upcoming(it):
        need = travel_min(km_between(*pos, s.lat, s.lon), state.mode)
        if s.start < t + timedelta(minutes=need):
            problems.append(
                f"can't reach {s.title} by {s.start:%H:%M} (needs {need} min after {t:%H:%M})"
            )
        if s.experience_id:
            exp = seed.experiences[s.experience_id]
            if s.end - s.start != timedelta(minutes=exp.duration_min):
                problems.append(f"{s.title} needs {exp.duration_min} min")
            if earliest_start(exp, s.start) != s.start:
                problems.append(f"{s.title} can't start at {s.start:%H:%M}")
            if rained_out(exp, state):
                problems.append(f"{s.title} is outdoors in the rain")
        if not s.locked and s.end > state.window_end:
            problems.append(f"{s.title} ends after your {state.window_end:%H:%M} cutoff")
        pos, t = (s.lat, s.lon), max(t, s.end)
    if state.end_lat is not None:
        need = travel_min(km_between(*pos, state.end_lat, state.end_lon), state.mode)
        if t + timedelta(minutes=need) > state.window_end:
            problems.append(f"can't get to your end point by {state.window_end:%H:%M}")
    if (left := remaining_budget(it, state)) < 0:
        problems.append(f"₹{-left} over budget")
    return problems
