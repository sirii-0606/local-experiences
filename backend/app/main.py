"""HTTP API: a thin, stateless wrapper over the engine. Clients send state/itinerary back each call.

Run: uvicorn app.main:app --reload   (interactive schema at /docs)
"""

import os
import re
from datetime import datetime
from pathlib import Path
from statistics import mean
from typing import get_args

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel

from app import accounts, opendata, personal, provider, store, weather
from app.engine.adapt import Replan, replan
from app.engine.feasibility import km_between, rush_hour
from app.engine.itinerary import insert, plan, upcoming, validate
from app.engine.learn import learn
from app.engine.rank import Recommendation, discover
from app.intent import (
    DEFAULT_PLACE,
    ParsedRequest,
    _find_place,
    now_ist,
    parse,
    place_candidates,
    to_state,
)
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
from app.routes.deps import COOKIE
from app.schemas import ChatContext, ClosedNow, WeatherNow
from app.seed import Seed, load_seed
from app.simulation import (
    PRESET_SCENARIOS,
    DigitalTwinResult,
    SimulationScenario,
    run_digital_twin_simulation,
)
from app.social import (
    SocialSignal,
    UserSocialReport,
    add_social_report,
    get_social_signals,
    get_trending_hashtags,
)

SEED = load_seed()  # curated, read-only; provider listings/pauses are overlaid per request
app = FastAPI(title="Local & Experiences API")


def _static_dir() -> Path | None:
    if raw := os.environ.get("STATIC_DIR"):
        d = Path(raw).resolve()
        if (d / "index.html").is_file():
            return d
    return None


@app.middleware("http")
async def _prod_routing(request: Request, call_next):
    """Strip /api so the built UI works without Vite's dev proxy, and serve STATIC_DIR when set."""
    path = request.scope["path"]
    if path == "/api" or path.startswith("/api/"):
        request.scope["path"] = path[4:] or "/"
        return await call_next(request)
    dist = _static_dir()
    if (
        dist
        and request.method in ("GET", "HEAD")
        and not path.startswith(("/docs", "/redoc", "/openapi.json", "/health"))
    ):
        target = (dist / path.lstrip("/")).resolve()
        if target.is_relative_to(dist) and target.is_file():
            return FileResponse(target)
        return FileResponse(dist / "index.html")
    return await call_next(request)


def seed() -> Seed:
    return store.current_seed(SEED)


def area(lat: float, lon: float) -> tuple[Seed, str]:
    """Everything a traveler at (lat, lon) can be offered: curated and provider supply within
    40 km, plus open-data places around them (fetched once per area, then cached).
    Returns the seed and where its places came from."""
    live_seed, source = opendata.area_seed(lat, lon)
    merged = opendata.merge_near(seed(), store.current_seed(live_seed), lat, lon)
    curated = any(not i.startswith("ex-od-") for i in merged.experiences)
    return merged, "+".join(
        x for x in ("curated" if curated else "", "" if source == "none" else source) if x
    ) or "none"


def seed_at(lat: float, lon: float) -> Seed:
    return area(lat, lon)[0]


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
    lat: float | None = None  # the device's location, if the traveler shared it
    lon: float | None = None


class ChatResponse(BaseModel):
    parser: str  # "llm" or "rules"
    parsed: ParsedRequest
    state: TravelerState
    recommendations: list[Recommendation]
    excluded: dict[str, list[str]]
    plan: PlanResponse
    context: ChatContext | None = None  # where, weather, traffic, closed-now, assumptions


class DraftRequest(BaseModel):
    text: str


class DraftResponse(BaseModel):
    parser: str
    draft: provider.ListingDraft
    fits: list[str] = []  # traveler segments this experience suits (who we'll match it to)


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
def catalog(lat: float | None = None, lon: float | None = None) -> dict:
    """Everything the map and provider views need to render names and pins.
    With lat/lon: what's offered around that point (any city), not just the curated seed."""
    s = seed() if lat is None or lon is None else seed_at(lat, lon)
    return {
        "places": list(s.places.values()),
        "providers": list(s.providers.values()),
        "experiences": list(s.experiences.values()),
        "provider_listings": store.listing_ids(),
        "paused": sorted(store.paused_ids()),
        "vocabulary": {
            "tags": get_args(Tag),
            "categories": get_args(Category),
            "accessibility": get_args(Access),
        },
    }


@app.post("/discover")
def discover_(req: DiscoverRequest) -> DiscoverResponse:
    recs, excluded = discover(req.state, seed_at(req.state.lat, req.state.lon), req.k)
    return DiscoverResponse(recommendations=recs, excluded=excluded)


@app.post("/plan")
def plan_(req: PlanRequest) -> PlanResponse:
    s = seed_at(req.state.lat, req.state.lon)
    _check_ids(s, req.add, *(x.experience_id for x in req.itinerary.stops))
    it = req.itinerary
    if req.add:
        it = insert(it, req.add, req.state, s)
        if it is None:
            raise HTTPException(
                409,
                f"{s.experiences[req.add].title} doesn't fit around your "
                "current plan. Remove or unlock a stop to make room.",
            )
    it = plan(it, req.state, s, req.max_new)
    return PlanResponse(itinerary=it, problems=validate(it, req.state, s))


@app.post("/events")
def events(req: EventRequest) -> EventResponse:
    s = seed_at(req.state.lat, req.state.lon)
    _check_ids(s, req.event.experience_id, *(x.experience_id for x in req.itinerary.stops))
    out = replan(req.itinerary, req.state, req.event, s)
    return EventResponse(**out.model_dump(), problems=validate(out.itinerary, out.state, s))


TIME_REASONS = ("no time left", "not running", "would end", "leaving too little")


def _locate(
    req: ChatRequest, parsed: ParsedRequest, s0: Seed, profile, notes: list[str]
) -> tuple[float, float, str, str]:
    """(lat, lon, name, source). What they typed beats the device, which beats the last turn."""
    if parsed.near and (pl := next((x for x in s0.places.values() if x.name == parsed.near), None)):
        return pl.lat, pl.lon, pl.name, "text"
    if parsed.place_name:
        if found := opendata.geocode_phrase(parsed.place_name):  # "pune not any" -> "pune"
            return found[1], found[2], found[0], "text"
        notes.append(f'Couldn\'t find a place called "{parsed.place_name}" in India.')
    if req.lat is not None and req.lon is not None:
        return req.lat, req.lon, "your location", "device"
    if req.state:
        return req.state.lat, req.state.lon, "where you were", "previous"
    if profile and profile.home_city and (found := opendata.geocode(profile.home_city)):
        return found[1], found[2], found[0], "profile"
    home = SEED.places[DEFAULT_PLACE]
    notes.append(
        "No location given, so this is Jaipur (the demo city). Share your location or "
        "name the city you're in."
    )
    return home.lat, home.lon, "Jaipur (demo city)", "default"


def _end_point(
    kind: str, text: str, s: Seed, state: TravelerState, city: str, notes: list[str]
) -> TravelerState:
    """ "Before my train": be back at a station by the end of the window. A station named in
    the text wins; else the best-known one within 12 km; else the nearest."""
    spots = opendata.landmarks(s, kind)
    if not spots:
        notes.append(f"Couldn't find a {kind} nearby, so the plan doesn't include getting there.")
        return state
    said = set(re.findall(r"[a-z]+", text.lower())) - set(re.findall(r"[a-z]+", city.lower()))
    common = {
        "railway",
        "station",
        "junction",
        "terminus",
        "central",
        "road",
        "international",
        "airport",
        "city",
        "west",
        "east",
        "north",
        "south",
    }
    named = [p for p in spots if (opendata._words(p.name) - common) & said]
    close = [p for p in spots if km_between(state.lat, state.lon, p.lat, p.lon) <= 12]
    pick = (
        named
        or close
        or sorted(spots, key=lambda p: km_between(state.lat, state.lon, p.lat, p.lon))
    )[0]
    if not named:
        notes.append(
            f"Planned so you're back at {pick.name} by {state.window_end:%H:%M}. "
            f"Tell me if you leave from a different {kind}."
        )
    return state.model_copy(update={"end_lat": pick.lat, "end_lon": pick.lon})


def _live_weather(state: TravelerState, stated: bool) -> tuple[TravelerState, WeatherNow]:
    """The forecast where they are, for their window. It becomes the state's weather unless they
    told us themselves. ponytail: one condition for the whole window (see decisions.md)."""
    if not opendata.live():
        return state, WeatherNow(available=False)
    hours = weather.forecast(state.window_start.date(), lat=state.lat, lon=state.lon)
    if not hours:
        return state, WeatherNow(available=False)
    span = [h for h in hours if state.window_start.replace(minute=0) <= h.at < state.window_end]
    span = span or [weather.at_hour(hours, state.window_start)]
    rainy = mean(h.condition == "rain" for h in span) >= 0.5
    cond = "rain" if rainy else "heat" if any(h.condition == "heat" for h in span) else "clear"
    if not stated:
        state = state.model_copy(update={"weather": cond})
    return state, WeatherNow(
        available=True,
        condition=cond,
        temp_c=span[0].temp_c,
        rain_chance=max(h.precip_prob or 0 for h in span),
        applied=not stated and cond != "clear",
    )


def _closed_now(state: TravelerState, s: Seed, excluded: dict[str, list[str]]) -> list[ClosedNow]:
    """Good matches ruled out only by the clock, with when they next open."""
    wanted = (
        set(state.intents)
        | {i for t in state.group for i in t.interests}
        | {t for t, w in state.learned.items() if w > 0}
    )
    hits = []
    for eid, reasons in excluded.items():
        exp = s.experiences.get(eid)
        if exp and reasons and all(any(w in r for w in TIME_REASONS) for r in reasons):
            if overlap := len(wanted & set(exp.tags)):
                hits.append((overlap, exp.tourist_index, exp, reasons[0]))
    hits.sort(key=lambda h: (-h[0], -h[1]))
    return [
        ClosedNow(
            experience_id=exp.id,
            title=exp.title,
            why=why,
            next_open=opendata.next_open(exp, state.window_start),
            hours_confirmed=getattr(exp.evidence.get("availability"), "source", None)
            not in ("estimate", None),
        )
        for _, _, exp, why in hits[:3]
    ]


@app.post("/chat")
def chat(req: ChatRequest, request: Request) -> ChatResponse:
    """Message -> traveler state (+ profile, location, live weather) -> ranked, feasible plan.
    Signed in: the profile and learned context shape the starting state, and each message
    nudges that context. Everything assumed is listed in `context.assumptions`."""
    now = req.now or now_ist()
    user = accounts.user_for(request.cookies.get(COOKIE))
    profile = accounts.get_profile(user["id"]) if user else None
    learned = personal.weights(user["id"], profile, SEED) if user else {}
    s0 = seed_at(req.state.lat, req.state.lon) if req.state else seed()
    parsed, parser = parse(req.text, now, s0, personal.summary(profile, learned))
    notes: list[str] = []
    lat, lon, where, source = _locate(req, parsed, s0, profile, notes)
    s, data_source = area(lat, lon)
    spot = parsed.place_name and _find_place(parsed.place_name.lower(), s)
    if spot and spot[1] == re.split(r"[(:,&]", spot[0].lower())[0].strip():  # "near juhu beach"
        pl = next(x for x in s.places.values() if x.name == spot[0])
        lat, lon, where = pl.lat, pl.lon, pl.name

    if req.state:
        base = req.state.model_copy(update={"lat": lat, "lon": lon})
    elif profile:
        base = personal.state(
            profile,
            learned,
            lat,
            lon,
            now,
            with_companions=bool(parsed.with_companions and profile.companions),
        )
    else:
        base = None
    state = to_state(parsed, now, s, base)
    if not parsed.near:
        state = state.model_copy(update={"lat": lat, "lon": lon})
    if parsed.return_to:
        state = _end_point(parsed.return_to, req.text, s, state, where, notes)
    state, wx = _live_weather(state, stated=parsed.raining is not None)

    if not req.state:
        if (
            parsed.with_companions
            and len(state.group) == 3
            and not (profile and profile.companions)
        ):
            notes.append("Assumed 3 of you in the family; tell me how many are with you.")
        if parsed.budget_inr is None:
            notes.append(f"Budget assumed ₹{state.budget_inr} for the group; tell me yours.")
        if not (parsed.start_time or parsed.end_time):
            notes.append(
                f"Starting now ({state.window_start:%H:%M}) until {state.window_end:%H:%M}."
            )

    recs, excluded = discover(state, s)
    # Say plainly when the list isn't what they asked for, and why (never "5 options that fit").
    wanted = ", ".join(t.replace("-", " ") for t in state.intents)
    if state.intents and not any(set(state.intents) & set(e.tags) for e in s.experiences.values()):
        notes.append(f"I don't know any places for {wanted} around {where} yet: open data covers "
                     "sights better than eateries and shops. Local hosts can list theirs under "
                     "For Hosts.")
    elif state.intents and recs and not any(r.factors["intent"] > 0 for r in recs):
        notes.append(f"Nothing for {wanted} fits right now (see why not), so these are the "
                     "closest alternatives.")
    elif not state.intents and not any(t.interests for t in state.group):
        notes.append("I didn't catch what you'd like to do, so these are simply what's open "
                     "nearby. Tell me, e.g. food, history or a view.")
    store.log_demand(state, [r.experience_id for r in recs], excluded)  # aggregates only
    it = plan(Itinerary(), state, s)
    if user:
        accounts.bump_context(
            user["id"], personal.from_message(parsed.intents, parsed.avoid), "chat"
        )
    traffic = (
        "rush hour: travel times estimated 50% longer"
        if rush_hour(state.window_start, state.mode)
        else "normal traffic"
    ) + " (time-of-day estimate)"
    ctx = ChatContext(
        location=where,
        location_source=source,
        lat=lat,
        lon=lon,
        data_source=data_source,
        places_considered=len(s.experiences),
        weather=wx,
        traffic=traffic,
        closed_now=_closed_now(state, s, excluded),
        assumptions=notes,
        profile_used=profile is not None,
    )
    return ChatResponse(
        parser=parser,
        parsed=parsed,
        state=state,
        recommendations=recs,
        excluded=excluded,
        plan=PlanResponse(itinerary=it, problems=validate(it, state, s)),
        context=ctx,
    )


@app.get("/weather")
def weather_now(at: datetime, lat: float = weather.CITY[0], lon: float = weather.CITY[1]) -> dict:
    """Live conditions for the hour `at` at a place (Jaipur centre by default).
    available=false when offline."""
    hours = weather.forecast(at.date(), lat=lat, lon=lon)
    return {
        "available": hours is not None,
        "hour": hours and weather.at_hour(hours, at),
        "summary": weather.current_weather_summary(at, lat, lon).model_dump(),
    }


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
    hours = weather.forecast(req.now.date(), lat=req.state.lat, lon=req.state.lon)
    if hours is None:
        return ContextCheckResponse(available=False)
    ahead = [s for s in upcoming(req.itinerary) if s.end > req.now]
    risks = weather.plan_risks(ahead, seed_at(req.state.lat, req.state.lon), hours)
    worst = next((c for c in ("rain", "heat") if any(r.condition == c for r in risks)), None)
    proposed = None
    if worst and worst != req.state.weather:
        proposed = ContextEvent(kind="weather", at=req.now, weather=worst)
    return ContextCheckResponse(available=True, risks=risks, proposed=proposed)


# ---------------------------------------------------------------- social signals & digital twin


class SimulationRequest(BaseModel):
    scenario: SimulationScenario
    state: TravelerState
    itinerary: Itinerary


@app.get("/social/signals")
def social_signals(
    condition: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
) -> dict:
    """Real-world social signals and trending community hashtags."""
    sigs = get_social_signals(condition, lat, lon)
    trends = get_trending_hashtags(condition)
    return {"signals": sigs, "trending_hashtags": trends}


@app.post("/social/report")
def submit_social_report(report: UserSocialReport) -> SocialSignal:
    """Submit a real-time crowdsourced traveler report or hazard update."""
    return add_social_report(report)


@app.get("/simulation/presets")
def simulation_presets() -> list[SimulationScenario]:
    """Preset weather impact scenarios for interactive Digital Twin testing."""
    return PRESET_SCENARIOS


@app.post("/simulation/what-if")
def simulation_what_if(req: SimulationRequest) -> DigitalTwinResult:
    """Run Digital Twin simulation with weather perturbations & plan repair."""
    return run_digital_twin_simulation(req.scenario, req.state, req.itinerary, seed())


class FeedbackRequest(BaseModel):
    state: TravelerState
    feedback: Feedback


class FeedbackResponse(DiscoverResponse):
    state: TravelerState


@app.post("/feedback")
def feedback(req: FeedbackRequest, request: Request) -> FeedbackResponse:
    """Accept / reject (with reason) / skip / rating. Returns the updated state and fresh
    recommendations; the provider only ever sees aggregates (kind + reason, star ratings).
    Signed in: what it taught about their taste is also saved to their profile context."""
    s, fb = seed_at(req.state.lat, req.state.lon), req.feedback
    _check_ids(s, fb.experience_id)
    if fb.kind == "rating":
        if fb.rating is None:
            raise HTTPException(422, "a rating needs 1-5 stars")
        store.add_rating(fb.experience_id, fb.rating, fb.as_described, fb.at)
        s = seed_at(req.state.lat, req.state.lon)  # the rating is now evidence: re-rank with it
    state = learn(req.state, s.experiences[fb.experience_id], fb)
    if (user := accounts.user_for(request.cookies.get(COOKIE))) and (
        deltas := {
            t: w - req.state.learned.get(t, 0.0)
            for t, w in state.learned.items()
            if w != req.state.learned.get(t, 0.0)
        }
    ):
        accounts.bump_context(user["id"], deltas, "feedback")
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
    s = seed_at(req.state.lat, req.state.lon)
    _check_ids(s, req.experience_id)
    stop = next((x for x in upcoming(req.itinerary) if x.experience_id == req.experience_id), None)
    if stop is None:
        raise HTTPException(422, "add it to your plan before booking")
    if problems := [p for p in validate(req.itinerary, req.state, s) if stop.title in p]:
        raise HTTPException(409, f"can't book yet: {problems[0]}")
    people, left = (
        len(req.state.group),
        s.experiences[stop.experience_id].capacity - store.booked(stop.experience_id, stop.start),
    )
    if people > left:
        raise HTTPException(
            409, f"only {max(left, 0)} spots left at {stop.start:%H:%M} for {people} of you"
        )
    code = store.add_booking(stop.experience_id, stop.start, people)
    it = req.itinerary.model_copy(deep=True)
    for x in it.stops:
        if x.experience_id == stop.experience_id and x.start == stop.start:
            x.status, x.locked = "confirmed", True
    return BookingResponse(
        code=code, experience_id=stop.experience_id, start=stop.start, people=people, itinerary=it
    )


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
    if not d.near and d.lat is None:  # outside the curated city: place it by the area it names
        for phrase in place_candidates(req.text.lower()):
            if found := opendata.geocode_phrase(phrase):
                # their own words for the area; the pin is the town's centre until they move it
                d.area, d.lat, d.lon = phrase.title(), found[1], found[2]
                break
    return DraftResponse(parser=parser, draft=d, fits=provider.segments(d))


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
def provider_update(
    experience_id: str, req: PublishRequest, x_provider_token: str | None = Header(default=None)
) -> Listing:
    if not store.is_listing(experience_id):
        raise HTTPException(404, "not a provider listing")
    _require_owner(experience_id, x_provider_token)
    today = (req.today or now_ist()).date()
    try:
        pv, pl, exp = provider.to_listing(
            req.draft, seed(), today, key=provider.listing_key(experience_id)
        )
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    store.update_listing(pv, pl, exp)
    return Listing(provider=pv, place=pl, experience=exp)


@app.delete("/providers/listings/{experience_id}")
def provider_delete(
    experience_id: str, x_provider_token: str | None = Header(default=None)
) -> dict:
    if not store.is_listing(experience_id):
        raise HTTPException(404, "not a provider listing")
    _require_owner(experience_id, x_provider_token)
    store.delete_listing(experience_id)
    return {"experience_id": experience_id, "deleted": True}


@app.post("/providers/availability")
def provider_availability(
    req: PauseRequest, x_provider_token: str | None = Header(default=None)
) -> dict:
    _check_ids(seed(), req.experience_id)
    _require_owner(req.experience_id, x_provider_token)
    store.set_paused(req.experience_id, req.paused)
    return {"experience_id": req.experience_id, "paused": req.paused}


@app.get("/providers/insights/{experience_id}")
def provider_insights(experience_id: str) -> dict:
    s = seed()
    _check_ids(s, experience_id)
    exp = s.experiences[experience_id]
    return {
        "experience_id": experience_id,
        "paused": experience_id in store.paused_ids(),
        "booked_people": store.booked_people(experience_id),
        "rating": exp.rating,
        "review_count": exp.review_count,
        "fits": provider.segments(exp),
        **provider.insights(exp, store.demand_rows(), store.feedback_rows(experience_id)),
    }


# ---------------------------------------------------------------- v2 website (additive)
# Accounts, profile, admin, trips. Mounted beside the endpoints above without changing them;
# WEBSITE_V2=0 turns the whole block off if the backend is mid-refactor.
if os.environ.get("WEBSITE_V2", "1") == "1":
    from app.routes import admin as admin_routes
    from app.routes import auth as auth_routes
    from app.routes import calendar as calendar_routes
    from app.routes import me as me_routes
    from app.routes import reviews as review_routes
    from app.routes import trips as trip_routes

    for _router in (
        auth_routes.router,
        me_routes.router,
        admin_routes.router,
        trip_routes.router,
        calendar_routes.router,
        review_routes.router,
    ):
        app.include_router(_router)
