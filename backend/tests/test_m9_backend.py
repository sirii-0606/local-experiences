"""M9 backend: post-visit ratings as evidence, provider ownership + edits, booking stub."""
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.engine.confidence import with_ratings
from app.main import SEED, app
from app.models import Evidence

client = TestClient(app)
NOW = "2026-09-26T15:30:00"
FAMILY = ("We're a family of 4 with two kids near Hawa Mahal, free 4–6 pm, ₹1500 total, "
          "want local food and something cultural.")
SALIM = ("I'm Salim, a lac bangle maker near Tripolia Bazaar. Visitors can make their own bangle, "
         "45 minutes, ₹250 per person, open 11am to 7pm. Kids welcome, up to 6 people.")
TODAY = date(2026, 9, 26)


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    monkeypatch.setenv("INTENT_PARSER", "rules")
    monkeypatch.delenv("SEED_ADMIN_TOKEN", raising=False)


def chat(text=FAMILY):
    r = client.post("/chat", json={"text": text, "now": NOW})
    assert r.status_code == 200, r.text
    return r.json()


def rec(out, eid):
    return next(x for x in out["recommendations"] if x["experience_id"] == eid)


# ---------------------------------------------------------------- ratings -> evidence

def test_good_visits_become_traveler_evidence():
    puppets = SEED.experiences["ex-puppet-show"]  # price is only a provider claim today
    out = with_ratings(puppets, [(TODAY, 5, True), (TODAY, 4, True), (TODAY, 5, None)])
    assert out.evidence["price_inr"] == Evidence(source="traveler", updated_at=TODAY)
    assert out.review_count == puppets.review_count + 3
    n = puppets.review_count
    assert out.rating == round((puppets.rating * n + 14) / (n + 3), 2)


def test_disputed_visits_do_not_upgrade_and_verified_is_never_replaced():
    kites = SEED.experiences["ex-kite-making"]
    disputed = with_ratings(kites, [(TODAY, 2, False), (TODAY, 3, False), (TODAY, 5, True)])
    assert disputed.evidence == kites.evidence
    hawa = SEED.experiences["ex-hawa-mahal"]  # hours verified
    assert with_ratings(hawa, [(TODAY, 5, True)]).evidence["availability"].source == "verified"


def test_ratings_through_the_api_clear_the_unverified_badge():
    assert rec(chat(), "ex-puppet-show")["low_confidence"]
    state = chat()["state"]
    for stars in (5, 4, 5):
        r = client.post("/feedback", json={"state": state, "feedback": {
            "experience_id": "ex-puppet-show", "kind": "rating", "rating": stars,
            "as_described": True, "at": NOW}})
        assert r.status_code == 200, r.text
    assert not rec(chat(), "ex-puppet-show")["low_confidence"]
    ins = client.get("/providers/insights/ex-puppet-show").json()
    assert ins["review_count"] == SEED.experiences["ex-puppet-show"].review_count + 3


def test_rating_needs_stars():
    r = client.post("/feedback", json={"state": chat()["state"], "feedback": {
        "experience_id": "ex-puppet-show", "kind": "rating", "at": NOW}})
    assert r.status_code == 422


# ---------------------------------------------------------------- provider ownership + edits

def publish():
    d = client.post("/providers/draft", json={"text": SALIM}).json()["draft"]
    r = client.post("/providers/listings", json={"draft": d, "today": NOW})
    assert r.status_code == 200, r.text
    return r.json()


def test_only_the_owner_can_pause_edit_or_delete():
    listing = publish()
    eid, token = listing["experience"]["id"], listing["edit_token"]
    assert token
    pause = {"experience_id": eid, "paused": True}
    assert client.post("/providers/availability", json=pause).status_code == 403
    assert client.post("/providers/availability", json=pause,
                       headers={"x-provider-token": "guess"}).status_code == 403
    assert client.post("/providers/availability", json=pause,
                       headers={"x-provider-token": token}).status_code == 200
    assert client.delete(f"/providers/listings/{eid}").status_code == 403


def test_owner_edits_keep_the_same_listing():
    listing = publish()
    eid, token = listing["experience"]["id"], listing["edit_token"]
    draft = client.get(f"/providers/listings/{eid}").json()["draft"]
    assert draft["near"] == "Tripolia Bazaar" and draft["price_inr"] == 250
    r = client.put(f"/providers/listings/{eid}", json={"draft": draft | {"price_inr": 200}},
                   headers={"x-provider-token": token})
    assert r.status_code == 200, r.text
    assert r.json()["experience"]["id"] == eid and r.json()["experience"]["price_inr"] == 200
    assert client.put(f"/providers/listings/{eid}", json={"draft": draft}).status_code == 403
    assert client.delete(f"/providers/listings/{eid}",
                         headers={"x-provider-token": token}).status_code == 200
    assert eid not in {e["id"] for e in client.get("/catalog").json()["experiences"]}


def test_seed_experiences_can_be_locked_with_an_admin_token(monkeypatch):
    pause = {"experience_id": "ex-pottery-workshop", "paused": False}
    assert client.post("/providers/availability", json=pause).status_code == 200  # demo: open
    monkeypatch.setenv("SEED_ADMIN_TOKEN", "s3cret")
    assert client.post("/providers/availability", json=pause).status_code == 403
    assert client.post("/providers/availability", json=pause,
                       headers={"x-provider-token": "s3cret"}).status_code == 200


# ---------------------------------------------------------------- bookings

def planned_with_kites():
    state = chat()["state"]
    p = client.post("/plan", json={"state": state, "max_new": 0, "add": "ex-kite-making"}).json()
    return state, p["itinerary"]


def book(state, it, eid="ex-kite-making"):
    return client.post("/bookings", json={"state": state, "itinerary": it, "experience_id": eid})


def test_booking_confirms_and_locks_the_stop():
    state, it = planned_with_kites()
    r = book(state, it)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["code"].startswith("LE-") and out["people"] == 4
    stop = next(s for s in out["itinerary"]["stops"] if s["experience_id"] == "ex-kite-making")
    assert stop["status"] == "confirmed" and stop["locked"]
    assert client.get("/providers/insights/ex-kite-making").json()["booked_people"] == 4


def test_booking_respects_capacity_and_cancelling_frees_it():
    state, it = planned_with_kites()  # kite-making takes 8 per slot; this family is 4
    first = book(state, it).json()["code"]
    assert book(state, it).status_code == 200
    full = book(state, it)
    assert full.status_code == 409 and "only 0 spots left" in full.json()["detail"]
    assert client.delete(f"/bookings/{first}").status_code == 200
    assert book(state, it).status_code == 200
    assert client.delete("/bookings/LE-NOPE00").status_code == 404


def test_booking_needs_the_stop_in_the_plan():
    state, it = planned_with_kites()
    r = book(state, it, "ex-masala-chowk")
    assert r.status_code == 422 and "add it to your plan" in r.json()["detail"]


def test_root_opens_the_docs():
    r = client.get("/", follow_redirects=False)
    assert r.status_code in (302, 307) and r.headers["location"] == "/docs"


def test_prod_api_prefix_and_static_spa(tmp_path, monkeypatch):
    assert client.get("/api/health").json()["ok"] is True
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><title>LE</title>", encoding="utf-8")
    (dist / "assets" / "app.js").write_text("console.log('ok')", encoding="utf-8")
    monkeypatch.setenv("STATIC_DIR", str(dist))
    assert "<!doctype html>" in client.get("/").text
    assert "<!doctype html>" in client.get("/trips/new").text
    assert "console.log('ok')" in client.get("/assets/app.js").text
    assert client.get("/api/health").json()["ok"] is True
    assert client.get("/health").json()["ok"] is True

