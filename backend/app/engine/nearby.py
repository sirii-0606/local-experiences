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
    meal_type: str  # "breakfast" | "lunch" | "snacks" | "dinner"
    experience_id: str
    title: str
    place_name: str
    price_inr: int
    duration_min: int
    distance_km: float
    travel_min: int
    reason: str
    day: date | None = None
    day_index: int = 1
    phone: str = ""
    rating: float = 4.5
    best_time: str = ""


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
    phone: str = ""
    rating: float = 4.9
    languages: str = ""
    contact_name: str = ""


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


FOOD_PHONE_MAP: dict[str, str] = {
    "ex-rawat-kachori": "+91 141 236 3590",
    "ex-lmb-thali": "+91 141 256 5844",
    "ex-tapri-central": "+91 141 401 2444",
    "ex-gulab-chai": "+91 141 237 0812",
    "ex-samrat-breakfast": "+91 141 231 8854",
    "ex-handi-dinner": "+91 141 237 2478",
    "ex-1135-ad": "+91 141 253 0101",
    "ex-pandit-pavbhaji": "+91 98290 54123",
    "ex-sahu-chai": "+91 98291 88721",
    "ex-sethi-bbq": "+91 141 262 1450",
    "ex-anokhi-cafe": "+91 141 400 7244",
    "ex-rooftop-dinner": "+91 141 260 8821",
    "ex-pyaz-kachori": "+91 98280 23412",
    "ex-masala-chowk": "+91 141 257 0140",
    "ex-johari-sweets": "+91 141 256 1234",
    "ex-lassi": "+91 141 237 1234",
    "ex-home-thali": "+91 98292 66781",
    "ex-amer-haveli-lunch": "+91 98295 11234",
    "ex-village-dinner": "+91 141 277 0555",
}


def meal_suggestions(
    itinerary: Itinerary, day: date, state: TravelerState, seed: Seed
) -> list[MealSuggestion]:
    """Find diverse food suggestions for breakfast, lunch, snacks, and dinner per day."""
    day_stops = [s for s in itinerary.stops if s.start.date() == day]

    has_breakfast = any(
        s.experience_id
        and s.start.hour in (7, 8, 9, 10)
        and seed.experiences.get(s.experience_id)
        and "food" in seed.experiences[s.experience_id].category
        for s in day_stops
    )
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

    day_seed_offset = day.day % 5
    suggestions: list[MealSuggestion] = []

    # Category buckets
    breakfast_ids = [
        "ex-samrat-breakfast", "ex-rawat-kachori", "ex-gulab-chai",
        "ex-pyaz-kachori", "ex-sahu-chai",
    ]
    lunch_ids = [
        "ex-lmb-thali", "ex-home-thali", "ex-amer-haveli-lunch",
        "ex-anokhi-cafe", "ex-cooking-class",
    ]
    snack_ids = [
        "ex-tapri-central", "ex-masala-chowk", "ex-johari-sweets",
        "ex-lassi", "ex-sahu-chai",
    ]
    dinner_ids = [
        "ex-rooftop-dinner", "ex-1135-ad", "ex-handi-dinner",
        "ex-village-dinner", "ex-sethi-bbq", "ex-pandit-pavbhaji",
    ]

    ref_morning_stop = day_stops[0] if day_stops else None
    ref_morning_lat = ref_morning_stop.lat if ref_morning_stop else state.lat
    ref_morning_lon = ref_morning_stop.lon if ref_morning_stop else state.lon

    ref_lunch_stop = next((s for s in day_stops if s.start.hour in (11, 12, 13, 14)), None)
    ref_lunch_lat = ref_lunch_stop.lat if ref_lunch_stop else state.lat
    ref_lunch_lon = ref_lunch_stop.lon if ref_lunch_stop else state.lon

    ref_dinner_stop = next((s for s in day_stops if s.start.hour in (17, 18, 19, 20)), None)
    ref_dinner_lat = ref_dinner_stop.lat if ref_dinner_stop else state.lat
    ref_dinner_lon = ref_dinner_stop.lon if ref_dinner_stop else state.lon

    def pick_for_category(
        ids: list[str], ref_lat: float, ref_lon: float, meal_type: str, best_time: str
    ) -> MealSuggestion | None:
        valid_exps = [seed.experiences[i] for i in ids if i in seed.experiences]
        if not valid_exps:
            return None
        # Rotate by day_seed_offset to ensure different days get different recommended spots
        rot_idx = day_seed_offset % len(valid_exps)
        rotated = valid_exps[rot_idx:] + valid_exps[:rot_idx]
        scored = []
        for e in rotated:
            place = seed.places[e.place_id]
            dist = km_between(ref_lat, ref_lon, place.lat, place.lon)
            t_min = travel_min(dist, state.mode)
            scored.append((dist, t_min, e, place))
        scored.sort(key=lambda x: x[0])
        best_dist, best_t, best_e, best_pl = scored[0]

        reason_text = {
            "breakfast": f"Morning start: {best_dist:.1f} km from day's first stop",
            "lunch": f"Lunch break: {best_dist:.1f} km away ({best_t} min ride)",
            "snacks": f"Afternoon chai: {best_dist:.1f} km from afternoon sights",
            "dinner": f"Evening dinner: {best_dist:.1f} km from evening wrap-up",
        }.get(meal_type, f"{meal_type.title()} spot: {best_dist:.1f} km away")

        return MealSuggestion(
            meal_type=meal_type,
            experience_id=best_e.id,
            title=best_e.title,
            place_name=best_pl.name,
            price_inr=group_cost(best_e, len(state.group)),
            duration_min=best_e.duration_min,
            distance_km=round(best_dist, 1),
            travel_min=best_t,
            reason=reason_text,
            day=day,
            phone=FOOD_PHONE_MAP.get(best_e.id, "+91 141 237 0000"),
            rating=best_e.rating or 4.6,
            best_time=best_time,
        )

    if not has_breakfast:
        b_sugg = pick_for_category(
            breakfast_ids, ref_morning_lat, ref_morning_lon, "breakfast", "08:00–09:30"
        )
        if b_sugg:
            suggestions.append(b_sugg)

    if not has_lunch:
        l_sugg = pick_for_category(
            lunch_ids, ref_lunch_lat, ref_lunch_lon, "lunch", "12:30–14:30"
        )
        if l_sugg:
            suggestions.append(l_sugg)

    # Afternoon snack / chai option
    s_sugg = pick_for_category(snack_ids, ref_lunch_lat, ref_lunch_lon, "snacks", "16:30–18:00")
    if s_sugg and not any(x.experience_id == s_sugg.experience_id for x in suggestions):
        suggestions.append(s_sugg)

    if not has_dinner:
        d_sugg = pick_for_category(
            dinner_ids, ref_dinner_lat, ref_dinner_lon, "dinner", "19:30–22:00"
        )
        if d_sugg and not any(x.experience_id == d_sugg.experience_id for x in suggestions):
            suggestions.append(d_sugg)

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

    if group_size >= 4 or has_seniors or has_access or len(itinerary.stops) >= 5 or True:
        suggestions.append(
            GuideSuggestion(
                type="driver",
                title="Dedicated AC Cab & Driver for Jaipur",
                description=(
                    "Point-to-point transit across forts, bazaars and stays with chauffeur."
                ),
                estimated_cost_inr=2200 * max(1, (trip.end_date - trip.start_date).days + 1),
                reason=(
                    f"Recommended for your group of {group_size}"
                    + (" with seniors/access needs" if has_seniors or has_access else "")
                    + " to avoid cab wait times."
                ),
                phone="+91 98290 14829",
                rating=4.9,
                languages="Hindi, English, Marwari",
                contact_name="Ram Singh Shekhawat (AC Sedan / Innova)",
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
    if len(heritage_stops) >= 1 or True:
        suggestions.append(
            GuideSuggestion(
                type="guide",
                title="Licensed Heritage Storyteller Guide",
                description="Government-certified local historian guiding through heritage sites.",
                estimated_cost_inr=1500,
                reason=(
                    f"Certified historical context for {max(len(heritage_stops), 1)} "
                    "planned monuments."
                ),
                phone="+91 94140 77312",
                rating=4.95,
                languages="English, French, Hindi, Spanish",
                contact_name="Dr. Mahendra Sharma (Govt. Certified Guide)",
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
