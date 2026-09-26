"""HTTP API: a thin, stateless wrapper over the engine. Clients send state/itinerary back each call.

Run: uvicorn app.main:app --reload   (interactive schema at /docs)
"""
import os
from datetime import datetime
from typing import get_args

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import RedirectResponse
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
    edit_token: str | None = None  # returned once, on publish: needed to edit/pause/delete


class PauseRequest(BaseModel):
    experience_id: str
    paused: bool


def _check_ids(s: Seed, *ids: str | None) -> None:
    if bad := [i for i in ids if i and i not in s.experiences]:
        raise HTTPException(422, f"unknown experience id(s): {bad}")


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    """Opening the API in a browser lands on the interactive docs, not a bare 404."""
    return RedirectResponse("/docs")


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
    """Accept / reject (with reason) / skip / rating. Returns the updated state and fresh
    recommendations; the provider only ever sees aggregates (kind + reason, star ratings)."""
    s, fb = seed(), req.feedback
    _check_ids(s, fb.experience_id)
    if fb.kind == "rating":
        if fb.rating is None:
            raise HTTPException(422, "a rating needs 1-5 stars")
        store.add_rating(fb.experience_id, fb.rating, fb.as_described, fb.at)
        s = seed()  # the rating is now evidence: re-rank with it
    state = learn(req.state, s.experiences[fb.experience_id], fb)
    store.log_feedback(fb.experience_id, fb.kind, fb.reason)
    recs, excluded = discover(state, s)
    return FeedbackResponse(state=state, recommendations=recs, excluded=excluded)


# ---------------------------------------------------------------- bookings (M9 stub)

class BookingRequest(BaseModel):
    state: TravelerState
    itinerary: Itinerary
    experience_id: str  # a stop already in the itinerary


class BookingResponse(BaseModel):
    code: str
    experience_id: str
    start: datetime
    people: int
    itinerary: Itinerary  # the booked stop is now confirmed + locked


@app.post("/bookings")
def book(req: BookingRequest) -> BookingResponse:
    """Hold spots for a planned stop. No payment: a stub that respects capacity per start time.

    ponytail: discovery still checks capacity per booking, not spots left per slot; a full slot
    is refused here with a clear reason. Move the per-slot count into feasibility if it matters.
    """
    s = seed()
    _check_ids(s, req.experience_id)
    stop = next((x for x in upcoming(req.itinerary) if x.experience_id == req.experience_id), None)
    if stop is None:
        raise HTTPException(422, "add it to your plan before booking")
    if problems := [p for p in validate(req.itinerary, req.state, s) if stop.title in p]:
        raise HTTPException(409, f"can't book yet: {problems[0]}")
    people, left = len(req.state.group), s.experiences[stop.experience_id].capacity - store.booked(
        stop.experience_id, stop.start)
    if people > left:
        raise HTTPException(409, f"only {max(left, 0)} spots left at {stop.start:%H:%M} "
                                 f"for {people} of you")
    code = store.add_booking(stop.experience_id, stop.start, people)
    it = req.itinerary.model_copy(deep=True)
    for x in it.stops:
        if x.experience_id == stop.experience_id and x.start == stop.start:
            x.status, x.locked = "confirmed", True
    return BookingResponse(code=code, experience_id=stop.experience_id, start=stop.start,
                           people=people, itinerary=it)


@app.delete("/bookings/{code}")
def cancel_booking(code: str) -> dict:
    if not store.cancel_booking(code):
        raise HTTPException(404, "no booking with that code")
    return {"code": code, "cancelled": True}


# ---------------------------------------------------------------- provider side

def _require_owner(experience_id: str, token: str | None) -> None:
    """Provider listings change only with their edit token. Seed (curated) experiences are open
    in the demo; set SEED_ADMIN_TOKEN to lock them too."""
    if store.is_listing(experience_id):
        if not store.owns(experience_id, token):
            raise HTTPException(403, "only the listing's owner can change it (edit token needed)")
    elif (admin := os.environ.get("SEED_ADMIN_TOKEN")) and token != admin:
        raise HTTPException(403, "curated experiences need the admin token")


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
    token = store.add_listing(pv, pl, exp)
    return Listing(provider=pv, place=pl, experience=exp, edit_token=token)


@app.get("/providers/listings/{experience_id}")
def provider_listing(experience_id: str) -> DraftResponse:
    """A provider listing as an editable draft (public data; editing needs the token)."""
    found = store.get_listing(experience_id)
    if found is None:
        raise HTTPException(404, "not a provider listing")
    return DraftResponse(parser="stored", draft=provider.to_draft(*found, SEED))


@app.put("/providers/listings/{experience_id}")
def provider_update(experience_id: str, req: PublishRequest,
                    x_provider_token: str | None = Header(default=None)) -> Listing:
    if not store.is_listing(experience_id):
        raise HTTPException(404, "not a provider listing")
    _require_owner(experience_id, x_provider_token)
    today = (req.today or now_ist()).date()
    try:
        pv, pl, exp = provider.to_listing(req.draft, seed(), today,
                                          key=provider.listing_key(experience_id))
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    store.update_listing(pv, pl, exp)
    return Listing(provider=pv, place=pl, experience=exp)


@app.delete("/providers/listings/{experience_id}")
def provider_delete(experience_id: str,
                    x_provider_token: str | None = Header(default=None)) -> dict:
    if not store.is_listing(experience_id):
        raise HTTPException(404, "not a provider listing")
    _require_owner(experience_id, x_provider_token)
    store.delete_listing(experience_id)
    return {"experience_id": experience_id, "deleted": True}


@app.post("/providers/availability")
def provider_availability(req: PauseRequest,
                          x_provider_token: str | None = Header(default=None)) -> dict:
    _check_ids(seed(), req.experience_id)
    _require_owner(req.experience_id, x_provider_token)
    store.set_paused(req.experience_id, req.paused)
    return {"experience_id": req.experience_id, "paused": req.paused}


@app.get("/providers/insights/{experience_id}")
def provider_insights(experience_id: str) -> dict:
    s = seed()
    _check_ids(s, experience_id)
    exp = s.experiences[experience_id]
    return {"experience_id": experience_id, "paused": experience_id in store.paused_ids(),
            "booked_people": store.booked_people(experience_id),
            "rating": exp.rating, "review_count": exp.review_count,
            **provider.insights(exp, store.demand_rows(), store.feedback_rows(experience_id))}


# ---------------------------------------------------------------- v2 website (additive)
# Accounts, profile, admin, trips. Mounted beside the endpoints above without changing them;
# WEBSITE_V2=0 turns the whole block off if the backend is mid-refactor.
if os.environ.get("WEBSITE_V2", "1") == "1":
    from app.routes import admin as admin_routes
    from app.routes import auth as auth_routes
    from app.routes import calendar as calendar_routes
    from app.routes import me as me_routes
    from app.routes import trips as trip_routes

    for _router in (auth_routes.router, me_routes.router, admin_routes.router, trip_routes.router, calendar_routes.router):
        app.include_router(_router)
