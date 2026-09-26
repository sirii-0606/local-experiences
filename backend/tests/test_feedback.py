from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from test_engine import HAWA_MAHAL, SAT, SEED, state

from app.engine.learn import learn
from app.engine.rank import discover
from app.main import app
from app.models import Feedback, Traveler

client = TestClient(app)
AT = datetime(2026, 9, 26, 11)
EXPLORER = state(HAWA_MAHAL, SAT, 10, 18, 2000, intents=["hidden-gem"], novelty=0.6)


def fb(eid, kind, reason=None):
    return Feedback(experience_id=eid, kind=kind, reason=reason, at=AT)


def rank_of(eid, s):
    recs, _ = discover(s, SEED, k=50)
    return [r.experience_id for r in recs].index(eid)


def test_reject_hides_it_and_teaches_taste():
    first = discover(EXPLORER, SEED)[0][0].experience_id
    s = learn(EXPLORER, SEED.experiences[first], fb(first, "reject", "not_interested"))
    recs, excluded = discover(s, SEED)
    assert first not in {r.experience_id for r in recs}
    assert excluded[first] == ["you said no to this earlier"]
    assert s.learned and all(v < 0 for v in s.learned.values())


def test_practical_reasons_do_not_change_taste():
    s = learn(EXPLORER, SEED.experiences["ex-kite-making"],
              fb("ex-kite-making", "reject", "too_expensive"))
    assert s.learned == {} and s.rejected == ["ex-kite-making"]


def test_accepting_boosts_similar_experiences_and_says_so():
    before = rank_of("ex-pottery-workshop", EXPLORER)
    s = EXPLORER
    for eid in ("ex-kite-making", "ex-block-print-workshop"):  # two hands-on craft picks
        s = learn(s, SEED.experiences[eid], fb(eid, "accept"))
    assert rank_of("ex-pottery-workshop", s) < before
    recs = {r.experience_id: r for r in discover(s, SEED, k=50)[0]}
    assert "similar to things you liked" in recs["ex-pottery-workshop"].reasons
    # sharing one generic tag ("hidden-gem") is not "similar"
    assert "similar to things you liked" not in recs["ex-galta-ji"].reasons


def test_no_reason_is_weaker_than_not_my_thing():
    e = SEED.experiences["ex-lassi"]
    skipped = learn(EXPLORER, e, fb(e.id, "skip"))
    bare = learn(EXPLORER, e, fb(e.id, "reject"))
    disliked = learn(EXPLORER, e, fb(e.id, "reject", "not_interested"))
    assert 0 > skipped.learned["sweets"] == bare.learned["sweets"] > disliked.learned["sweets"]
    assert e.id not in skipped.rejected and e.id in bare.rejected


def test_suitability_tags_are_not_taste():
    e = SEED.experiences["ex-masala-chowk"]  # tagged family, kids, vegetarian as well as food
    s = learn(EXPLORER, e, fb(e.id, "reject", "not_interested"))
    assert s.learned["street-food"] < 0
    assert not {"family", "kids", "vegetarian"} & s.learned.keys()


def test_group_reasons_name_who_it_is_for():
    group = [Traveler(name="Asha", interests=["craft"]),
             Traveler(name="Ravi", interests=["wildlife"])]
    s = state(HAWA_MAHAL, SAT, 10, 18, 4000, group)
    recs = discover(s, SEED, k=50)[0]
    kites = next(r for r in recs if r.experience_id == "ex-kite-making")
    assert "especially for Asha" in kites.reasons


@pytest.fixture
def offline(monkeypatch):
    monkeypatch.setenv("INTENT_PARSER", "rules")


def test_feedback_endpoint_round_trip_and_provider_sees_reasons(offline):
    chat = client.post("/chat", json={"text": "solo near Tripolia Bazaar, 10am to 2pm, Rs 2000, "
                                              "craft", "now": "2026-09-26T09:30:00"}).json()
    eid = chat["recommendations"][0]["experience_id"]
    r = client.post("/feedback", json={"state": chat["state"], "feedback": {
        "experience_id": eid, "kind": "reject", "reason": "too_far", "at": "2026-09-26T09:31:00"}})
    assert r.status_code == 200, r.text
    out = r.json()
    assert eid in out["state"]["rejected"] and eid not in {
        x["experience_id"] for x in out["recommendations"]}
    ins = client.get(f"/providers/insights/{eid}").json()
    assert ins["passed"] == 1 and ["too far from them", 1] in ins["why_not_chosen"]
