"""HTTP API: a thin, stateless wrapper over the engine. Clients send state/itinerary back each call.

Run: uvicorn app.main:app --reload   (interactive schema at /docs)
"""
from datetime import datetime

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from app.engine.adapt import Replan, replan
from app.engine.itinerary import insert, plan, validate
from app.engine.rank import Recommendation, discover
from app.intent import ParsedRequest, now_ist, parse, to_state
from app.models import ContextEvent, Itinerary, TravelerState
from app.seed import load_seed

SEED = load_seed()
app = FastAPI(title="Local & Experiences API")


class DiscoverRequest(BaseModel):
    state: TravelerState
    k: int = 5


class DiscoverResponse(BaseModel):
    recommendations: list[Recommendation]
    excluded: dict[str, list[str]]  # experience id -> why it was ruled out


class PlanRequest(BaseModel):
    state: TravelerState
    itinerary: Itinerary = Itinerary()
    max_new: int = 3
    add: str | None = None  # experience id the user picked: fitted into the first feasible gap


class PlanResponse(BaseModel):
    itinerary: Itinerary
    problems: list[str]  # empty = the whole sequence is feasible


class EventRequest(BaseModel):
    state: TravelerState
    itinerary: Itinerary
    event: ContextEvent


class EventResponse(Replan):
    problems: list[str]


class ChatRequest(BaseModel):
    text: str
    state: TravelerState | None = None  # previous state, for refinements ("actually, with a kid")
    now: datetime | None = None  # defaults to current IST; pass it for reproducible demos


class ChatResponse(BaseModel):
    parser: str  # "llm" or "rules"
    parsed: ParsedRequest
    state: TravelerState
    recommendations: list[Recommendation]
    excluded: dict[str, list[str]]
    plan: PlanResponse


def _check_ids(*ids: str | None) -> None:
    if bad := [i for i in ids if i and i not in SEED.experiences]:
        raise HTTPException(422, f"unknown experience id(s): {bad}")


@app.get("/health")
def health() -> dict:
    return {"ok": True, "experiences": len(SEED.experiences)}


@app.get("/catalog")
def catalog() -> dict:
    """Everything the map and provider views need to render names and pins."""
    return {
        "places": list(SEED.places.values()),
        "providers": list(SEED.providers.values()),
        "experiences": list(SEED.experiences.values()),
    }


@app.post("/discover")
def discover_(req: DiscoverRequest) -> DiscoverResponse:
    recs, excluded = discover(req.state, SEED, req.k)
    return DiscoverResponse(recommendations=recs, excluded=excluded)


@app.post("/plan")
def plan_(req: PlanRequest) -> PlanResponse:
    _check_ids(req.add, *(s.experience_id for s in req.itinerary.stops))
    it = req.itinerary
    if req.add:
        it = insert(it, req.add, req.state, SEED)
        if it is None:
            raise HTTPException(409, f"{SEED.experiences[req.add].title} doesn't fit around your "
                                     "current plan. Remove or unlock a stop to make room.")
    it = plan(it, req.state, SEED, req.max_new)
    return PlanResponse(itinerary=it, problems=validate(it, req.state, SEED))


@app.post("/events")
def events(req: EventRequest) -> EventResponse:
    _check_ids(req.event.experience_id, *(s.experience_id for s in req.itinerary.stops))
    out = replan(req.itinerary, req.state, req.event, SEED)
    return EventResponse(**out.model_dump(), problems=validate(out.itinerary, out.state, SEED))


@app.post("/chat")
def chat(req: ChatRequest) -> ChatResponse:
    now = req.now or now_ist()
    parsed, parser = parse(req.text, now, SEED)
    state = to_state(parsed, now, SEED, req.state)
    recs, excluded = discover(state, SEED)
    it = plan(Itinerary(), state, SEED)
    return ChatResponse(
        parser=parser, parsed=parsed, state=state, recommendations=recs, excluded=excluded,
        plan=PlanResponse(itinerary=it, problems=validate(it, state, SEED)),
    )
