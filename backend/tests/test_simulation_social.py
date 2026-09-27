from datetime import datetime, timedelta

from fastapi.testclient import TestClient

from app.main import app
from app.models import Itinerary, Stop, TravelerState

client = TestClient(app)
NOW = datetime(2026, 9, 26, 15, 30)


def test_social_signals_endpoint():
    res = client.get("/social/signals", params={"condition": "rain"})
    assert res.status_code == 200
    data = res.json()
    assert "signals" in data
    assert "trending_hashtags" in data
    assert len(data["signals"]) > 0
    # Signals for rain should have waterlogging or rain warnings
    assert any(
        "rain" in s["content"].lower() or "water" in s["content"].lower() for s in data["signals"]
    )


def test_social_report_submission():
    report_payload = {
        "author": "Ankit Verma",
        "content": "Waterlogging cleared near Ajmeri gate, road is open now!",
        "location_name": "Ajmeri Gate",
        "lat": 26.915,
        "lon": 75.820,
        "sentiment": "positive",
        "tags": ["#AjmeriGate", "#RoadOpen"],
    }
    res = client.post("/social/report", json=report_payload)
    assert res.status_code == 200
    out = res.json()
    assert out["author"] == "Ankit Verma"
    assert out["source"] == "crowd_report"

    # Verify report is now present in signals feed
    feed_res = client.get("/social/signals")
    feed_data = feed_res.json()
    assert any(s["author"] == "Ankit Verma" for s in feed_data["signals"])


def test_simulation_presets():
    res = client.get("/simulation/presets")
    assert res.status_code == 200
    presets = res.json()
    assert len(presets) >= 3
    assert any("cloudburst" in p["name"].lower() for p in presets)
    assert any("heatwave" in p["name"].lower() for p in presets)


def test_simulation_what_if_execution():
    state = TravelerState(
        lat=26.9239,
        lon=75.8267,
        budget_inr=3000,
        window_start=NOW,
        window_end=NOW + timedelta(hours=4),
        weather="clear",
    )
    # Stop at outdoor Jantar Mantar
    stop = Stop(
        experience_id="ex-jantar-mantar",
        title="Jantar Mantar",
        lat=26.9247,
        lon=75.8245,
        start=NOW + timedelta(minutes=15),
        end=NOW + timedelta(minutes=75),
        cost_inr=50,
        status="proposed",
    )
    itinerary = Itinerary(stops=[stop])

    scenario = {
        "name": "Sudden Cloudburst",
        "temp_c": 28.0,
        "rain_intensity_mm_h": 40.0,
        "duration_hours": 2.0,
        "epicenter_lat": 26.9239,
        "epicenter_lon": 75.8267,
        "epicenter_name": "Old City",
        "radius_km": 4.0,
        "wind_kmh": 30.0,
    }

    res = client.post(
        "/simulation/what-if",
        json={
            "scenario": scenario,
            "state": state.model_dump(mode="json"),
            "itinerary": itinerary.model_dump(mode="json"),
        },
    )
    assert res.status_code == 200
    result = res.json()
    assert "metrics" in result
    assert "impact_zones" in result
    assert len(result["impact_zones"]) == 3
    assert result["metrics"]["weather_classification"] == "rain"
    assert result["metrics"]["transit_friction_multiplier"] > 1.0
    # Jantar Mantar is outdoor and should be flagged as vulnerable
    assert "ex-jantar-mantar" in result["vulnerable_stop_ids"]
    assert "adapted_itinerary" in result
    assert len(result["simulated_social_signals"]) > 0


def test_trip_simulate_weather_endpoint():
    auth_client = TestClient(app, headers={"X-Requested-With": "le"})
    reg = auth_client.post(
        "/auth/register",
        json={"email": "sim_weather@test.com", "password": "password12345", "display_name": "Sim"},
    )
    assert reg.status_code == 201

    trip_data = {
        "title": "Monsoon Expedition",
        "start_date": "2026-10-15",
        "end_date": "2026-10-16",
        "budget_inr": 25000,
        "travelers": [{"name": "Sim", "is_me": True}],
        "must_see": ["ex-hawa-mahal", "ex-jantar-mantar"],
        "weather": "clear",
    }
    t_res = auth_client.post("/trips", json=trip_data)
    assert t_res.status_code == 201
    tid = t_res.json()["id"]

    sim_res = auth_client.post(
        f"/trips/{tid}/simulate-weather",
        json={
            "scenario": {
                "name": "Sudden Cloudburst (35 mm/h)",
                "temp_c": 29.5,
                "rain_intensity_mm_h": 35.0,
                "duration_hours": 2.5,
                "epicenter_lat": 26.9239,
                "epicenter_lon": 75.8267,
                "epicenter_name": "Old Walled City",
                "radius_km": 3.8,
                "wind_kmh": 32.0,
            }
        },
    )
    assert sim_res.status_code == 200
    data = sim_res.json()
    assert data["trip"]["weather"] == "rain"
    assert data["simulation"]["metrics"]["weather_classification"] == "rain"
    assert len(data["trip"]["itinerary"]["stops"]) >= 1


def test_experience_outdoor_convenience_values_and_planning():
    from app.engine.trip import score_candidates
    from app.schemas import TripDraft, TripTraveler
    from app.seed import load_seed

    s = load_seed()
    # Check that all experiences have calibrated convenience values
    for exp in s.experiences.values():
        assert hasattr(exp, "outdoor_convenience_heat")
        assert hasattr(exp, "outdoor_convenience_rain")
        assert 0.0 <= exp.outdoor_convenience_heat <= 1.0
        assert 0.0 <= exp.outdoor_convenience_rain <= 1.0

    # Verify specific outdoor vs indoor convenience expectations
    jantar = s.experiences["ex-jantar-mantar"]
    albert = s.experiences["ex-albert-hall"]
    assert jantar.outdoor_convenience_heat <= 0.35
    assert jantar.outdoor_convenience_rain <= 0.35
    assert albert.outdoor_convenience_heat >= 0.80
    assert albert.outdoor_convenience_rain >= 0.80

    # Verify candidate scoring considers convenience in heat
    draft_heat = TripDraft(
        title="Heatwave Trip",
        start_date="2026-06-15",
        end_date="2026-06-16",
        budget_inr=20000,
        travelers=[TripTraveler(name="Tester", is_me=True)],
        must_see=[],
        weather="heat",
    )
    cands_heat = score_candidates(draft_heat, s)
    cands_by_id = {c.experience_id: c for c in cands_heat}

    assert "ex-albert-hall" in cands_by_id
    assert "ex-jantar-mantar" in cands_by_id
    albert_cand = cands_by_id["ex-albert-hall"]
    jantar_cand = cands_by_id["ex-jantar-mantar"]
    assert albert_cand.outdoor_convenience_heat >= 0.80
    assert jantar_cand.outdoor_convenience_heat <= 0.35
    # Albert Hall should score significantly higher than open-air Jantar Mantar under heat
    assert albert_cand.score > jantar_cand.score


