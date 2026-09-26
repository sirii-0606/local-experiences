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
