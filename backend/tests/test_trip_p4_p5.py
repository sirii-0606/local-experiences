from datetime import date, time

from fastapi.testclient import TestClient

from app.engine.nearby import (
    auto_suggest_splits,
    guide_driver_suggestions,
    meal_suggestions,
    quick_stops,
)
from app.engine.trip import build_itinerary, score_candidates, score_stays
from app.main import app
from app.models import TravelerState
from app.schemas import StayPref, TripDraft, TripTraveler
from app.seed import load_seed

SEED = load_seed()
client = TestClient(app)

SAMPLE_DRAFT = TripDraft(
    title="Jaipur Heritage & Food",
    destination="jaipur",
    start_date=date(2026, 10, 1),
    end_date=date(2026, 10, 3),  # 3 days
    day_start=time(9, 30),
    day_end=time(20, 30),
    budget_inr=15000,
    stay=StayPref(type="hotel", max_per_night_inr=5000, area="Old City"),
    travelers=[
        TripTraveler(name="Aarav", age=32, interests=["heritage", "local-food"]),
        TripTraveler(name="Ananya", age=30, interests=["craft", "textiles"]),
        TripTraveler(name="Kabir", age=8, interests=["kids"]),
    ],
    must_see=["ex-hawa-mahal", "ex-amer-fort"],
)


def _auth_user(email="tripper@example.com"):
    client.post(
        "/auth/register",
        json={"email": email, "password": "securepassword123", "display_name": "Tripper"},
        headers={"X-Requested-With": "le"},
    )
    r = client.post(
        "/auth/login",
        json={"email": email, "password": "securepassword123"},
        headers={"X-Requested-With": "le"},
    )
    return r.cookies


def test_seed_has_stays():
    assert len(SEED.stays) >= 8
    stay = next(iter(SEED.stays.values()))
    assert stay.name and stay.price_per_night_inr > 0 and stay.area


def test_score_candidates_returns_travel_modes_and_must_sees():
    candidates = score_candidates(SAMPLE_DRAFT, SEED)
    assert candidates
    top = candidates[0]
    assert top.must_see is True  # must sees prioritized
    assert "walk" in top.travel_by_mode and "auto" in top.travel_by_mode
    assert "bus" in top.travel_by_mode and "car" in top.travel_by_mode
    assert all(top.travel_by_mode[m] >= 0 for m in ("walk", "auto", "bus", "car"))


def test_score_stays_respects_centroid_and_budget():
    in_person_ids = ["ex-hawa-mahal", "ex-city-palace"]
    stays_recs = score_stays(SAMPLE_DRAFT, SEED, in_person_ids)
    assert len(stays_recs) >= 5
    top_stay = stays_recs[0]
    assert top_stay.distance_to_picks_km >= 0
    assert top_stay.travel_to_centroid_min >= 0
    assert top_stay.score > 0.5


def test_build_multi_day_itinerary():
    draft = SAMPLE_DRAFT.model_copy(
        update={
            "shortlist": {
                "ex-hawa-mahal": "in_person",
                "ex-amer-fort": "in_person",
                "ex-city-palace": "in_person",
            },
            "stay_id": "stay-kalwara-haveli",
        }
    )
    itinerary = build_itinerary(draft, SEED)
    assert len(itinerary.stops) >= 2
    days = {s.start.date() for s in itinerary.stops}
    assert len(days) >= 1


def test_nearby_suggestions():
    state = TravelerState(
        lat=26.9239,
        lon=75.8267,
        window_start=SAMPLE_DRAFT.start_date,
        window_end=SAMPLE_DRAFT.end_date,
        budget_inr=5000,
    )
    itinerary = build_itinerary(SAMPLE_DRAFT, SEED)
    meals = meal_suggestions(itinerary, SAMPLE_DRAFT.start_date, state, SEED)
    assert meals
    quicks = quick_stops(itinerary, state, SEED)
    assert isinstance(quicks, list)
    guides = guide_driver_suggestions(SAMPLE_DRAFT, itinerary, SEED)
    assert guides
    splits = auto_suggest_splits(SAMPLE_DRAFT, SEED)
    assert splits


def test_trip_endpoints_e2e():
    cookies = _auth_user("e2e_trips@example.com")
    headers = {"X-Requested-With": "le"}

    # 1. Stays catalog
    r = client.get("/trips/stays", cookies=cookies, headers=headers)
    assert r.status_code == 200
    stays = r.json()
    assert len(stays) >= 5

    # 2. Create trip
    r = client.post(
        "/trips", json=SAMPLE_DRAFT.model_dump(mode="json"), cookies=cookies, headers=headers
    )
    assert r.status_code == 201
    trip_id = r.json()["id"]

    # 3. Get candidates
    r = client.post(f"/trips/{trip_id}/candidates", cookies=cookies, headers=headers)
    assert r.status_code == 200
    candidates = r.json()
    assert len(candidates) > 0
    assert "travel_by_mode" in candidates[0]

    # 4. Stay recommendations
    r = client.post(f"/trips/{trip_id}/stays/recommendations", cookies=cookies, headers=headers)
    assert r.status_code == 200
    stay_recs = r.json()
    assert len(stay_recs) > 0
    chosen_stay_id = stay_recs[0]["stay"]["id"]

    # 5. Update shortlist & stay
    updated_draft = SAMPLE_DRAFT.model_copy(
        update={
            "shortlist": {candidates[0]["experience_id"]: "in_person"},
            "stay_id": chosen_stay_id,
        }
    )
    r = client.put(
        f"/trips/{trip_id}",
        json=updated_draft.model_dump(mode="json"),
        cookies=cookies,
        headers=headers,
    )
    assert r.status_code == 200

    # 6. Generate itinerary
    r = client.post(f"/trips/{trip_id}/itinerary/generate", cookies=cookies, headers=headers)
    assert r.status_code == 200

    # 7. Suggestions
    r = client.get(f"/trips/{trip_id}/suggestions", cookies=cookies, headers=headers)
    assert r.status_code == 200
    suggs = r.json()
    assert "meals" in suggs and "guides" in suggs
