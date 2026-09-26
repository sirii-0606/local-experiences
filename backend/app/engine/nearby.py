"""Nearby suggestions engine (P5): meals, quick stops, driver/guide, and group splits.

Pure-Python engine module.
"""
from dataclasses import dataclass
from datetime import date, time

from app.engine.feasibility import (
    group_cost,
    km_between,
    travel_min,
)
from app.models import (
    Itinerary,
    TravelerState,
)
from app.seed import Seed


@dataclass
class MealSuggestion:
    meal_type: str  # "lunch" | "dinner"
    experience_id: str
    title: str
    place_name: str
    price_inr: int
    duration_min: int
    distance_km: float
    travel_min: int
    reason: str


@dataclass
class QuickStopSuggestion:
    experience_id: str
    title: str
    place_name: str
    duration_min: int
    distance_km: float
    reason: str


@dataclass
class GuideSuggestion:
    type: str  # "driver" | "guide"
    title: str
    description: str
    estimated_cost_inr: int
    reason: str


@dataclass
class MoveSuggestion:
    stop_title: str
    experience_id: str
    from_day: date
    to_day: date
    savings_min: int
    reason: str


@dataclass
class SplitSuggestion:
    day: date
    start_time: time
    end_time: time
    rejoin_name: str
    rejoin_place_id: str
    reason: str
    group_a: list[str]  # traveler names
    activity_a: str
    group_b: list[str]  # traveler names
    activity_b: str


def meal_suggestions(
    itinerary: Itinerary, day: date, state: TravelerState, seed: Seed
) -> list[MealSuggestion]:
    """Find food suggestions for lunch (12:30-14:30) and dinner (19:00-21:00) if not planned."""
    day_stops = [s for s in itinerary.stops if s.start.date() == day]

    has_lunch = any(
        s.experience_id
        and s.start.hour in (12, 13, 14)
        and seed.experiences.get(s.experience_id)
        and "food" in seed.experiences[s.experience_id].category
        for s in day_stops
    )
    has_dinner = any(
        s.experience_id
        and s.start.hour in (19, 20, 21)
        and seed.experiences.get(s.experience_id)
        and "food" in seed.experiences[s.experience_id].category
        for s in day_stops
    )

    suggestions: list[MealSuggestion] = []
    food_exps = [
        e
        for e in seed.experiences.values()
        if e.category == "food"
        or "local-food" in e.tags
        or "street-food" in e.tags
        or "sweets" in e.tags
    ]

    ref_lunch_stop = next((s for s in day_stops if s.start.hour in (11, 12, 13, 14)), None)
    ref_lunch_lat = ref_lunch_stop.lat if ref_lunch_stop else state.lat
    ref_lunch_lon = ref_lunch_stop.lon if ref_lunch_stop else state.lon

    if not has_lunch:
        scored_lunch = []
        for e in food_exps:
            place = seed.places[e.place_id]
            dist = km_between(ref_lunch_lat, ref_lunch_lon, place.lat, place.lon)
            t_min = travel_min(dist, state.mode)
            scored_lunch.append((dist, t_min, e, place))
        scored_lunch.sort(key=lambda x: x[0])
        for dist, t_min, e, place in scored_lunch[:2]:
            suggestions.append(
                MealSuggestion(
                    meal_type="lunch",
                    experience_id=e.id,
                    title=e.title,
                    place_name=place.name,
                    price_inr=group_cost(e, len(state.group)),
                    duration_min=e.duration_min,
                    distance_km=round(dist, 1),
                    travel_min=t_min,
                    reason=f"Lunch break: {dist:.1f} km away ({t_min} min ride)",
                )
            )

    if not has_dinner:
        ref_dinner_stop = next((s for s in day_stops if s.start.hour in (17, 18, 19)), None)
        ref_dinner_lat = ref_dinner_stop.lat if ref_dinner_stop else state.lat
        ref_dinner_lon = ref_dinner_stop.lon if ref_dinner_stop else state.lon

        scored_dinner = []
        for e in food_exps:
            place = seed.places[e.place_id]
            dist = km_between(ref_dinner_lat, ref_dinner_lon, place.lat, place.lon)
            t_min = travel_min(dist, state.mode)
            scored_dinner.append((dist, t_min, e, place))
        scored_dinner.sort(key=lambda x: x[0])
        for dist, t_min, e, place in scored_dinner[:2]:
            suggestions.append(
                MealSuggestion(
                    meal_type="dinner",
                    experience_id=e.id,
                    title=e.title,
                    place_name=place.name,
                    price_inr=group_cost(e, len(state.group)),
                    duration_min=e.duration_min,
                    distance_km=round(dist, 1),
                    travel_min=t_min,
                    reason=f"Evening dinner: {dist:.1f} km from evening stop",
                )
            )

    return suggestions


def quick_stops(
    itinerary: Itinerary, state: TravelerState, seed: Seed
) -> list[QuickStopSuggestion]:
    """Find short (≤45 min) stops within 1.2 km of scheduled stops."""
    scheduled_ids = {s.experience_id for s in itinerary.stops if s.experience_id}
    out: list[QuickStopSuggestion] = []

    for s in itinerary.stops:
        if not s.experience_id:
            continue
        for e in seed.experiences.values():
            if e.id in scheduled_ids or e.duration_min > 45:
                continue
            place = seed.places[e.place_id]
            dist = km_between(s.lat, s.lon, place.lat, place.lon)
            if dist <= 1.2:
                out.append(
                    QuickStopSuggestion(
                        experience_id=e.id,
                        title=e.title,
                        place_name=place.name,
                        duration_min=e.duration_min,
                        distance_km=round(dist, 1),
                        reason=f"Near {s.title} ({dist:.1f} km, {e.duration_min}m visit)",
                    )
                )

    seen = set()
    unique = []
    for q in out:
        if q.experience_id not in seen:
            seen.add(q.experience_id)
            unique.append(q)
    return unique[:4]


def guide_driver_suggestions(trip, itinerary: Itinerary, seed: Seed) -> list[GuideSuggestion]:
    """Suggest private driver or local guide based on group size and activity density."""
    group_size = len(trip.travelers) if hasattr(trip, "travelers") else 1
    has_seniors = any(t.age and t.age >= 65 for t in getattr(trip, "travelers", []))
    has_access = any(bool(t.accessibility) for t in getattr(trip, "travelers", []))

    suggestions: list[GuideSuggestion] = []

    if group_size >= 4 or has_seniors or has_access or len(itinerary.stops) >= 5:
        suggestions.append(
            GuideSuggestion(
                type="driver",
                title="Dedicated AC Cab & Driver for Jaipur",
                description="Point-to-point transit across forts, bazaars and stays.",
                estimated_cost_inr=2200 * max(1, (trip.end_date - trip.start_date).days + 1),
                reason=(
                    f"Recommended for your group of {group_size}"
                    + (" with seniors/access needs" if has_seniors or has_access else "")
                    + " to avoid cab wait times."
                ),
            )
        )

    heritage_stops = [
        s
        for s in itinerary.stops
        if s.experience_id
        and seed.experiences.get(s.experience_id)
        and (
            "heritage" in seed.experiences[s.experience_id].tags
            or "history" in seed.experiences[s.experience_id].tags
        )
    ]
    if len(heritage_stops) >= 2:
        suggestions.append(
            GuideSuggestion(
                type="guide",
                title="Licensed Heritage Storyteller Guide",
                description="Government-certified local historian guiding through heritage sites.",
                estimated_cost_inr=1500,
                reason=f"Certified historical context for {len(heritage_stops)} planned monuments.",
            )
        )

    return suggestions


def auto_suggest_splits(trip, seed: Seed) -> list[SplitSuggestion]:
    """Suggest group split when group members have divergent interest clusters."""
    travelers = getattr(trip, "travelers", [])
    if len(travelers) < 2:
        return []

    kids = [t.name for t in travelers if t.age is not None and t.age < 16]
    adults = [t.name for t in travelers if t.age is None or t.age >= 16]

    suggestions: list[SplitSuggestion] = []

    if kids and adults:
        suggestions.append(
            SplitSuggestion(
                day=trip.start_date,
                start_time=time(14, 0),
                end_time=time(16, 30),
                rejoin_name="Masala Chowk (Ram Niwas Bagh)",
                rejoin_place_id="pl-masala-chowk",
                reason="Kids enjoy hands-on crafts/kites while adults explore Amer Fort.",
                group_a=kids,
                activity_a="Lac Bangle & Kite-Making Workshop",
                group_b=adults,
                activity_b="Amer Fort Guided Walk & Palace View",
            )
        )

    return suggestions
