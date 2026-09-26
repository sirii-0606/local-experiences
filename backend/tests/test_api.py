import json
import os

import pytest
from fastapi.testclient import TestClient

from app import intent
from app.main import SEED, app
from app.models import TravelerState

client = TestClient(app)
NOW = "2026-09-26T15:30:00"
SCENARIO_A = (
    "We're a family of 4 with two kids near Hawa Mahal, free 4–6 pm, ₹1500 total, "
    "want local food and something cultural."
)


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    monkeypatch.setenv("INTENT_PARSER", "rules")  # tests never call the API or spend money


def chat(text, state=None):
    r = client.post("/chat", json={"text": text, "state": state, "now": NOW})
    assert r.status_code == 200, r.text
    return r.json()


def test_chat_scenario_a_offline():
    out = chat(SCENARIO_A)
    s = out["state"]
    assert out["parser"] == "rules"
    assert (s["window_start"], s["window_end"]) == ("2026-09-26T16:00:00", "2026-09-26T18:00:00")
    assert s["budget_inr"] == 1500 and len(s["group"]) == 4
    assert sum(t["age"] < 16 for t in s["group"]) == 2
    assert out["recommendations"] and "ex-hawa-mahal" in out["excluded"]
    assert out["plan"]["problems"] == [] and len(out["plan"]["itinerary"]["stops"]) >= 2
    assert sum(x["cost_inr"] for x in out["plan"]["itinerary"]["stops"]) <= 1500


def test_chat_refinement_keeps_earlier_context():
    first = chat(SCENARIO_A)
    out = chat("actually, something less crowded please", first["state"])
    s = out["state"]
    assert s["avoid_crowds"] is True
    assert (
        s["budget_inr"] == 1500
        and len(s["group"]) == 4
        and s["intents"] == first["state"]["intents"]
    )


def test_events_scenario_b_delay_and_rain():
    a = chat(SCENARIO_A)
    for event in (
        {"kind": "delay", "at": "2026-09-26T16:05:00", "delay_min": 40},
        {"kind": "weather", "at": "2026-09-26T16:05:00", "weather": "rain"},
    ):
        r = client.post(
            "/events",
            json={"state": a["state"], "itinerary": a["plan"]["itinerary"], "event": event},
        )
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["problems"] == []
        TravelerState.model_validate(out["state"])
        if event["kind"] == "weather":
            for stop in out["itinerary"]["stops"]:
                if stop["status"] in ("proposed", "confirmed") and stop["experience_id"]:
                    e = SEED.experiences[stop["experience_id"]]
                    assert e.indoor or not e.weather_sensitive


def test_discover_and_plan_endpoints():
    state = chat(SCENARIO_A)["state"]
    d = client.post("/discover", json={"state": state, "k": 3}).json()
    assert len(d["recommendations"]) == 3 and all(r["reasons"] for r in d["recommendations"])
    p = client.post("/plan", json={"state": state}).json()
    assert p["problems"] == []


def test_plan_add_fits_or_explains():
    a = chat(SCENARIO_A)
    # scenario A's plan (lassi 16:20, puppets 17:00-17:45) has no 60-min hole for Masala Chowk
    r = client.post(
        "/plan",
        json={
            "state": a["state"],
            "itinerary": a["plan"]["itinerary"],
            "max_new": 0,
            "add": "ex-masala-chowk",
        },
    )
    assert r.status_code == 409 and "doesn't fit" in r.json()["detail"]
    r = client.post("/plan", json={"state": a["state"], "max_new": 0, "add": "ex-masala-chowk"})
    assert r.status_code == 200 and r.json()["problems"] == []


def test_unknown_experience_is_rejected():
    state = chat(SCENARIO_A)["state"]
    r = client.post(
        "/events",
        json={
            "state": state,
            "itinerary": {"stops": []},
            "event": {"kind": "closure", "at": NOW, "experience_id": "ex-nope"},
        },
    )
    assert r.status_code == 422


def test_llm_failure_falls_back_to_rules(monkeypatch):
    monkeypatch.setenv("INTENT_PARSER", "llm")

    def boom(*a, **k):
        raise ValueError("simulated outage")

    monkeypatch.setattr(intent, "parse_llm", boom)
    assert chat(SCENARIO_A)["parser"] == "rules"


def test_llm_request_shape_offline():
    """Checks what we send to Claude and that the structured reply is parsed, without network."""
    import anthropic
    import httpx2

    sent = {}
    reply = {
        "near": "Hawa Mahal",
        "budget_inr": 1500,
        "group_size": 4,
        "children": 2,
        "intents": ["local-food"],
    }

    def handler(request: httpx2.Request) -> httpx2.Response:
        sent["body"] = json.loads(request.content)
        sent["beta"] = request.headers.get("anthropic-beta", "")
        return httpx2.Response(
            200,
            json={
                "id": "msg_test",
                "type": "message",
                "role": "assistant",
                "model": "claude-opus-5",
                "content": [{"type": "text", "text": json.dumps(reply)}],
                "stop_reason": "end_turn",
                "stop_sequence": None,
                "usage": {"input_tokens": 1, "output_tokens": 1},
            },
        )

    fake = anthropic.Anthropic(
        api_key="test", http_client=httpx2.Client(transport=httpx2.MockTransport(handler))
    )
    from datetime import datetime

    p = intent.parse_llm(SCENARIO_A, datetime.fromisoformat(NOW), SEED, client=fake)
    assert p.near == "Hawa Mahal" and p.children == 2 and p.intents == ["local-food"]
    body = sent["body"]
    assert body["model"] == "claude-opus-5" and body["fallbacks"] == "default"
    assert "server-side-fallback-2026-07-01" in sent["beta"]
    assert body["output_config"]["effort"] == "low"
    assert body["output_config"]["format"]["type"] == "json_schema"
    assert "Hawa Mahal" in body["messages"][0]["content"]  # known places are offered


@pytest.mark.skipif(not os.environ.get("RUN_LLM_TESTS"), reason="calls the Claude API (costs $)")
def test_llm_parser_live():
    from datetime import datetime

    p = intent.parse_llm(SCENARIO_A, datetime.fromisoformat(NOW), SEED)
    assert p.near == "Hawa Mahal" and p.budget_inr == 1500 and p.children == 2
    assert "local-food" in p.intents
