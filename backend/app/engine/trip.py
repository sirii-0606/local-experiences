"""Multi-day scoring, candidate ranking, stays, and itinerary building (P4-P5).

Pure-Python engine module. Builds upon feasibility, rank, and itinerary.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.engine.feasibility import (
    earliest_start,
    group_cost,
    km_between,
    travel_min,
    travel_times_by_mode,
)
from app.engine.rank import discover
from app.models import (
    Experience,
    Itinerary,
    Stay,
    Stop,
    Traveler,
    TravelerState,
)
from app.seed import Seed

DEFAULT_PLACE_ID = "pl-hawa-mahal"
DEFAULT_LAT = 26.9239
DEFAULT_LON = 75.8267


@dataclass
class Candidate:
    experience_id: str
    title: str
    score: float
    reasons: list[str]
    travel_by_mode: dict[str, int]
    duration_min: int
    cost_inr: int
    feasible_days: list[int]  # 0-indexed day numbers
    must_see: bool
    along_route: float
    experience: Experience


@dataclass
class StayRecommendation:
    stay: Stay
    score: float
    distance_to_picks_km: float
    travel_to_centroid_min: int
    reasons: list[str]


def _trip_group(trip) -> list[Traveler]:
    out = []
    for t in trip.travelers:
        out.append(
            Traveler(
                name=t.name,
                age=t.age if t.age is not None else 30,
                interests=list(t.interests),
                accessibility=list(t.accessibility),
            )
        )
    return out or [Traveler()]


def _origin_coordinates(trip, seed: Seed) -> tuple[float, float]:
    if trip.stay_id and trip.stay_id in seed.stays:
        stay = seed.stays[trip.stay_id]
        return stay.lat, stay.lon
    if trip.stay.area:
        area_low = trip.stay.area.lower()
        for p in seed.places.values():
            if area_low in p.neighbourhood.lower() or area_low in p.name.lower():
                return p.lat, p.lon
    def_place = seed.places.get(DEFAULT_PLACE_ID)
    if def_place:
        return def_place.lat, def_place.lon
    return DEFAULT_LAT, DEFAULT_LON


def _point_to_segment_km(
    px: float, py: float, x1: float, y1: float, x2: float, y2: float
) -> float:
    """Approximate distance in km from point P to line segment (A -> B)."""
    dx = x2 - x1
    dy = y2 - y1
    if dx == 0 and dy == 0:
        return km_between(px, py, x1, y1)
    t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    proj_x = x1 + t * dx
    proj_y = y1 + t * dy
    return km_between(px, py, proj_x, proj_y)


def score_candidates(trip, seed: Seed) -> list[Candidate]:
    """Score all experiences across the trip days and compute travel times by mode (P4)."""
    num_days = max(1, (trip.end_date - trip.start_date).days + 1)
    origin_lat, origin_lon = _origin_coordinates(trip, seed)
    group = _trip_group(trip)
    daily_budget = max(500, trip.budget_inr // num_days)

    must_see_set = set(trip.must_see)
    must_see_coords = []
    for ms_id in trip.must_see:
        if ms_id in seed.experiences:
            pl = seed.places.get(seed.experiences[ms_id].place_id)
            if pl:
                must_see_coords.append((pl.lat, pl.lon))

    candidates: list[Candidate] = []

    for exp_id, exp in seed.experiences.items():
        place = seed.places[exp.place_id]
        dist_from_origin = km_between(origin_lat, origin_lon, place.lat, place.lon)
        travel_modes = travel_times_by_mode(dist_from_origin)
        cost = group_cost(exp, len(group))

        min_seg_dist = dist_from_origin
        for ms_lat, ms_lon in must_see_coords:
            seg_dist = _point_to_segment_km(
                place.lat, place.lon, origin_lat, origin_lon, ms_lat, ms_lon
            )
            if seg_dist < min_seg_dist:
                min_seg_dist = seg_dist

        along_route_bonus = max(0.0, 1.0 - (min_seg_dist / 6.0)) if must_see_coords else 0.5

        feasible_days: list[int] = []
        day_scores: list[float] = []
        collected_reasons: list[str] = []

        for d_idx in range(num_days):
            day_date = trip.start_date + timedelta(days=d_idx)
            day_start_dt = datetime.combine(day_date, trip.day_start)
            day_end_dt = datetime.combine(day_date, trip.day_end)

            day_state = TravelerState(
                lat=origin_lat,
                lon=origin_lon,
                end_lat=origin_lat,
                end_lon=origin_lon,
                window_start=day_start_dt,
                window_end=day_end_dt,
                budget_inr=daily_budget,
                group=group,
                mode=getattr(trip, "mode", "auto") if hasattr(trip, "mode") else "auto",
                pace=getattr(trip, "pace", "normal") if hasattr(trip, "pace") else "normal",
            )

            recs, _ = discover(day_state, seed, k=50)
            rec = next((r for r in recs if r.experience_id == exp_id), None)
            if rec is not None:
                feasible_days.append(d_idx)
                day_scores.append(rec.score)
                if not collected_reasons:
                    collected_reasons = list(rec.reasons)

        if not feasible_days:
            for d_idx in range(num_days):
                day_date = trip.start_date + timedelta(days=d_idx)
                start_dt = datetime.combine(day_date, trip.day_start)
                if earliest_start(exp, start_dt) is not None:
                    feasible_days.append(d_idx)
                    day_scores.append(0.5)

        if feasible_days:
            base_score = sum(day_scores) / len(day_scores)
            is_ms = exp_id in must_see_set
            ms_bonus = 0.35 if is_ms else 0.0
            route_bonus = 0.15 * along_route_bonus

            total_score = round(min(1.0, base_score * 0.5 + ms_bonus + route_bonus), 3)

            reasons = list(collected_reasons)
            if is_ms:
                reasons.insert(0, "Pinned as must-see")
            if min_seg_dist < 1.5 and must_see_coords and not is_ms:
                reasons.append(f"Near route ({min_seg_dist:.1f} km from main path)")

            candidates.append(
                Candidate(
                    experience_id=exp_id,
                    title=exp.title,
                    score=total_score,
                    reasons=reasons[:3],
                    travel_by_mode=travel_modes,
                    duration_min=exp.duration_min,
                    cost_inr=cost,
                    feasible_days=feasible_days,
                    must_see=is_ms,
                    along_route=round(along_route_bonus, 2),
                    experience=exp,
                )
            )

    candidates.sort(key=lambda c: (not c.must_see, -c.score))
    return candidates


def score_stays(
    trip, seed: Seed, in_person_exp_ids: list[str]
) -> list[StayRecommendation]:
    """Score all stays in seed against shortlist centroid, budget, and accessibility (P4)."""
    lats, lons = [], []
    for eid in in_person_exp_ids:
        if eid in seed.experiences:
            p = seed.places.get(seed.experiences[eid].place_id)
            if p:
                lats.append(p.lat)
                lons.append(p.lon)

    if not lats:
        for ms_id in trip.must_see:
            if ms_id in seed.experiences:
                p = seed.places.get(seed.experiences[ms_id].place_id)
                if p:
                    lats.append(p.lat)
                    lons.append(p.lon)

    if lats:
        centroid_lat = sum(lats) / len(lats)
        centroid_lon = sum(lons) / len(lons)
    else:
        centroid_lat, centroid_lon = DEFAULT_LAT, DEFAULT_LON

    group = _trip_group(trip)
    access_needs = {a for t in group for a in t.accessibility}

    recommendations: list[StayRecommendation] = []

    for stay in seed.stays.values():
        dist_km = km_between(stay.lat, stay.lon, centroid_lat, centroid_lon)
        travel_min_auto = travel_min(dist_km, "auto")

        if trip.stay.max_per_night_inr:
            if stay.price_per_night_inr <= trip.stay.max_per_night_inr:
                price_fit = 1.0
            else:
                over = stay.price_per_night_inr - trip.stay.max_per_night_inr
                price_fit = max(0.1, 1.0 - (over / trip.stay.max_per_night_inr))
        else:
            price_fit = 1.0 if stay.price_per_night_inr <= 5000 else 0.7

        type_fit = 1.0 if (trip.stay.type == "any" or stay.type == trip.stay.type) else 0.5
        access_fit = (
            1.0 if (not access_needs or access_needs.issubset(set(stay.accessibility))) else 0.3
        )
        distance_score = max(0.0, 1.0 - (dist_km / 10.0))

        score = (
            0.40 * distance_score
            + 0.25 * price_fit
            + 0.15 * type_fit
            + 0.15 * access_fit
            + 0.05 * (stay.rating / 5.0)
        )

        reasons = []
        if dist_km <= 2.5:
            reasons.append(f"Central location: {dist_km:.1f} km from chosen activities")
        else:
            reasons.append(f"{dist_km:.1f} km from activities ({travel_min_auto} min ride)")
        if trip.stay.max_per_night_inr and stay.price_per_night_inr <= trip.stay.max_per_night_inr:
            reasons.append(f"Within your ₹{trip.stay.max_per_night_inr}/night budget")
        if access_needs and access_needs.issubset(set(stay.accessibility)):
            reasons.append("Matches accessibility requirements")
        if stay.rating >= 4.7:
            reasons.append(f"Top rating: {stay.rating}★ ({stay.review_count} reviews)")

        recommendations.append(
            StayRecommendation(
                stay=stay,
                score=round(score, 3),
                distance_to_picks_km=round(dist_km, 2),
                travel_to_centroid_min=travel_min_auto,
                reasons=reasons[:3],
            )
        )

    recommendations.sort(key=lambda r: -r.score)
    return recommendations


def build_itinerary(trip, seed: Seed) -> Itinerary:
    """Generate a validated multi-day itinerary starting & ending at the stay each day (P5)."""
    num_days = max(1, (trip.end_date - trip.start_date).days + 1)
    origin_lat, origin_lon = _origin_coordinates(trip, seed)
    group = _trip_group(trip)
    group_size = len(group) if group else 1
    mode = getattr(trip, "mode", "auto") if hasattr(trip, "mode") else "auto"

    # 1. Gather shortlisted in-person IDs
    in_person_ids = [
        eid for eid, decision in getattr(trip, "shortlist", {}).items()
        if decision == "in_person" and eid in seed.experiences
    ]
    if not in_person_ids:
        in_person_ids = [eid for eid in trip.must_see if eid in seed.experiences]
    if not in_person_ids:
        candidates = score_candidates(trip, seed)
        in_person_ids = [c.experience_id for c in candidates[: min(num_days * 3, 10)]]

    # Order activities by must-see priority and spatial proximity to stay
    must_see_set = set(trip.must_see)
    def sort_key(eid):
        exp = seed.experiences[eid]
        place = seed.places[exp.place_id]
        dist = km_between(origin_lat, origin_lon, place.lat, place.lon)
        return (eid not in must_see_set, dist)

    ordered_eids = sorted(in_person_ids, key=sort_key)

    # Balanced target of activities per day (2-3 per day)
    remainder = 1 if len(ordered_eids) % num_days else 0
    per_day_target = min(4, max(1, len(ordered_eids) // num_days + remainder))

    all_stops: list[Stop] = []
    remaining_eids = list(ordered_eids)

    for d_idx in range(num_days):
        day_date = trip.start_date + timedelta(days=d_idx)
        day_start_dt = datetime.combine(day_date, trip.day_start)
        day_end_dt = datetime.combine(day_date, trip.day_end)

        curr_time = day_start_dt
        curr_lat, curr_lon = origin_lat, origin_lon
        day_count = 0

        to_remove = []
        for eid in remaining_eids:
            if day_count >= per_day_target:
                break
            exp = seed.experiences[eid]
            place = seed.places[exp.place_id]

            t_min = travel_min(km_between(curr_lat, curr_lon, place.lat, place.lon), mode)
            reach_time = curr_time + timedelta(minutes=t_min)

            valid_start = earliest_start(exp, reach_time)
            if valid_start is None:
                continue

            dur_min = exp.duration_min
            end_time = valid_start + timedelta(minutes=dur_min)

            back_min = travel_min(km_between(place.lat, place.lon, origin_lat, origin_lon), mode)
            if end_time + timedelta(minutes=back_min) > day_end_dt:
                continue

            all_stops.append(
                Stop(
                    title=exp.title,
                    experience_id=exp.id,
                    lat=place.lat,
                    lon=place.lon,
                    start=valid_start,
                    end=end_time,
                    cost_inr=group_cost(exp, group_size),
                    status="proposed",
                )
            )
            curr_time = end_time
            curr_lat, curr_lon = place.lat, place.lon
            day_count += 1
            to_remove.append(eid)

        for eid in to_remove:
            remaining_eids.remove(eid)

    return Itinerary(stops=all_stops, splits=getattr(trip, "splits", []))
