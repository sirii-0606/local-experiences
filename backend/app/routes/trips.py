"""The signed-in user's trips (P3-P5): list, create, open, edit/rename, delete,
candidates scoring, stay recommendations, multi-day itinerary generation, and nearby suggestions."""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException

from app import accounts
from app.models import TravelerState
from app.routes.deps import csrf, current_user
from app.schemas import (
    Candidate,
    GuideSuggestion,
    MealSuggestion,
    QuickStopSuggestion,
    SplitSuggestion,
    Stay,
    StayRecommendation,
    StopDeleteResponse,
    Trip,
    TripDraft,
    TripSuggestions,
)

router = APIRouter(prefix="/trips", tags=["trips"], dependencies=[Depends(csrf)])


def _check_must_see(draft: TripDraft) -> None:
    from app.main import seed  # lazy: main mounts this router, so a top-level import would cycle
    unknown = sorted(set(draft.must_see) - set(seed().experiences))
    if unknown:
        raise HTTPException(422, f"unknown experiences: {', '.join(unknown)}")


def _found(trip: Trip | None) -> Trip:
    if trip is None:
        raise HTTPException(404, "no such trip")
    return trip


@router.get("/stays", response_model=list[Stay])
def list_stays(user: dict = Depends(current_user)) -> list[Stay]:
    from app.main import seed
    return [Stay.model_validate(s.model_dump()) for s in seed().stays.values()]


@router.get("")
def list_trips(user: dict = Depends(current_user)) -> list[Trip]:
    return accounts.list_trips(user["id"])


@router.post("", status_code=201)
def create_trip(draft: TripDraft, user: dict = Depends(current_user)) -> Trip:
    _check_must_see(draft)
    return accounts.create_trip(user["id"], draft)


@router.get("/{trip_id}")
def get_trip(trip_id: int, user: dict = Depends(current_user)) -> Trip:
    return _found(accounts.get_trip(user["id"], trip_id))


@router.put("/{trip_id}")
def update_trip(trip_id: int, draft: TripDraft, user: dict = Depends(current_user)) -> Trip:
    _found(accounts.get_trip(user["id"], trip_id))
    _check_must_see(draft)
    return _found(accounts.update_trip(user["id"], trip_id, draft))


@router.delete("/{trip_id}", status_code=204)
def delete_trip(trip_id: int, user: dict = Depends(current_user)) -> None:
    if not accounts.delete_trip(user["id"], trip_id):
        raise HTTPException(404, "no such trip")


@router.post("/{trip_id}/candidates", response_model=list[Candidate])
def get_trip_candidates(trip_id: int, user: dict = Depends(current_user)) -> list[Candidate]:
    from app.engine import trip as trip_engine
    from app.main import seed
    t = _found(accounts.get_trip(user["id"], trip_id))
    candidates = trip_engine.score_candidates(t, seed())
    return [
        Candidate(
            experience_id=c.experience_id,
            title=c.title,
            score=c.score,
            reasons=c.reasons,
            travel_by_mode=c.travel_by_mode,
            duration_min=c.duration_min,
            cost_inr=c.cost_inr,
            feasible_days=c.feasible_days,
            must_see=c.must_see,
            along_route=c.along_route,
        )
        for c in candidates
    ]


@router.post("/{trip_id}/stays/recommendations", response_model=list[StayRecommendation])
def get_stay_recommendations(
    trip_id: int, user: dict = Depends(current_user)
) -> list[StayRecommendation]:
    from app.engine import trip as trip_engine
    from app.main import seed
    t = _found(accounts.get_trip(user["id"], trip_id))
    in_person_ids = [
        eid for eid, dec in t.shortlist.items() if dec == "in_person"
    ]
    recs = trip_engine.score_stays(t, seed(), in_person_ids)
    return [
        StayRecommendation(
            stay=Stay.model_validate(r.stay.model_dump()),
            score=r.score,
            distance_to_picks_km=r.distance_to_picks_km,
            travel_to_centroid_min=r.travel_to_centroid_min,
            reasons=r.reasons,
        )
        for r in recs
    ]


@router.post("/{trip_id}/itinerary/generate", response_model=Trip)
def generate_trip_itinerary(trip_id: int, user: dict = Depends(current_user)) -> Trip:
    from app.engine import trip as trip_engine
    from app.main import seed
    t = _found(accounts.get_trip(user["id"], trip_id))
    it = trip_engine.build_itinerary(t, seed())
    draft_dict = t.model_dump()
    draft_dict["itinerary"] = it.model_dump()
    updated = accounts.update_trip(user["id"], trip_id, TripDraft.model_validate(draft_dict))
    return _found(updated)


@router.get("/{trip_id}/suggestions", response_model=TripSuggestions)
def get_trip_suggestions(trip_id: int, user: dict = Depends(current_user)) -> TripSuggestions:
    from app.engine import nearby as nearby_engine
    from app.engine import trip as trip_engine
    from app.main import seed
    s = seed()
    t = _found(accounts.get_trip(user["id"], trip_id))
    it = trip_engine.build_itinerary(t, s)
    origin_lat, origin_lon = trip_engine._origin_coordinates(t, s)
    state = TravelerState(
        lat=origin_lat,
        lon=origin_lon,
        window_start=datetime.combine(t.start_date, t.day_start),
        window_end=datetime.combine(t.start_date, t.day_end),
        budget_inr=t.budget_inr,
        group=trip_engine._trip_group(t),
    )
    num_days = max(1, (t.end_date - t.start_date).days + 1)
    all_meals = []
    for d_idx in range(num_days):
        day_date = t.start_date + timedelta(days=d_idx)
        daily_meals = nearby_engine.meal_suggestions(it, day_date, state, s)
        for m in daily_meals:
            m.day = day_date
            m.day_index = d_idx + 1
        all_meals.extend(daily_meals)

    quicks = nearby_engine.quick_stops(it, state, s)
    guides = nearby_engine.guide_driver_suggestions(t, it, s)
    splits = nearby_engine.auto_suggest_splits(t, s)
    return TripSuggestions(
        meals=[MealSuggestion(**m.__dict__) for m in all_meals],
        quick_stops=[QuickStopSuggestion(**q.__dict__) for q in quicks],
        guides=[GuideSuggestion(**g.__dict__) for g in guides],
        splits=[
            SplitSuggestion(
                day=sp.day,
                start_time=sp.start_time,
                end_time=sp.end_time,
                rejoin_name=sp.rejoin_name,
                rejoin_place_id=sp.rejoin_place_id,
                reason=sp.reason,
                group_a=sp.group_a,
                activity_a=sp.activity_a,
                group_b=sp.group_b,
                activity_b=sp.activity_b,
            )
            for sp in splits
        ],
    )


@router.delete("/{trip_id}/stops/{experience_id}", response_model=StopDeleteResponse)
def delete_trip_stop(trip_id: int, experience_id: str, user: dict = Depends(current_user)) -> StopDeleteResponse:
    """Manually deletes a stop from a trip, updates rejected preferences, and dynamically replans."""
    from app.engine import learn
    from app.engine import trip as trip_engine
    from app.main import seed

    t = _found(accounts.get_trip(user["id"], trip_id))
    s = seed()

    shortlist = dict(t.shortlist)
    shortlist[experience_id] = "skip"

    deleted_title = experience_id
    if t.itinerary and t.itinerary.stops:
        for stop in t.itinerary.stops:
            if stop.experience_id == experience_id or stop.title == experience_id:
                stop.status = "skipped"
                deleted_title = stop.title

    exp = s.experiences.get(experience_id)
    learned_delta = {}
    if exp:
        from app.models import Feedback
        place = s.places.get(exp.place_id)
        dummy_state = TravelerState(
            lat=place.lat if place else 26.9124,
            lon=place.lon if place else 75.7873,
            window_start=datetime.combine(t.start_date, t.day_start),
            window_end=datetime.combine(t.start_date, t.day_end),
            budget_inr=t.budget_inr,
        )
        fb = Feedback(at=datetime.now(), experience_id=experience_id, kind="reject", reason="not_interested")
        learned_state = learn.learn(dummy_state, exp, fb)
        learned_delta = learned_state.learned

    accounts.add_user_history(user["id"], "stop_deleted", {
        "trip_id": trip_id,
        "experience_id": experience_id,
        "title": deleted_title,
        "learned_delta": learned_delta,
    })

    draft_dict = t.model_dump()
    draft_dict["shortlist"] = shortlist
    t_updated = TripDraft.model_validate(draft_dict)

    new_it = trip_engine.build_itinerary(t_updated, s)
    draft_dict["itinerary"] = new_it.model_dump()
    final_trip = accounts.update_trip(user["id"], trip_id, TripDraft.model_validate(draft_dict)) or t

    changes = [
        f"Removed '{deleted_title}' from itinerary and added to user rejected preferences.",
        "Dynamically replanned itinerary gaps around remaining activities.",
    ]

    return StopDeleteResponse(trip=final_trip, deleted_stop_title=deleted_title, changes=changes)

