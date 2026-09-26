from datetime import datetime, timedelta
from math import ceil, cos, hypot, radians

from test_engine import HAWA_MAHAL, SAT, SCENARIO_A, SEED, assert_independently_feasible, state

from app.engine.itinerary import fill_gap, gaps, plan, to_stop, validate
from app.engine.rank import discover
from app.models import Itinerary, Stop

JUNCTION = (26.9196, 75.7878)  # Jaipur railway station


def at(h, m=0):
    return datetime.combine(SAT, datetime.min.time()) + timedelta(hours=h, minutes=m)


LUNCH = Stop(title="Lunch at a Johari Bazaar restaurant", lat=26.9205, lon=75.8260,
             start=at(12, 30), end=at(13, 30), status="confirmed", locked=True)
PALACE = Stop(title="City Palace (booked)", experience_id="ex-city-palace",
              lat=26.9258, lon=75.8237, start=at(15), end=at(16, 30),
              status="confirmed", locked=True, cost_inr=200)


def indep_travel(a, b, speed_kmh=18):
    """Independent re-derivation: equirectangular km x 1.3 road factor + 10 min buffer."""
    km = hypot((b[1] - a[1]) * 111.32 * cos(radians(a[0])), (b[0] - a[0]) * 110.57)
    return 0 if km < 0.1 else ceil(km * 1.3 / speed_kmh * 60) + 10


def assert_sequence_ok(it, s):
    stops = sorted((x for x in it.stops if x.status not in ("skipped", "replaced")),
                   key=lambda x: x.start)
    pos, t = (s.lat, s.lon), s.window_start
    for x in stops:
        assert x.start >= t + timedelta(minutes=indep_travel(pos, (x.lat, x.lon)) - 1), x.title
        pos, t = (x.lat, x.lon), x.end
    assert sum(x.cost_inr for x in stops) <= s.budget_inr


def test_gap_between_locked_stops_only_returns_sequence_feasible_fills():
    it, s = Itinerary(stops=[LUNCH, PALACE]), state(HAWA_MAHAL, SAT, 9, 20, 2000)
    gap = next(g for g in gaps(it, s) if g.start == LUNCH.end)
    assert gap.end == PALACE.start  # the 90-min gap
    recs = fill_gap(it, gap, s, SEED, k=10)
    assert recs
    for r in recs:
        assert r.experience_id != "ex-city-palace"  # already planned
        filled = Itinerary(stops=[LUNCH, to_stop(r), PALACE])
        assert validate(filled, s, SEED) == [], r.experience_id
        assert_sequence_ok(filled, s)
        assert r.end + timedelta(minutes=indep_travel((r.lat, r.lon), (PALACE.lat, PALACE.lon))) \
            <= PALACE.start


def test_validate_catches_unreachable_and_closed_stops():
    s = state(HAWA_MAHAL, SAT, 9, 20, 2000)
    amer = Stop(title="Amer Fort", experience_id="ex-amer-fort", lat=26.9855, lon=75.8513,
                start=at(10), end=at(12, 30))
    rushed = PALACE.model_copy(update={"start": at(12, 35), "end": at(14, 5), "locked": False})
    assert any("can't reach City Palace" in p for p in validate(Itinerary(stops=[amer, rushed]),
                                                               s, SEED))
    late = Stop(title="Hawa Mahal", experience_id="ex-hawa-mahal", lat=HAWA_MAHAL[0],
                lon=HAWA_MAHAL[1], start=at(16, 15), end=at(17))
    assert "Hawa Mahal can't start at 16:15" in validate(Itinerary(stops=[late]), s, SEED)


def test_plan_scenario_a_builds_a_mixed_feasible_plan():
    out = plan(Itinerary(), SCENARIO_A, SEED)
    assert len(out.stops) >= 2
    assert validate(out, SCENARIO_A, SEED) == []
    assert_sequence_ok(out, SCENARIO_A)
    cats = {SEED.experiences[x.experience_id].category for x in out.stops}
    assert len(cats) >= 2, cats


def test_plan_never_moves_locked_stops():
    s = state(HAWA_MAHAL, SAT, 9, 20, 2000)
    out = plan(Itinerary(stops=[LUNCH, PALACE]), s, SEED)
    assert LUNCH in out.stops and PALACE in out.stops
    assert len(out.stops) > 2
    assert validate(out, s, SEED) == []
    assert_sequence_ok(out, s)


def test_must_reach_end_point_in_time():
    s = state(HAWA_MAHAL, SAT, 14, 16, 1000, end_lat=JUNCTION[0], end_lon=JUNCTION[1])
    recs, excluded = discover(s, SEED, k=10)
    assert recs
    for r in recs:
        assert_independently_feasible(r, s)
        assert r.end + timedelta(minutes=indep_travel((r.lat, r.lon), JUNCTION)) <= s.window_end
    assert any("to your next stop by 16:00" in x for rs in excluded.values() for x in rs)


def test_relaxed_pace_leaves_breathing_room():
    it = Itinerary(stops=[LUNCH, PALACE])
    normal = gaps(it, state(HAWA_MAHAL, SAT, 9, 20, 2000))
    relaxed = gaps(it, state(HAWA_MAHAL, SAT, 9, 20, 2000, pace="relaxed"))
    assert [g.start for g in normal][1] == LUNCH.end
    assert [g.start for g in relaxed][1] == LUNCH.end + timedelta(minutes=20)
