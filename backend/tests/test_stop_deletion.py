"""Tests for Manual Stop Deletion and Instant Dynamic Replanning."""
from datetime import date

from app import accounts
from app.models import Itinerary, Stop
from app.schemas import StayPref, TripDraft, TripTraveler


def test_delete_stop_endpoint():
    from fastapi.testclient import TestClient
    from app.main import app

    c = TestClient(app, headers={"X-Requested-With": "le"})
    assert c.post("/auth/register", json={"email": "stop_del_user@example.com", "password": "password123", "display_name": "Stop User"}).status_code == 201

    trip_data = {
        "title": "Stop Delete Test Trip",
        "start_date": "2026-10-01",
        "end_date": "2026-10-01",
        "budget_inr": 10000,
        "stay": {"type": "any"},
        "travelers": [{"name": "Sumit", "age": 25, "is_me": True}],
        "must_see": ["ex-hawa-mahal"],
    }
    r = c.post("/trips", json=trip_data)
    assert r.status_code == 201, r.text
    trip = r.json()

    # Generate itinerary
    gen_res = c.post(f"/trips/{trip['id']}/itinerary/generate")
    assert gen_res.status_code == 200

    # Delete stop
    res = c.delete(f"/trips/{trip['id']}/stops/ex-hawa-mahal")
    assert res.status_code == 200
    data = res.json()

    assert data["deleted_stop_title"] is not None
    assert len(data["changes"]) >= 1
    assert data["trip"]["shortlist"].get("ex-hawa-mahal") == "skip"

