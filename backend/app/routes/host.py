"""The host loop: a signed-in host's own listings, booking requests between travelers and
hosts, and what travelers near a host asked for (demand near you).

Accepting a request makes a real booking (store.add_booking); its code lets the traveler post
a verified-visit review after the visit (routes/reviews.py).
"""

from collections import Counter

from fastapi import APIRouter, Depends, HTTPException

from app import accounts, store
from app.engine.feasibility import earliest_start
from app.intent import now_ist
from app.provider import _band
from app.routes.deps import csrf, current_user
from app.schemas import (
    AreaDemand,
    BookingRequestIn,
    BookingRequestOut,
    HostListing,
    RequestDecision,
)

router = APIRouter(tags=["hosts"], dependencies=[Depends(csrf)])
MIN_SEARCHES = 3  # below this, only the count is shown


def _out(r: dict) -> BookingRequestOut:
    found = store.get_listing(r["experience_id"])
    title = found[2].title if found else "Listing removed"
    return BookingRequestOut(**{k: v for k, v in r.items() if k != "traveler_id"}, title=title)


def _host_request(request_id: int, user: dict) -> dict:
    r = store.get_request(request_id)
    if r is None or store.listing_user(r["experience_id"]) != user["id"]:
        raise HTTPException(404, "no such request")
    return r


@router.get("/me/listings")
def my_listings(user: dict = Depends(current_user)) -> list[HostListing]:
    paused = store.paused_ids()
    out = []
    for eid in store.user_listing_ids(user["id"]):
        if found := store.get_listing(eid):
            _, place, exp = found
            out.append(
                HostListing(
                    experience_id=eid,
                    title=exp.title,
                    place_name=place.name,
                    lat=place.lat,
                    lon=place.lon,
                    paused=eid in paused,
                    pending_requests=store.pending_count(eid),
                    created=store.listing_created(eid),
                )
            )
    return out


@router.post("/requests", status_code=201)
def request_booking(req: BookingRequestIn, user: dict = Depends(current_user)) -> BookingRequestOut:
    found = store.get_listing(req.experience_id)
    host = store.listing_user(req.experience_id)
    if found is None or host is None:
        raise HTTPException(404, "this listing doesn't take requests")
    if host == user["id"]:
        raise HTTPException(409, "that's your own listing")
    exp = found[2]
    start = req.start.replace(tzinfo=None, second=0, microsecond=0)
    if req.experience_id in store.paused_ids():
        raise HTTPException(409, "the host has paused this listing")
    if start < now_ist():
        raise HTTPException(422, "that time has passed")
    if earliest_start(exp, start) != start:
        raise HTTPException(409, f"{exp.title} doesn't run at {start:%a %H:%M}")
    left = exp.capacity - store.booked(exp.id, start)
    if req.people > left:
        raise HTTPException(409, f"only {max(left, 0)} spots left at {start:%H:%M}")
    r = store.add_request(exp.id, user["id"], user["display_name"], req.people, start, req.note)
    return _out(r)


@router.get("/me/requests")
def my_requests(user: dict = Depends(current_user)) -> list[BookingRequestOut]:
    return [_out(r) for r in store.traveler_requests(user["id"])]


@router.delete("/me/requests/{request_id}")
def cancel_request(request_id: int, user: dict = Depends(current_user)) -> BookingRequestOut:
    r = store.get_request(request_id)
    if r is None or r["traveler_id"] != user["id"]:
        raise HTTPException(404, "no such request")
    if r["status"] in ("declined", "cancelled"):
        raise HTTPException(409, f"this request is already {r['status']}")
    if r["booking_code"]:
        store.cancel_booking(r["booking_code"])
    store.set_request_status(request_id, "cancelled")
    return _out(store.get_request(request_id))


@router.get("/me/requests/incoming")
def incoming(user: dict = Depends(current_user)) -> list[BookingRequestOut]:
    return [_out(r) for r in store.host_requests(store.user_listing_ids(user["id"]))]


@router.post("/me/requests/{request_id}/decision")
def decide(
    request_id: int, req: RequestDecision, user: dict = Depends(current_user)
) -> BookingRequestOut:
    r = _host_request(request_id, user)
    if r["status"] != "pending":
        raise HTTPException(409, f"this request is already {r['status']}")
    code = None
    if req.accept:
        found = store.get_listing(r["experience_id"])
        left = found[2].capacity - store.booked(r["experience_id"], r["start"]) if found else 0
        if r["people"] > left:
            raise HTTPException(409, f"only {max(left, 0)} spots left at {r['start']:%H:%M}")
        code = store.add_booking(r["experience_id"], r["start"], r["people"])
    store.set_request_status(request_id, "accepted" if req.accept else "declined", code)
    return _out(store.get_request(request_id))


@router.get("/providers/demand")
def demand_near(lat: float, lon: float) -> AreaDemand:
    """Public aggregates: what travelers around here asked for, and what found nothing."""
    rows = store.area_demand_rows(lat, lon)
    if len(rows) < MIN_SEARCHES:
        return AreaDemand(searches=len(rows), min_searches=MIN_SEARCHES)
    sizes = Counter(
        "solo" if r["group_size"] == 1 else "2" if r["group_size"] == 2 else "3+" for r in rows
    )
    return AreaDemand(
        searches=len(rows),
        min_searches=MIN_SEARCHES,
        wanted=Counter(i for r in rows for i in r["intents"]).most_common(8),
        unmet=Counter(i for r in rows for i in r["unmet"]).most_common(8),
        start_hours=sorted(Counter(r["start_hour"] for r in rows).items()),
        budget_per_person=Counter(_band(r["budget_pp"]) for r in rows).most_common(),
        group_sizes=sizes.most_common(),
    )


def attach(experience_id: str, user: dict | None) -> None:
    """Publishing while signed in: the listing is the host's, and a traveler becomes a host."""
    if user is None:
        return
    store.set_listing_user(experience_id, user["id"])
    if user["role"] == "traveler":
        accounts.update(user["id"], role="provider")
