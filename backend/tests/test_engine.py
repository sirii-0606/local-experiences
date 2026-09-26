from datetime import date, datetime, timedelta
from math import cos, hypot, radians

import pytest

from app.engine.feasibility import check
from app.engine.rank import discover
from app.models import Evidence, Traveler, TravelerState
from app.seed import load_seed

SEED = load_seed()
HAWA_MAHAL = (26.9239, 75.8267)
JKK = (26.8970, 75.8107)
JAL_MAHAL = (26.9535, 75.8462)
SAT = date(2026, 9, 26)


def state(where, day, start_h, end_h, budget, group=None, **kw):
    return TravelerState(
        lat=where[0],
        lon=where[1],
        budget_inr=budget,
        window_start=datetime.combine(day, datetime.min.time()) + timedelta(hours=start_h),
        window_end=datetime.combine(day, datetime.min.time()) + timedelta(hours=end_h),
        group=group or [Traveler()],
        **kw,
    )


FAMILY = [
    Traveler(name="mum", age=40),
    Traveler(name="dad", age=42),
    Traveler(name="kid1", age=11, interests=["craft", "kids"]),
    Traveler(name="kid2", age=8),
]
SCENARIO_A = state(
    HAWA_MAHAL, SAT, 16, 18, 1500, FAMILY, intents=["local-food", "heritage", "performance"]
)

PERSONAS = {
    "scenario_a_family": SCENARIO_A,
    "wheelchair_senior": state(
        HAWA_MAHAL,
        SAT,
        10,
        14,
        1000,
        [Traveler(age=72, accessibility=["wheelchair"])],
        intents=["history", "museum"],
    ),
    "zero_budget_student": state(JKK, SAT, 14, 20, 0, [Traveler(age=21)], intents=["art"]),
    "early_riser": state(JAL_MAHAL, SAT, 5.75, 8, 800, intents=["wellness", "sunrise"]),
    "rainy_indoor_couple": state(
        HAWA_MAHAL, SAT, 11, 15, 3000, [Traveler(), Traveler()], indoor_only=True, intents=["craft"]
    ),
    "walker_1km": state(HAWA_MAHAL, SAT, 9, 21, 2000, mode="walk", max_distance_km=1.0),
    "hidden_gems_solo": state(
        HAWA_MAHAL,
        SAT,
        10,
        18,
        2000,
        avoid_crowds=True,
        novelty=0.6,
        intents=["hidden-gem", "craft"],
    ),
    "folk_night_sunday": state(JKK, date(2026, 9, 27), 18.5, 22, 500, intents=["music"]),
}


def assert_independently_feasible(rec, s):
    """Re-derive feasibility without engine code: the recommendation must hold up on its own."""
    e = SEED.experiences[rec.experience_id]
    place = SEED.places[e.place_id]
    day, size = s.window_start.date(), len(s.group)
    # distance via equirectangular approximation, independent of the engine's haversine
    km = hypot((place.lon - s.lon) * 111.32 * cos(radians(s.lat)), (place.lat - s.lat) * 110.57)
    assert rec.km == pytest.approx(km, rel=0.05, abs=0.05)
    assert s.window_start + timedelta(minutes=rec.travel_min) <= rec.start
    assert rec.end == rec.start + timedelta(minutes=e.duration_min) <= s.window_end
    assert any(
        (w.on_date == day if w.on_date else day.weekday() in w.days)
        and w.start <= rec.start.time()
        and rec.end.time() <= w.end
        and (not w.slots or rec.start.time() in w.slots)
        for w in e.availability
    ), f"{e.id} not open at {rec.start:%H:%M}"
    cost = {"per_person": e.price_inr * size, "per_group": e.price_inr}.get(e.price_model, 0)
    assert rec.cost_inr == cost <= s.budget_inr
    assert size <= e.capacity and min(t.age for t in s.group) >= e.min_age
    assert {a for t in s.group for a in t.accessibility} <= set(e.accessibility)
    assert e.indoor or not s.indoor_only
    assert s.max_distance_km is None or rec.km <= s.max_distance_km


@pytest.mark.parametrize("name", PERSONAS)
def test_every_recommendation_is_independently_feasible(name):
    recs, excluded = discover(PERSONAS[name], SEED)
    assert recs, f"{name}: nothing recommended"
    for r in recs:
        assert_independently_feasible(r, PERSONAS[name])
        assert r.experience_id not in excluded
    assert len(recs) + len(excluded) <= len(SEED.experiences)


def test_scenario_a_family_food_and_culture():
    recs, excluded = discover(SCENARIO_A, SEED)
    ids = {r.experience_id for r in recs}
    assert "no time left" in excluded["ex-hawa-mahal"][0]
    assert any("over your ₹1500 budget" in x for x in excluded["ex-street-food-walk"])
    cats = {SEED.experiences[i].category for i in ids}
    assert "food" in cats and cats - {"food"}, "should mix food with something else"
    assert all(len(r.reasons) >= 3 for r in recs)


def test_low_confidence_is_flagged_not_hidden():
    recs, _ = discover(PERSONAS["early_riser"], SEED)
    yoga = next(r for r in recs if r.experience_id == "ex-sunrise-yoga")
    assert yoga.low_confidence
    assert any(x.startswith("⚠ hours last confirmed 01 Nov 2025") for x in yoga.reasons)


def test_one_off_event_only_on_its_date():
    recs, _ = discover(PERSONAS["folk_night_sunday"], SEED)
    assert "ex-jkk-folk-evening" in {r.experience_id for r in recs}
    monday = PERSONAS["folk_night_sunday"].model_copy(
        update={
            "window_start": datetime(2026, 9, 28, 18, 30),
            "window_end": datetime(2026, 9, 28, 22),
        }
    )
    _, excluded = discover(monday, SEED)
    assert excluded["ex-jkk-folk-evening"] == ["not running on Monday 28 Sep"]


def test_unconfirmed_accessibility_fails_hard_constraint():
    exp = SEED.experiences["ex-chai-boardgames"].model_copy(
        update={
            "evidence": {"accessibility": Evidence(source="provider", updated_at=date(2025, 1, 1))}
        }
    )
    s = state((26.9050, 75.8060), SAT, 16, 20, 1000, [Traveler(accessibility=["wheelchair"])])
    assert check(exp, s, SEED).reasons == ["accessibility claim is unconfirmed"]


def test_iconic_intent_rewards_popularity():
    s = state(HAWA_MAHAL, SAT, 9, 13, 1000, intents=["iconic", "heritage"])
    top = discover(s, SEED, k=3)[0]
    assert all(SEED.experiences[r.experience_id].tourist_index >= 0.8 for r in top)


def test_hidden_gems_prefer_low_tourist_index():
    recs, _ = discover(PERSONAS["hidden_gems_solo"], SEED)
    assert all(SEED.experiences[r.experience_id].tourist_index <= 0.3 for r in recs)
