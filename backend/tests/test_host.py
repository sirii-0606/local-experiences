"""The host loop: signed-in hosts own their listings, booking requests, demand near a host."""

from datetime import date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routes import host

PW = "correct horse 42"
SALIM = (
    "I'm Salim, a lac bangle maker in Maniharon ka Rasta near Tripolia Bazaar. Visitors can "
    "watch and make their own bangle, 45 minutes, ₹250 per person, open 11am to 7pm, closed "
    "on Friday. Up to 6 people."
)
MONDAY = date.today() + timedelta(days=7 - date.today().weekday())  # next Monday, open
SLOT = datetime.combine(MONDAY, datetime.min.time()).replace(hour=12).isoformat()


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    monkeypatch.setenv("INTENT_PARSER", "rules")


def signup(email: str, name: str) -> TestClient:
    c = TestClient(app, headers={"X-Requested-With": "le"})
    r = c.post("/auth/register", json={"email": email, "password": PW, "display_name": name})
    assert r.status_code == 201, r.text
    return c


def publish(c: TestClient) -> str:
    d = c.post("/providers/draft", json={"text": SALIM}).json()["draft"]
    r = c.post("/providers/listings", json={"draft": d})
    assert r.status_code == 200, r.text
    return r.json()["experience"]["id"]


def test_signed_in_host_owns_listing_without_the_token():
    salim = signup("salim@example.com", "Salim")
    eid = publish(salim)
    assert salim.get("/auth/me").json()["role"] == "provider"  # traveler became a host
    mine = salim.get("/me/listings").json()
    assert [x["experience_id"] for x in mine] == [eid] and mine[0]["pending_requests"] == 0

    pause = {"experience_id": eid, "paused": True}
    assert salim.post("/providers/availability", json=pause).status_code == 200
    other = signup("mallory@example.com", "Mallory")
    assert other.post("/providers/availability", json=pause).status_code == 403
    assert other.get("/me/listings").json() == []
    assert other.delete(f"/providers/listings/{eid}").status_code == 403
    assert salim.delete(f"/providers/listings/{eid}").status_code == 200
    assert salim.get("/me/listings").json() == []


def test_request_accept_gives_a_booking_code_the_traveler_can_review_with():
    salim = signup("salim2@example.com", "Salim")
    eid = publish(salim)
    asha = signup("asha2@example.com", "Asha")
    body = {"experience_id": eid, "start": SLOT, "people": 2, "note": "first time"}

    assert salim.post("/requests", json=body).status_code == 409  # not your own listing
    too_many = asha.post("/requests", json=body | {"people": 7})
    assert too_many.status_code == 409 and "spots left" in too_many.json()["detail"]
    closed = asha.post("/requests", json=body | {"start": SLOT.replace("T12", "T20")})
    assert closed.status_code == 409  # after 7 pm

    r = asha.post("/requests", json=body)
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    assert salim.get("/me/listings").json()[0]["pending_requests"] == 1
    inbox = salim.get("/me/requests/incoming").json()
    assert inbox[0]["traveler_name"] == "Asha" and "email" not in inbox[0]
    assert "traveler_id" not in inbox[0]

    assert asha.post(f"/me/requests/{rid}/decision", json={"accept": True}).status_code == 404
    done = salim.post(f"/me/requests/{rid}/decision", json={"accept": True}).json()
    assert done["status"] == "accepted" and done["booking_code"].startswith("LE-")
    assert salim.post(f"/me/requests/{rid}/decision", json={"accept": False}).status_code == 409
    mine = asha.get("/me/requests").json()
    assert mine[0]["booking_code"] == done["booking_code"]

    # the traveler cancels: the booking goes too
    assert asha.delete(f"/me/requests/{rid}").json()["status"] == "cancelled"
    assert asha.delete(f"/bookings/{done['booking_code']}").status_code == 404


def test_anonymous_and_unowned_listings_take_no_requests():
    anon = TestClient(app, headers={"X-Requested-With": "le"})
    d = anon.post("/providers/draft", json={"text": SALIM}).json()["draft"]
    eid = anon.post("/providers/listings", json={"draft": d}).json()["experience"]["id"]
    asha = signup("asha3@example.com", "Asha")
    body = {"experience_id": eid, "start": SLOT, "people": 1}
    assert asha.post("/requests", json=body).status_code == 404  # no host account behind it
    assert anon.post("/requests", json=body).status_code == 401


def test_demand_near_you_shows_aggregates_and_unmet_wants():
    c = TestClient(app, headers={"X-Requested-With": "le"})
    where = {"lat": 26.9239, "lon": 75.8267}  # Hawa Mahal
    assert c.get("/providers/demand", params=where).json()["searches"] == 0
    for _ in range(host.MIN_SEARCHES):
        c.post("/chat", json={"text": "2 hours, pottery and kite flying", "now": SLOT, **where})
    d = c.get("/providers/demand", params=where).json()
    assert d["searches"] >= host.MIN_SEARCHES and d["wanted"]
    far = c.get("/providers/demand", params={"lat": 19.07, "lon": 72.87}).json()
    assert far["searches"] == 0  # Mumbai sees nothing of Jaipur's searches
