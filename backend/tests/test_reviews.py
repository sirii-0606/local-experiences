"""Review verification: each rule from the "how to spot the bot" brief, then the API and the
trusted rating reaching the engine."""

from datetime import datetime, timedelta

from fastapi.testclient import TestClient

from app import store
from app.engine.reviews import Review, check, specifics, style_signs
from app.main import SEED, app, seed

AI = (
    "This wasn't just a stay — it was an experience. The staff were exceptionally attentive, "
    "and every detail was impeccable. Not merely a hotel, but a sanctuary — truly "
    "unforgettable. Highly recommend!"
)
REAL = (
    "Room 204 had a lumpy bed and the shower took 10 min to get hot. Ramesh at the front "
    "desk sorted it and got us chai. Rs 2400 a night, fair for the location."
)
GENERIC = (
    "Excellent service and wonderful ambience, the staff were friendly and helpful "
    "throughout our stay here."
)
MID = "Decent place. Breakfast was ok, parking is tight and the lift was slow. Would come again."
T0 = datetime(2026, 6, 1, 12)


def rev(i, text, rating=5, days=0, verified=False):
    return Review(
        id=str(i), at=T0 + timedelta(days=days), rating=rating, text=text, verified=verified
    )


def by_id(report):
    return {c.id: c for c in report.reviews}


def test_ai_style_and_generic_praise_are_flagged_real_detail_is_not():
    assert len(style_signs(AI)) >= 2 and specifics(AI) == 0
    assert style_signs(REAL) == [] and specifics(REAL) >= 5  # room no., bed, shower, name, price
    r = by_id(check([rev(1, AI, days=0), rev(2, REAL, 4, days=40), rev(3, GENERIC, days=80)]))
    assert not r["1"].counted and "machine-written" in r["1"].flags[0]
    assert r["2"].counted and r["2"].trust > r["3"].trust
    assert any("generic" in f for f in r["3"].flags)


def test_a_burst_of_reviews_on_one_day_is_not_counted():
    distinct = [
        REAL,
        MID,
        "Queue for tickets took 20 min, but the 4 pm tour was worth it.",
        "Too hot at noon and no shade near the entry. Go after 5; carry water.",
    ]
    steady = [rev(i, t, 4, days=i * 20) for i, t in enumerate(distinct)]
    farm = [
        Review(
            id=f"b{i}",
            at=datetime(2026, 9, 22, 10),
            rating=5,
            text=f"Loved it, room {i} was great and dinner at {i} pm too.",
        )
        for i in range(20)
    ]
    rep = check(steady + farm)
    assert rep.bursts and "20 reviews on Tue 22 Sep 2026" in rep.bursts[0]
    assert not any(c.counted for c in rep.reviews if c.id.startswith("b"))
    assert all(c.counted for c in rep.reviews if not c.id.startswith("b"))
    assert rep.rating_trusted < rep.rating_all


def test_repeating_the_same_claim_gives_bots_away():
    # different wording, same "fact": the closed restaurant down the road, weeks apart
    texts = [
        "Great location, and the Sea Breeze rooftop restaurant downstairs is superb.",
        "Pool was nice. Dinner at the Sea Breeze rooftop restaurant was the highlight.",
        "Check-in was quick; the Sea Breeze rooftop restaurant has amazing seafood.",
        "Clean rooms. Don't miss the Sea Breeze rooftop restaurant for sunset drinks.",
    ]
    rep = by_id(
        check([rev(i, t, days=i * 9) for i, t in enumerate(texts)] + [rev(9, REAL, 4, days=5)])
    )
    assert all("repeats the same claim" in " ".join(rep[str(i)].flags) for i in range(4))
    assert "sea breeze rooftop restaurant" in " ".join(rep["0"].flags)
    assert not rep["9"].flags


def test_near_copies_are_caught():
    base = "The palace tour was well organised and the guide explained the history of the fort"
    rep = by_id(
        check(
            [rev(1, base, days=1), rev(2, base + " really well", days=30), rev(3, MID, 3, days=60)]
        )
    )
    assert "near-copy" in " ".join(rep["1"].flags) and not rep["1"].counted
    assert rep["3"].counted


def test_extremes_weigh_less_and_three_stars_count_fully():
    rep = check([rev(1, REAL, 5, days=0), rev(2, MID, 3, days=50)])
    assert any("5★ counts 60%" in f for f in by_id(rep)["1"].flags)
    assert rep.rating_trusted < rep.rating_all  # the 3★ pulls harder than the 5★


def test_a_verified_visit_is_never_discarded():
    rep = by_id(check([rev(1, AI, verified=True), rev(2, AI, days=90)]))
    assert rep["1"].counted and rep["1"].trust >= 0.5
    assert not rep["2"].counted


def test_api_verifies_by_booking_and_feeds_the_trusted_rating_into_ranking():
    c = TestClient(app)
    eid = "ex-block-print-workshop"
    before = SEED.experiences[eid]
    state = {
        "lat": 26.9,
        "lon": 75.8,
        "window_start": "2026-09-26T10:00:00",
        "window_end": "2026-09-26T18:00:00",
        "budget_inr": 5000,
    }
    stop = c.post("/plan", json={"state": state, "add": eid, "max_new": 0}).json()
    booked = c.post(
        "/bookings", json={"state": state, "itinerary": stop["itinerary"], "experience_id": eid}
    ).json()
    after_visit = "2026-09-27T12:00:00"
    r = c.post(
        "/reviews",
        json={
            "experience_id": eid,
            "rating": 4,
            "text": REAL,
            "booking_code": booked["code"],
            "at": after_visit,
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["review"]["verified"] and r.json()["review"]["counted"]
    again = c.post(
        "/reviews",
        json={
            "experience_id": eid,
            "rating": 5,
            "text": "x",
            "booking_code": booked["code"],
            "at": after_visit,
        },
    )
    assert again.status_code == 409
    wrong = c.post(
        "/reviews",
        json={
            "experience_id": "ex-hawa-mahal",
            "rating": 5,
            "booking_code": booked["code"],
            "at": after_visit,
        },
    )
    assert wrong.status_code == 422
    for _ in range(20):  # a bot farm on one day
        c.post(
            "/reviews",
            json={"experience_id": eid, "rating": 5, "text": AI, "at": "2026-09-28T10:00:00"},
        )
    rep = c.get(f"/reviews/{eid}").json()
    assert rep["total"] == 21 and rep["counted"] == 1 and rep["verified"] == 1
    assert "20 of 21" in rep["verdict"]
    exp = seed().experiences[eid]  # the 20 fakes never reached the engine's evidence
    assert exp.review_count == before.review_count + 1
    assert c.post("/reviews", json={"experience_id": "ex-nope", "rating": 3}).status_code == 422


def test_check_endpoint_judges_pasted_reviews_without_saving():
    c = TestClient(app)
    r = c.post(
        "/reviews/check",
        json={
            "reviews": [
                {"at": "2026-09-01T10:00:00", "rating": 5, "text": AI},
                {"at": "2026-09-20T10:00:00", "rating": 3, "text": MID},
            ]
        },
    )
    assert r.status_code == 200
    assert r.json()["suspicious"] == 1 and r.json()["rating_trusted"] == 3.0
    assert store.reviews() == {}
