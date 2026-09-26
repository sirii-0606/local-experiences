from datetime import date

import pytest
from fastapi.testclient import TestClient
from test_adapt import DAY, JANTAR, PUPPETS, S
from test_itinerary import LUNCH, PALACE

from app import weather
from app.main import app

client = TestClient(app)
SAT = date(2026, 9, 26)


def payload(rain_hours=(), hot_hours=()):
    hrs = range(24)
    return {"hourly": {
        "time": [f"2026-09-26T{h:02d}:00" for h in hrs],
        "temperature_2m": [40.0 if h in hot_hours else 30.0 for h in hrs],
        "precipitation": [2.0 if h in rain_hours else 0.0 for h in hrs],
        "precipitation_probability": [90 if h in rain_hours else 5 for h in hrs],
        "weather_code": [63 if h in rain_hours else 1 for h in hrs],
    }}


@pytest.fixture(autouse=True)
def fresh_cache():
    weather._cache.clear()


def use(monkeypatch, data):
    def fake(day, **_):
        if isinstance(data, Exception):
            raise data
        return data
    monkeypatch.setattr(weather, "_fetch", fake)


@pytest.mark.parametrize("temp, mm, prob, code, expected", [
    (30, 0.0, 10, 1, "clear"), (30, 0.0, 10, 63, "rain"), (30, 1.2, 40, 3, "rain"),
    (30, 0.0, 80, 3, "rain"), (39, 0.0, 0, 0, "heat"),
])
def test_classify(temp, mm, prob, code, expected):
    assert weather.classify(temp, mm, prob, code) == expected


def test_forecast_is_cached_and_survives_outages(monkeypatch):
    calls = []
    monkeypatch.setattr(weather, "_fetch",
                        lambda d, **_: calls.append(d) or payload(rain_hours={14}))
    hours = weather.forecast(SAT)
    assert hours[14].condition == "rain" and hours[10].condition == "clear"
    weather.forecast(SAT)
    assert len(calls) == 1  # second call served from cache
    weather._cache.clear()
    use(monkeypatch, TimeoutError("offline"))
    assert weather.forecast(SAT) is None


def check(itinerary, state=S, now="2026-09-26T11:30:00"):
    r = client.post("/context/check", json={"state": state.model_dump(mode="json"),
                                            "itinerary": itinerary.model_dump(mode="json"),
                                            "now": now})
    assert r.status_code == 200, r.text
    return r.json()


def test_rain_over_an_outdoor_stop_proposes_a_replan(monkeypatch):
    use(monkeypatch, payload(rain_hours={13, 14}))  # Jantar Mantar (outdoor) is 13:45-14:45
    out = check(DAY)
    assert [r["stop"] for r in out["risks"]] == [JANTAR.title]
    assert "90% chance of rain" in out["risks"][0]["message"]
    assert out["proposed"]["kind"] == "weather" and out["proposed"]["weather"] == "rain"


def test_rain_only_over_indoor_or_past_stops_is_not_a_risk(monkeypatch):
    use(monkeypatch, payload(rain_hours={10, 12, 15, 17}))  # kites, lunch, palace, puppets
    assert check(DAY)["risks"] == []
    use(monkeypatch, payload(rain_hours={13}))
    weather._cache.clear()
    assert check(DAY, now="2026-09-26T15:00:00")["risks"] == []  # Jantar is already over


def test_no_proposal_when_state_already_knows(monkeypatch):
    use(monkeypatch, payload(rain_hours={13, 14}))
    out = check(DAY, state=S.model_copy(update={"weather": "rain"}))
    assert out["risks"] and out["proposed"] is None


def test_offline_weather_is_harmless(monkeypatch):
    use(monkeypatch, OSError("no network"))
    assert check(DAY) == {"available": False, "risks": [], "proposed": None}
    assert client.get("/weather", params={"at": "2026-09-26T16:00:00"}).json()["available"] is False


def test_weather_now_endpoint(monkeypatch):
    use(monkeypatch, payload(hot_hours={16}))
    out = client.get("/weather", params={"at": "2026-09-26T16:20:00"}).json()
    assert out["available"] and out["hour"]["condition"] == "heat"


def test_heat_is_reported_for_outdoor_stops(monkeypatch):
    use(monkeypatch, payload(hot_hours={13, 14}))
    out = check(DAY)
    assert out["risks"][0]["condition"] == "heat" and "40°C" in out["risks"][0]["message"]
    assert out["proposed"]["weather"] == "heat"
    assert PUPPETS.title not in [r["stop"] for r in out["risks"]]
    assert LUNCH.title not in [r["stop"] for r in out["risks"]] and PALACE.locked
