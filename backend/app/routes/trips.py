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
    in_person_ids = [eid for eid, dec in t.shortlist.items() if dec == "in_person"]
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


@router.post("/{trip_id}/simulate-weather")
def simulate_trip_weather(
    trip_id: int,
    payload: dict,
    user: dict = Depends(current_user),
) -> dict:
    from app.engine import trip as trip_engine
    from app.main import seed
    from app.simulation import SimulationScenario, run_digital_twin_simulation

    s = seed()
    t = _found(accounts.get_trip(user["id"], trip_id))

    scenario_data = payload.get("scenario")
    if scenario_data:
        sc = SimulationScenario.model_validate(scenario_data)
    else:
        weather_cond = payload.get("weather", "rain")
        if weather_cond == "heat":
            sc = SimulationScenario(
                name="Extreme Heatwave (43.8°C)",
                temp_c=43.8,
                rain_intensity_mm_h=0.0,
                duration_hours=4.0,
                epicenter_lat=26.9247,
                epicenter_lon=75.8245,
                epicenter_name="Jantar Mantar Stone Observatories",
                radius_km=5.0,
                wind_kmh=18.0,
            )
        elif weather_cond == "clear":
            sc = SimulationScenario(
                name="Pleasant Autumn Evening (24.0°C)",
                temp_c=24.0,
                rain_intensity_mm_h=0.0,
                duration_hours=3.0,
                epicenter_lat=26.9378,
                epicenter_lon=75.8155,
                epicenter_name="Nahargarh Ridge",
                radius_km=4.0,
                wind_kmh=12.0,
            )
        else:
            sc = SimulationScenario(
                name="Sudden Cloudburst (35 mm/h)",
                temp_c=29.5,
                rain_intensity_mm_h=35.0,
                duration_hours=2.5,
                epicenter_lat=26.9239,
                epicenter_lon=75.8267,
                epicenter_name="Old Walled City",
                radius_km=3.8,
                wind_kmh=32.0,
            )

    sim_cond = (
        "rain" if sc.rain_intensity_mm_h >= 1.0 else ("heat" if sc.temp_c >= 38.0 else "clear")
    )

    draft_dict = t.model_dump()
    draft_dict["weather"] = sim_cond
    draft_dict["weather_scenario_name"] = sc.name
    draft_dict["weather_temp_c"] = sc.temp_c
    draft_dict["weather_rain_mm_h"] = sc.rain_intensity_mm_h

    adapted_trip = TripDraft.model_validate(draft_dict)
    it = trip_engine.build_itinerary(adapted_trip, s)
    draft_dict["itinerary"] = it.model_dump()

    saved = accounts.update_trip(user["id"], trip_id, TripDraft.model_validate(draft_dict))

    origin_lat, origin_lon = trip_engine._origin_coordinates(adapted_trip, s)
    state = TravelerState(
        lat=origin_lat,
        lon=origin_lon,
        window_start=datetime.combine(t.start_date, t.day_start),
        window_end=datetime.combine(t.start_date, t.day_end),
        budget_inr=t.budget_inr,
        group=trip_engine._trip_group(t),
        weather=sim_cond,
    )
    sim_res = run_digital_twin_simulation(sc, state, it, s)

    return {
        "trip": _found(saved),
        "simulation": sim_res,
    }
