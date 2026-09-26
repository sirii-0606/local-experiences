from test_engine import HAWA_MAHAL, SAT, SEED, state
from test_itinerary import LUNCH, PALACE, assert_sequence_ok, at

from app.engine.adapt import replan
from app.engine.itinerary import upcoming, validate
from app.models import ContextEvent, Itinerary, Stop


def exp_stop(eid, h, m=0, **kw):
    e, = [SEED.experiences[eid]]
    p = SEED.places[e.place_id]
    start = at(h, m)
    return Stop(title=e.title, experience_id=eid, lat=p.lat, lon=p.lon, start=start,
                end=start + (at(0, e.duration_min) - at(0)), cost_inr=e.price_inr, **kw)


KITES = exp_stop("ex-kite-making", 10)
JANTAR = exp_stop("ex-jantar-mantar", 13, 45)  # outdoor, weather-sensitive
PUPPETS = exp_stop("ex-puppet-show", 17)
DAY = Itinerary(stops=[KITES, LUNCH, JANTAR, PALACE, PUPPETS])
S = state(HAWA_MAHAL, SAT, 9, 20, 3000)


def key(s):
    return (s.title, s.start, s.end)


def run(kind, h, m=0, **kw):
    out = replan(DAY, S, ContextEvent(kind=kind, at=at(h, m), **kw), SEED)
    at_risk = {c.stop for c in out.changes if c.action == "at_risk"}
    problems = validate(out.itinerary, out.state, SEED)
    # only a locked stop we reported as at risk may still be broken
    assert all(any(t in p for t in at_risk) for p in problems), (problems, out.changes)
    if not at_risk:
        assert_sequence_ok(Itinerary(stops=upcoming(out.itinerary)), out.state)
    for locked in (LUNCH, PALACE):
        if kind != "provider_cancel":
            assert key(locked) in {key(s) for s in out.itinerary.stops if s.status != "replaced"}
    return out


def untouched(out, *stops):
    live = {key(s) for s in out.itinerary.stops if s.status != "replaced"}
    return all(key(s) in live for s in stops)


def test_base_day_is_valid():
    assert validate(DAY, S, SEED) == []


def test_closure_replaces_only_that_stop_with_same_intent():
    out = run("closure", 11, 30, experience_id="ex-jantar-mantar")
    assert [c.stop for c in out.changes] == [JANTAR.title]
    c = out.changes[0]
    assert c.action == "replaced" and c.reason == "closed today" and c.why
    new = next(s for s in out.itinerary.stops if s.title == c.new_stop.split(" at ")[0])
    tags = SEED.experiences[new.experience_id].tags
    assert set(tags) & set(SEED.experiences["ex-jantar-mantar"].tags)
    assert untouched(out, PUPPETS)


def test_rain_swaps_outdoor_stop_for_a_dry_one():
    out = run("weather", 11, 30, weather="rain")
    assert [c.stop for c in out.changes] == [JANTAR.title]
    for s in upcoming(out.itinerary):
        e = SEED.experiences.get(s.experience_id) if s.experience_id else None
        assert e is None or e.indoor or not e.weather_sensitive
    assert untouched(out, PUPPETS)


def test_delay_repairs_only_the_missed_stop():
    out = run("delay", 13, 0, delay_min=40)  # lunch overruns: free at 14:10
    assert out.state.window_start == at(14, 10)
    assert [c.stop for c in out.changes] == [JANTAR.title]
    assert untouched(out, PUPPETS)


def test_fatigue_prefers_retiming_over_replacing():
    out = run("fatigue", 11, 30)
    assert out.state.pace == "relaxed"
    puppets = next(c for c in out.changes if c.stop == PUPPETS.title)
    assert puppets.action == "retimed" and puppets.new_stop.endswith("18:30")


def test_budget_cut_replaces_with_cheaper_option():
    out = run("budget_change", 11, 30, budget_inr=100)
    c = next(c for c in out.changes if c.stop == PUPPETS.title)
    assert c.action in ("replaced", "dropped")
    ahead = sum(s.cost_inr for s in upcoming(out.itinerary) if not s.locked)
    assert ahead <= 100


def test_provider_cancel_overrides_lock():
    out = run("provider_cancel", 11, 30, experience_id="ex-city-palace")
    c = next(c for c in out.changes if c.stop == PALACE.title)
    assert c.reason == "cancelled by the provider" and c.action in ("replaced", "dropped")
    assert untouched(out, LUNCH, PUPPETS)


def test_locked_stop_at_risk_is_reported_not_moved():
    out = run("delay", 14, 50, delay_min=30)  # stuck until 15:20; the 15:00 booking is missed
    risk = next(c for c in out.changes if c.stop == PALACE.title)
    assert risk.action == "at_risk"
    assert validate(out.itinerary, out.state, SEED)  # still honestly reported as broken


def test_irrelevant_change_is_a_no_op():
    out = run("weather", 11, 30, weather="clear")
    assert out.changes == []
    assert [key(s) for s in upcoming(out.itinerary)] == [key(s) for s in (LUNCH, JANTAR, PALACE,
                                                                          PUPPETS)]
