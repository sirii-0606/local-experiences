"""Any city, right now: open-data places, location, time and weather context, profile context,
calendar export. Fixtures are real Wikidata/Wikipedia responses for Pune and Mumbai captured on
2026-09-27; they're loaded into the test DB's cache, so nothing here touches the network."""

import json
from datetime import date, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import opendata, store
from app.engine.feasibility import travel_min
from app.engine.rank import discover
from app.intent import parse_rules
from app.main import SEED, app
from app.models import Itinerary, Stop, TravelerState

FIX = Path(__file__).parent / "fixtures"
PUNE, MUMBAI = (18.51957, 73.85535), (19.07283, 72.88261)
H = {"X-Requested-With": "le"}
SIX_PM = "2026-09-27T18:00:00"  # a Sunday


@pytest.fixture
def cities():
    """Pune and Mumbai as if fetched earlier today: geocodes + places in the cache."""
    for name, (lat, lon) in {"pune": PUNE, "mumbai": MUMBAI}.items():
        data = json.loads((FIX / f"{name}_places.json").read_text(encoding="utf-8"))
        store.area_put(lat, lon, opendata.AREA_KM, data["source"], data["items"])
        store.cache_put(f"geo-in:{name}", [name.title(), lat, lon])
    opendata._area_seed.cache_clear()


def chat(client, text, now=SIX_PM, **extra):
    r = client.post("/chat", json={"text": text, "now": now, **extra}, headers=H)
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------- open data -> experiences


def test_wikidata_places_become_experiences_with_honest_hours(cities):
    s, source = opendata.area_seed(*PUNE)
    assert source == "wikidata"
    museum = next(e for e in s.experiences.values() if e.title == "Raja Dinkar Kelkar Museum")
    assert {"museum", "history"} <= set(museum.tags) and museum.indoor
    assert museum.evidence["availability"].source == "estimate"  # typical hours, not facts
    wada = next(e for e in s.experiences.values() if e.title == "Shaniwar Wada")
    assert s.providers[wada.provider_id].verified  # ASI-listed: government, verified
    assert "Archaeological Survey of India" in s.providers[wada.provider_id].name
    stations = [p.name for p in opendata.landmarks(s, "station")]
    assert "Pune Junction railway station" in stations
    assert not any("metro" in n.lower() for n in stations)
    assert not any(e.title in stations for e in s.experiences.values())  # places, not outings


def test_wikipedia_fallback_classifies_by_title_then_description():
    raw = json.loads((FIX / "wikipedia_mumbai_sample.json").read_text(encoding="utf-8"))
    raw["query"]["pages"].append(
        {
            "pageid": 1,
            "title": "Aksa Beach",
            "description": "Suburb in Mumbai Suburban",
            "coordinates": [{"lat": 19.17, "lon": 72.79}],
        }
    )
    kinds = {p["name"]: p["kinds"][0] for p in opendata.from_wikipedia(raw)}
    assert kinds["Bandstand Promenade"] == "promenade"
    assert kinds["Aksa Beach"] == "beach"  # the title wins over "Suburb in ..."
    assert kinds["Andheri railway station"] == "station"
    for noise in ("Hill Road", "2024 Mumbai crowd crush", "Bhakti Park monorail station"):
        assert noise not in kinds


def test_curated_data_wins_over_open_data_duplicates():
    live = opendata.to_seed(
        [
            {
                "id": "Q1",
                "name": "Hawa Mahal",
                "kinds": ["palace"],
                "lat": 26.9239,
                "lon": 75.8267,
                "about": "palace",
                "popularity": 0.9,
                "heritage": None,
            }
        ],
        date(2026, 9, 27),
    )
    merged = opendata.merge_near(SEED, live, 26.92, 75.82)
    assert "ex-od-Q1" not in merged.experiences and "ex-hawa-mahal" in merged.experiences
    far = opendata.merge_near(SEED, live, *PUNE)
    assert not any(not e.startswith("ex-od-") for e in far.experiences)  # Jaipur isn't offered


def test_rush_hour_slows_road_travel_not_walking():
    mon_6pm, sun_6pm = datetime(2026, 9, 28, 18), datetime(2026, 9, 27, 18)
    assert travel_min(5, "auto", mon_6pm) > travel_min(5, "auto", sun_6pm) == travel_min(5, "auto")
    assert travel_min(2, "walk", mon_6pm) == travel_min(2, "walk")


# ---------------------------------------------------------------- the two user scenarios

SCENARIO_1 = (
    "so iam with my family iam 76 years old my preference is going to historial or "
    "cultural sites rather than anything else so its 6 pm in pune not any other park"
)
SCENARIO_2 = (
    "okay so iam a student iam on a work trip to Mumbai i have 4 hours before my train "
    "back you dont have any context before i want to explore beach along with view"
)


def test_parser_reads_both_scenarios():
    p = parse_rules(SCENARIO_1, SEED)
    assert (p.place_name, p.my_age, p.start_time) == ("pune", 76, "18:00")
    assert {"heritage", "history"} <= set(p.intents) and p.avoid == ["nature"]
    assert p.with_companions and p.child_ages == []  # 76 is the speaker, not a child
    p = parse_rules(SCENARIO_2, SEED)
    assert (p.place_name, p.duration_min, p.return_to, p.budget_hint) == (
        "mumbai",
        240,
        "station",
        "low",
    )
    assert set(p.intents) == {"beach", "viewpoint"}


def test_senior_at_6pm_in_pune_gets_open_heritage_not_parks(cities):
    out = chat(TestClient(app), SCENARIO_1)
    ctx, state = out["context"], out["state"]
    assert (ctx["location"], ctx["location_source"]) == ("Pune", "text")
    assert state["pace"] == "relaxed" and state["group"][0]["age"] == 76
    recs = out["recommendations"]
    s = opendata.area_seed(*PUNE)[0]
    assert recs and all(
        {"heritage", "history"} & set(s.experiences[r["experience_id"]].tags) for r in recs
    )
    assert not any("nature" in s.experiences[r["experience_id"]].tags for r in recs)
    assert all(r["start"] >= SIX_PM for r in recs)
    closed = {c["title"]: c for c in ctx["closed_now"]}
    assert "Raja Dinkar Kelkar Museum" in closed or "Shaniwar Wada" in closed
    assert all(c["next_open"] and c["next_open"].startswith("2026-09-28") for c in closed.values())
    assert out["plan"]["problems"] == [] and out["plan"]["itinerary"]["stops"]
    assert any("3 of you" in a for a in ctx["assumptions"])


def test_student_with_4_hours_in_mumbai_gets_beaches_and_is_back_for_the_train(cities):
    out = chat(TestClient(app), SCENARIO_2, now="2026-09-27T14:00:00")
    ctx, state = out["context"], out["state"]
    assert ctx["location"] == "Mumbai" and state["budget_inr"] == 600
    assert state["window_end"] == "2026-09-27T18:00:00" and state["end_lat"] is not None
    assert any(
        "back at" in a and "station" in a.lower() or "Terminus" in a for a in ctx["assumptions"]
    )
    assert all("matches" in " ".join(r["reasons"]) for r in out["recommendations"])
    assert any("beach" in " ".join(r["reasons"]) for r in out["recommendations"][:2])
    assert out["plan"]["problems"] == []  # includes getting to the station by 18:00


def test_no_location_falls_back_to_jaipur_and_says_so():
    out = chat(TestClient(app), "2 hours, local food", now="2026-09-27T11:00:00")
    assert out["context"]["location_source"] == "default"
    assert any("Jaipur" in a for a in out["context"]["assumptions"])


# ---------------------------------------------------------------- profile context (RAG)


def signed_in(client, profile=None):
    client.post(
        "/auth/register",
        json={"email": "r@example.com", "password": "testpass123", "display_name": "Ramesh"},
        headers=H,
    )
    if profile:
        assert client.put("/me/profile", json=profile, headers=H).status_code == 200
    return client


def test_profile_and_companions_shape_the_state(cities):
    c = signed_in(
        TestClient(app),
        {
            "display_name": "Ramesh",
            "age": 76,
            "home_city": "Pune",
            "dislikes": ["nature"],
            "interests": ["heritage", "history", "museum"],
            "transport": ["car"],
            "companions": [{"name": "Sunita", "age": 72}, {"name": "Meera", "age": 12}],
        },
    )
    assert [q["id"] for q in c.get("/me/onboarding").json()][:2] == ["interests", "dislikes"]
    out = chat(c, "I'm with my family, what should we do now?")
    st = out["state"]
    assert out["context"]["location"] == "Pune" and out["context"]["profile_used"]
    assert [g["name"] for g in st["group"]] == ["Ramesh", "Sunita", "Meera"]
    assert (st["mode"], st["pace"], st["avoid"]) == ("car", "relaxed", ["nature"])


def test_imported_itinerary_and_chats_build_a_visible_correctable_context():
    c = signed_in(TestClient(app))
    r = c.post(
        "/me/context/import",
        headers=H,
        json={
            "text": "Goa last winter: Old Goa churches, Fort Aguada, sunset on the beach. "
            "Skipped the nightlife."
        },
    )
    assert r.status_code == 200, r.text
    ctx = {e["tag"]: e["weight"] for e in r.json()["entries"]}
    assert ctx["spiritual"] > 0 and ctx["heritage"] > 0 and ctx["beach"] > 0
    assert ctx["nightlife"] < 0
    assert "Avoids: nightlife" in r.json()["summary"]
    chat(c, "3 hours, street food")
    assert {e["tag"] for e in c.get("/me/context").json()["entries"]} >= {"street-food"}
    assert c.delete("/me/context/nightlife", headers=H).status_code == 204
    assert "nightlife" not in {e["tag"] for e in c.get("/me/context").json()["entries"]}
    assert c.get("/me/export").json()["context"]
    assert c.delete("/me/context", headers=H).status_code == 204
    assert c.get("/me/context").json()["entries"] == []


def test_a_stated_dislike_is_a_hard_constraint_unless_asked_for():
    base = TravelerState(
        lat=26.92,
        lon=75.82,
        window_start=datetime(2026, 9, 26, 9),
        window_end=datetime(2026, 9, 26, 18),
        budget_inr=5000,
        avoid=["nature"],
    )
    recs, excluded = discover(base, SEED, k=50)
    assert not any("nature" in SEED.experiences[r.experience_id].tags for r in recs)
    assert any("you'd rather skip nature" in why for why in excluded.values() for why in why)
    asked = base.model_copy(update={"intents": ["nature"]})
    assert any(
        "nature" in SEED.experiences[r.experience_id].tags for r in discover(asked, SEED, k=50)[0]
    )


# ---------------------------------------------------------------- calendar


def test_calendar_export_has_leave_now_reminders_in_utc():
    state = TravelerState(
        lat=18.52,
        lon=73.855,
        window_start=datetime(2026, 9, 28, 18),
        window_end=datetime(2026, 9, 28, 21),
        budget_inr=2000,
        mode="car",
    )
    it = Itinerary(
        stops=[
            Stop(
                title="Shaniwar Wada, Pune; light show",
                lat=18.5195,
                lon=73.8553,
                start=datetime(2026, 9, 28, 19, 15),
                end=datetime(2026, 9, 28, 20, 15),
            )
        ]
    )
    r = TestClient(app).post(
        "/calendar/export",
        json={"state": state.model_dump(mode="json"), "itinerary": it.model_dump(mode="json")},
    )
    assert r.status_code == 200, r.text
    out = r.json()
    ev = out["events"][0]
    assert ev["remind_min"] == 15  # already there: no travel, just the lead time
    assert "dates=20260928T134500Z%2F20260928T144500Z" in ev["google_url"]  # 19:15 IST
    ics = out["ics"]
    assert "DTSTART:20260928T134500Z" in ics and "TRIGGER:-PT15M" in ics
    assert "SUMMARY:Shaniwar Wada\\, Pune\\; light show" in ics
    assert all(len(line.encode()) <= 75 for line in ics.split("\r\n"))
    moved = it.model_copy(update={"stops": [it.stops[0].model_copy(update={"lat": 18.56})]})
    far = TestClient(app).post(
        "/calendar/export",
        json={"state": state.model_dump(mode="json"), "itinerary": moved.model_dump(mode="json")},
    )
    assert far.json()["events"][0]["remind_min"] > 15  # travel time is added


# ---------------------------------------------------------------- providers anywhere


def test_a_provider_in_another_city_is_pinned_classified_and_matched(cities):
    c = TestClient(app)
    draft = {
        "provider_name": "Koli Kitchen",
        "title": "Koli fish curry lunch with a family",
        "tags": ["local-food", "community"],
        "category": "food",
        "lat": 19.13,
        "lon": 72.81,
        "area": "Versova, Mumbai",
        "price_inr": 250,
        "open_time": "12:00",
        "close_time": "16:00",
        "duration_min": 90,
        "community_led": True,
    }
    r = c.post("/providers/listings", json={"draft": draft})
    assert r.status_code == 200, r.text
    eid = r.json()["experience"]["id"]
    assert "Versova" in r.json()["place"]["name"]
    fits = c.get(f"/providers/insights/{eid}").json()["fits"]
    assert "food lovers" in fits and "students and budget travelers" in fits
    out = chat(c, "in mumbai, 3 hours, local food", now="2026-09-27T12:00:00")
    assert eid in [x["experience_id"] for x in out["recommendations"]]
    far = chat(c, "in pune, 3 hours, local food", now="2026-09-27T12:00:00")
    assert eid not in far["excluded"] and eid not in [
        x["experience_id"] for x in far["recommendations"]
    ]  # 120 km away: not offered at all


def test_a_wikipedia_fallback_is_refreshed_from_wikidata_later():
    old = [
        {
            "id": "wp1",
            "name": "Old Fallback Park",
            "kinds": ["park"],
            "lat": 19.0,
            "lon": 72.9,
            "about": "",
            "popularity": 0.2,
            "heritage": None,
        }
    ]
    two_hours_ago = (datetime.now() - timedelta(hours=2)).isoformat(timespec="seconds")
    store._run(
        "insert into areas (lat, lon, km, at, source, json) values (?, ?, ?, ?, ?, ?)",
        (19.0, 72.9, 15, two_hours_ago, "wikipedia", json.dumps(old)),
    )
    calls = []

    def busy(*_):
        calls.append("wikidata")
        raise TimeoutError

    items, source = opendata.pois(19.0, 72.9, fetch={"wikidata": busy, "wikipedia": busy})
    assert calls == ["wikidata"] and source == "wikipedia" and items == old  # stale beats none
    fresh = [{**old[0], "id": "Q9", "name": "Fresh Beach", "kinds": ["beach"]}]
    items, source = opendata.pois(19.0, 72.9, fetch={"wikidata": lambda *_: fresh})
    assert (source, items) == ("wikidata", fresh)
    assert opendata.pois(19.0, 72.9)[1] == "wikidata"  # cached now


def test_geocoding_never_leaves_india():
    asked = []
    abroad = {
        "results": [
            {
                "name": "Chrysanthio",
                "latitude": 38.1,
                "longitude": 22.3,
                "feature_code": "PPL",
                "country_code": "GR",
            }
        ]
    }
    assert opendata.geocode("versova", fetch=lambda url: asked.append(url) or abroad) is None
    assert "countryCode=IN" in asked[0]


def test_place_names_are_found_after_other_prepositions():
    from app.intent import place_candidates

    text = "our family cooks lunches at home in versova, mumbai for three generations"
    assert place_candidates(text) == ["versova mumbai"]
    store.cache_put("geo-in:mumbai", ["Mumbai", *MUMBAI])
    assert opendata.geocode_phrase("versova mumbai") == ("Mumbai", *MUMBAI)


def test_a_quick_bite_is_food_and_the_bot_says_so_when_there_is_none(cities):
    from app.intent import parse_rules

    assert "local-food" in parse_rules("im in pune i want a quick bite", SEED).intents
    out = chat(TestClient(app), "im in pune i want a quick bite", now="2026-09-27T09:30:00")
    # the cached Pune fixture predates eateries: no food supply, and the bot must say so
    notes = " ".join(out["context"]["assumptions"])
    assert "don't know any places for local food around Pune" in notes
    assert out["excluded"]  # the ruled-out places come with their reasons


def test_open_data_eateries_are_food_and_clubs_are_left_out():
    raw = {
        "results": {
            "bindings": [
                {
                    "item": {"value": f"http://www.wikidata.org/entity/{q}"},
                    "itemLabel": {"value": name},
                    "type": {"value": "http://www.wikidata.org/entity/Q11707"},
                    "loc": {"value": "Point(73.85 18.52)"},
                    "links": {"value": "3"},
                }
                for q, name in (("Q1", "Vaishali"), ("Q2", "The Poona Club Ltd."))
            ]
        }
    }
    items = opendata.from_wikidata(raw)
    assert [i["name"] for i in items] == ["Vaishali"]
    exp = next(iter(opendata.to_seed(items, date(2026, 9, 27)).experiences.values()))
    assert exp.category == "food" and "local-food" in exp.tags
    assert exp.evidence["availability"].source == "estimate"
