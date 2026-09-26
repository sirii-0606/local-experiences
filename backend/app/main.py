"""HTTP API: a thin, stateless wrapper over the engine. Clients send state/itinerary back each call.

Run: uvicorn app.main:app --reload   (interactive schema at /docs)
"""
from datetime import datetime
from typing import get_args

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from app import provider, store, weather
from app.engine.adapt import Replan, replan
from app.engine.itinerary import insert, plan, upcoming, validate
from app.engine.learn import learn
from app.engine.rank import Recommendation, discover
from app.intent import ParsedRequest, now_ist, parse, to_state
from app.models import (
    Access,
    Category,
    ContextEvent,
    Experience,
    Feedback,
    Itinerary,
    Place,
    Provider,
    Tag,
    TravelerState,
)
from app.seed import Seed, load_seed

SEED = load_seed()  # curated, read-only; provider listings/pauses are overlaid per request
app = FastAPI(title="Local & Experiences API")


def seed() -> Seed:
    return store.current_seed(SEED)


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


class DraftRequest(BaseModel):
    text: str


class DraftResponse(BaseModel):
    parser: str
    draft: provider.ListingDraft


class PublishRequest(BaseModel):
    draft: provider.ListingDraft
    today: datetime | None = None  # evidence date; defaults to now


class Listing(BaseModel):
    provider: Provider
    place: Place
    experience: Experience


class PauseRequest(BaseModel):
    experience_id: str
    paused: bool


def _check_ids(s: Seed, *ids: str | None) -> None:
    if bad := [i for i in ids if i and i not in s.experiences]:
        raise HTTPException(422, f"unknown experience id(s): {bad}")


@app.get("/health")
def health() -> dict:
    return {"ok": True, "experiences": len(seed().experiences)}


@app.get("/catalog")
def catalog() -> dict:
    """Everything the map and provider views need to render names and pins."""
    s = seed()
    return {
        "places": list(s.places.values()),
        "providers": list(s.providers.values()),
        "experiences": list(s.experiences.values()),
        "provider_listings": store.listing_ids(),
        "paused": sorted(store.paused_ids()),
        "vocabulary": {"tags": get_args(Tag), "categories": get_args(Category),
                       "accessibility": get_args(Access)},
    }


@app.post("/discover")
def discover_(req: DiscoverRequest) -> DiscoverResponse:
    recs, excluded = discover(req.state, seed(), req.k)
    return DiscoverResponse(recommendations=recs, excluded=excluded)


@app.post("/plan")
def plan_(req: PlanRequest) -> PlanResponse:
    s = seed()
    _check_ids(s, req.add, *(x.experience_id for x in req.itinerary.stops))
    it = req.itinerary
    if req.add:
        it = insert(it, req.add, req.state, s)
        if it is None:
            raise HTTPException(409, f"{s.experiences[req.add].title} doesn't fit around your "
                                     "current plan. Remove or unlock a stop to make room.")
    it = plan(it, req.state, s, req.max_new)
    return PlanResponse(itinerary=it, problems=validate(it, req.state, s))


@app.post("/events")
def events(req: EventRequest) -> EventResponse:
    s = seed()
    _check_ids(s, req.event.experience_id, *(x.experience_id for x in req.itinerary.stops))
    out = replan(req.itinerary, req.state, req.event, s)
    return EventResponse(**out.model_dump(), problems=validate(out.itinerary, out.state, s))


@app.post("/chat")
def chat(req: ChatRequest) -> ChatResponse:
    s, now = seed(), req.now or now_ist()
    parsed, parser = parse(req.text, now, s)
    state = to_state(parsed, now, s, req.state)
    recs, excluded = discover(state, s)
    store.log_demand(state, [r.experience_id for r in recs], excluded)  # aggregates only
    it = plan(Itinerary(), state, s)
    return ChatResponse(
        parser=parser, parsed=parsed, state=state, recommendations=recs, excluded=excluded,
        plan=PlanResponse(itinerary=it, problems=validate(it, state, s)),
    )


@app.get("/weather")
def weather_now(at: datetime) -> dict:
    """Live conditions for the hour `at` (Jaipur centre). available=false when offline."""
    hours = weather.forecast(at.date())
    return {"available": hours is not None, "hour": hours and weather.at_hour(hours, at)}


class ContextCheckRequest(BaseModel):
    state: TravelerState
    itinerary: Itinerary
    now: datetime


class ContextCheckResponse(BaseModel):
    available: bool
    risks: list[weather.Risk] = []
    proposed: ContextEvent | None = None  # the replan we suggest; the traveler decides (doc §9.2)


@app.post("/context/check")
def context_check(req: ContextCheckRequest) -> ContextCheckResponse:
    """Detect a live weather risk to the plan and propose (not apply) a replan."""
    hours = weather.forecast(req.now.date())
    if hours is None:
        return ContextCheckResponse(available=False)
    ahead = [s for s in upcoming(req.itinerary) if s.end > req.now]
    risks = weather.plan_risks(ahead, seed(), hours)
    worst = next((c for c in ("rain", "heat") if any(r.condition == c for r in risks)), None)
    proposed = None
    if worst and worst != req.state.weather:
        proposed = ContextEvent(kind="weather", at=req.now, weather=worst)
    return ContextCheckResponse(available=True, risks=risks, proposed=proposed)


class FeedbackRequest(BaseModel):
    state: TravelerState
    feedback: Feedback


class FeedbackResponse(DiscoverResponse):
    state: TravelerState


@app.post("/feedback")
def feedback(req: FeedbackRequest) -> FeedbackResponse:
    """Accept / reject (with reason) / skip. Returns the updated state and fresh recommendations;
    the provider only ever sees the aggregate (kind + reason)."""
    s = seed()
    _check_ids(s, req.feedback.experience_id)
    state = learn(req.state, s.experiences[req.feedback.experience_id], req.feedback)
    store.log_feedback(req.feedback.experience_id, req.feedback.kind, req.feedback.reason)
    recs, excluded = discover(state, s)
    return FeedbackResponse(state=state, recommendations=recs, excluded=excluded)


# ---------------------------------------------------------------- provider side (M7)

@app.post("/providers/draft")
def provider_draft(req: DraftRequest) -> DraftResponse:
    d, parser = provider.draft(req.text, seed())
    return DraftResponse(parser=parser, draft=d)


@app.post("/providers/listings")
def provider_publish(req: PublishRequest) -> Listing:
    today = (req.today or now_ist()).date()
    try:
        pv, pl, exp = provider.to_listing(req.draft, seed(), today)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    store.add_listing(pv, pl, exp)
    return Listing(provider=pv, place=pl, experience=exp)


@app.post("/providers/availability")
def provider_availability(req: PauseRequest) -> dict:
    _check_ids(seed(), req.experience_id)
    store.set_paused(req.experience_id, req.paused)
    return {"experience_id": req.experience_id, "paused": req.paused}


@app.get("/providers/insights/{experience_id}")
def provider_insights(experience_id: str) -> dict:
    s = seed()
    _check_ids(s, experience_id)
    return {"experience_id": experience_id, "paused": experience_id in store.paused_ids(),
            **provider.insights(s.experiences[experience_id], store.demand_rows(),
                                store.feedback_rows(experience_id))}
