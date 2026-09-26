"""Trips (v2 website, P3): owner-scoped CRUD and validation."""

from fastapi.testclient import TestClient

from app.main import app

PW = "correct horse 42"
TRIP = {
    "title": "Jaipur with the family",
    "start_date": "2026-10-10",
    "end_date": "2026-10-12",
    "budget_inr": 30000,
    "travelers": [
        {"name": "Asha", "age": 34, "is_me": True},
        {"name": "Kabir", "age": 8, "interests": ["kids"]},
    ],
    "must_see": ["ex-hawa-mahal"],
    "stay": {"type": "homestay", "max_per_night_inr": 4000},
}


def signup(email: str) -> TestClient:
    c = TestClient(app, headers={"X-Requested-With": "le"})
    assert (
        c.post(
            "/auth/register", json={"email": email, "password": PW, "display_name": "A"}
        ).status_code
        == 201
    )
    return c


def test_trip_crud_round_trip():
    c = signup("asha@example.com")
    assert c.get("/trips").json() == []
    r = c.post("/trips", json=TRIP)
    assert r.status_code == 201, r.text
    t = r.json()
    assert t["destination"] == "jaipur" and t["day_start"] == "09:30:00"
    assert t["stay"]["type"] == "homestay" and t["travelers"][0]["is_me"]
    assert (
        c.post(
            "/trips",
            json={**TRIP, "title": "Earlier", "start_date": "2026-10-01", "end_date": "2026-10-01"},
        ).status_code
        == 201
    )
    assert [x["title"] for x in c.get("/trips").json()] == ["Earlier", TRIP["title"]]  # by date
    r = c.put(f"/trips/{t['id']}", json={**TRIP, "title": "Renamed"})
    assert r.status_code == 200 and r.json()["title"] == "Renamed"
    assert c.get(f"/trips/{t['id']}").json()["title"] == "Renamed"
    assert c.delete(f"/trips/{t['id']}").status_code == 204
    assert c.get(f"/trips/{t['id']}").status_code == 404
    assert c.delete(f"/trips/{t['id']}").status_code == 404


def test_trips_are_private_to_their_owner():
    a, b = signup("a@example.com"), signup("b@example.com")
    tid = a.post("/trips", json=TRIP).json()["id"]
    assert b.get("/trips").json() == []
    assert b.get(f"/trips/{tid}").status_code == 404
    assert b.put(f"/trips/{tid}", json=TRIP).status_code == 404
    assert b.delete(f"/trips/{tid}").status_code == 404
    assert a.get(f"/trips/{tid}").status_code == 200
    anon = TestClient(app, headers={"X-Requested-With": "le"})
    assert anon.get("/trips").status_code == 401


def test_trip_validation():
    c = signup("asha@example.com")
    bad = [
        {"end_date": "2026-10-09"},  # ends before it starts
        {"end_date": "2026-10-17"},  # 8 days
        {"day_start": "20:00", "day_end": "09:00"},
        {"travelers": []},
        {"destination": "goa"},
        {"must_see": ["ex-nope"]},
        {"title": ""},
    ]
    for patch in bad:
        assert c.post("/trips", json={**TRIP, **patch}).status_code == 422, patch
    assert c.post("/trips", json={**TRIP, "end_date": "2026-10-16"}).status_code == 201  # 7 days
    no_csrf = TestClient(app, cookies=c.cookies)
    assert no_csrf.post("/trips", json=TRIP).status_code == 403


def test_export_includes_trips_and_delete_wipes_them():
    c = signup("asha@example.com")
    c.post("/trips", json=TRIP)
    assert [t["title"] for t in c.get("/me/export").json()["trips"]] == [TRIP["title"]]
    assert c.request("DELETE", "/me", json={"password": PW}).status_code == 204
    c2 = signup("asha@example.com")  # same email, fresh account: nothing carried over
    assert c2.get("/trips").json() == []
