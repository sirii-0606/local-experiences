import sqlite3

import pytest
from fastapi.testclient import TestClient

from app import store
from app.main import SEED, app, seed
from app.provider import draft_rules

client = TestClient(app)
NOW = "2026-09-26T11:30:00"
SALIM = (
    "I'm Salim, a lac bangle maker in Maniharon ka Rasta near Tripolia Bazaar. Our family "
    "has made bangles for five generations. Visitors can watch and make their own bangle, "
    "45 minutes, ₹250 per person, open 11am to 7pm, closed on Friday. Kids welcome, up to "
    "6 people."
)
CRAFT_SEEKER = "Solo, near Tripolia Bazaar, 12 to 3pm, ₹1000, hidden gems and craft"


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    monkeypatch.setenv("INTENT_PARSER", "rules")


def publish(text=SALIM, **overrides):
    d = client.post("/providers/draft", json={"text": text}).json()["draft"]
    return client.post("/providers/listings", json={"draft": d | overrides, "today": NOW})


def chat(text):
    r = client.post("/chat", json={"text": text, "now": NOW})
    assert r.status_code == 200, r.text
    return r.json()


def test_rule_draft_reads_a_provider_description():
    d = draft_rules(SALIM, SEED)
    assert d.near == "Tripolia Bazaar" and d.provider_name == "Salim"
    assert (d.price_inr, d.price_model, d.duration_min) == (250, "per_person", 45)
    assert (d.open_time, d.close_time, d.capacity) == ("11:00", "19:00", 6)
    assert 4 not in d.days and len(d.days) == 6  # closed on Friday
    assert {"craft", "jewellery", "kids"} <= set(d.tags) and d.category == "art"
    assert not {"shopping", "market"} & set(d.tags)  # "Tripolia Bazaar" is a place, not an intent
    assert d.title == "Make your own bangle with Salim"
    assert d.community_led and d.indoor


def test_scenario_c_new_provider_reaches_matching_traveler():
    before = chat(CRAFT_SEEKER)
    r = publish()
    assert r.status_code == 200, r.text
    new_id = r.json()["experience"]["id"]
    assert new_id not in {x["experience_id"] for x in before["recommendations"]}
    after = chat(CRAFT_SEEKER)
    rec = next(x for x in after["recommendations"] if x["experience_id"] == new_id)
    assert "run by a local community host" in rec["reasons"]
    assert not rec["low_confidence"]  # fresh provider-stated facts
    assert new_id in client.get("/catalog").json()["provider_listings"]


@pytest.mark.parametrize(
    "override, message",
    [
        ({"near": "Somewhere unknown"}, "nearest landmark"),
        ({"open_time": "11:00", "close_time": "11:30"}, "shorter than"),
        ({"tags": []}, "at least one tag"),
    ],
)
def test_publish_rejects_unusable_drafts(override, message):
    r = publish(**override)
    assert r.status_code == 422 and message in r.json()["detail"]


def test_pause_hides_from_discovery_and_resume_restores():
    state = chat("solo near Tripolia Bazaar, 10am to 1pm, ₹2000, craft workshops")["state"]

    def get_ids():
        return {
            x["experience_id"]
            for x in client.post("/discover", json={"state": state, "k": 50}).json()[
                "recommendations"
            ]
        }

    assert "ex-pottery-workshop" in get_ids()
    client.post(
        "/providers/availability", json={"experience_id": "ex-pottery-workshop", "paused": True}
    )
    assert "ex-pottery-workshop" not in get_ids()
    assert client.get("/providers/insights/ex-pottery-workshop").json()["paused"] is True
    client.post(
        "/providers/availability", json={"experience_id": "ex-pottery-workshop", "paused": False}
    )
    assert "ex-pottery-workshop" in get_ids()


def test_insights_explain_lost_demand():
    # families wanting a hands-on food experience, but ₹1500 for 4 can't cover the cooking class
    for _ in range(3):
        chat("family of 4 with two kids near Bani Park, 4 to 8pm, ₹1500, cooking class, local food")
    ins = client.get("/providers/insights/ex-cooking-class").json()
    assert ins["matching_searches"] == 3 and ins["with_kids"] == 3
    assert ins["why_not_chosen"][0][0] == "over their budget"
    assert ins["tips"] and "cheaper" in ins["tips"][0]


def test_demand_log_stores_no_location_or_text():
    chat(CRAFT_SEEKER)
    with sqlite3.connect(store.db_path()) as c:
        cols = [r[1] for r in c.execute("pragma table_info(demand)")]
    assert not {"lat", "lon", "text", "location"} & set(cols)


def test_an_empty_llm_draft_is_filled_from_the_text():
    from app.provider import ListingDraft, merge_draft

    text = (
        "I'm Salim, a lac bangle maker in Maniharon ka Rasta near Tripolia Bazaar. Our family has "
        "made bangles for five generations. Visitors can watch and make their own bangle, 45 "
        "minutes, ₹250 per person, open 11am to 7pm, closed on Friday. Kids welcome, "
        "up to 6 people."
    )
    rules = draft_rules(text, SEED)
    # what the free-tier model actually returned: the schema defaults and one real tag
    lazy = ListingDraft(tags=["craft"], near="Invented Palace")
    d = merge_draft(lazy, rules, SEED)
    assert d.title and d.provider_name == "Salim" and d.near == "Tripolia Bazaar"
    assert (d.price_inr, d.duration_min, d.open_time, d.close_time, d.capacity) == (
        250,
        45,
        "11:00",
        "19:00",
        6,
    )
    assert 4 not in d.days and d.community_led
    assert d.tags == ["craft"]  # what the LLM did fill in is kept


def test_other_listings_are_not_landmarks_for_a_new_draft():
    from app.provider import draft

    text = "I'm Salim, lac bangles near Tripolia Bazaar, 45 minutes, ₹250"
    client.post("/providers/listings", json={"draft": draft_rules(text, SEED).model_dump()})
    d, _ = draft(text, seed())
    assert d.near == "Tripolia Bazaar" and "shopping" not in d.tags
