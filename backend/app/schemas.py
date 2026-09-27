"""Contract for the v2 website endpoints (accounts, profile, admin, trips).

Contract-first: the frontend builds against these shapes (mirrored in frontend/src/types.ts,
mocked in frontend/src/mocks/) while the backend behind them is still evolving.
The OpenAPI snapshot in docs/openapi.json is checked by tests/test_contract.py.
"""

import re
from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models import Access, Itinerary, Tag

Role = Literal["traveler", "provider", "admin"]
Diet = Literal["vegetarian", "non_vegetarian", "vegan", "jain"]
Mode = Literal["walk", "auto", "bus", "car"]
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _email(v: str) -> str:
    v = v.strip().lower()
    if len(v) > 254 or not EMAIL_RE.match(v):
        raise ValueError("enter a valid email address")
    return v


class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=60)
    _norm = field_validator("email")(_email)


class LoginRequest(BaseModel):
    email: str
    password: str = Field(max_length=128)
    _norm = field_validator("email")(_email)


class User(BaseModel):
    id: int
    email: str
    role: Role
    display_name: str
    created: datetime
    onboarded: bool  # has saved a profile (P2 onboarding)


class Companion(BaseModel):
    """A person the user often travels with; reused when planning trips (P3)."""

    name: str = Field(min_length=1, max_length=60)
    age: int | None = Field(default=None, ge=0, le=110)
    interests: list[Tag] = []
    dislikes: list[Tag] = []
    accessibility: list[Access] = []
    diet: Diet | None = None


class Profile(BaseModel):
    """Everything used to personalise recommendations. All optional except the name.
    Sensitive fields (age, accessibility, diet) are owner-only: never shown to admins/providers."""

    display_name: str = Field(min_length=1, max_length=60)
    age: int | None = Field(default=None, ge=0, le=110)
    home_city: str | None = Field(default=None, max_length=60)
    interests: list[Tag] = []
    dislikes: list[Tag] = []
    accessibility: list[Access] = []
    walking_limit_km: float | None = Field(default=None, ge=0, le=50)
    needs_rest_breaks: bool = False
    diet: Diet | None = None
    pace: Literal["relaxed", "normal", "packed"] = "normal"
    budget_style: Literal["budget", "mid", "premium"] | None = None
    transport: list[Mode] = []
    languages: list[str] = Field(default=[], max_length=10)
    companions: list[Companion] = Field(default=[], max_length=20)
    avoid_crowds: bool = False
    hidden_gems: bool = False  # prefers little-known local places over famous ones


class PasswordChange(BaseModel):
    current_password: str = Field(max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class DeleteAccount(BaseModel):
    password: str = Field(max_length=128)  # re-confirm: deleting is permanent


class AdminUserRow(BaseModel):
    """What an admin may see about a user: account facts only, never profile data."""

    id: int
    email: str
    role: Role
    display_name: str
    disabled: bool
    created: datetime
    last_login: datetime | None


class AdminUserPatch(BaseModel):
    role: Role | None = None
    disabled: bool | None = None
    temp_password: str | None = Field(default=None, min_length=8, max_length=128)


class AdminStats(BaseModel):
    users: int
    admins: int
    providers: int
    disabled: int
    active_sessions: int
    provider_listings: int


# ---------------------------------------------------------------- trips (P3)
MAX_TRIP_DAYS = 7


class TripTraveler(Companion):
    """One person on a trip. `is_me` marks the account owner (their profile can fill it in)."""

    is_me: bool = False


class StayPref(BaseModel):
    type: Literal["any", "hotel", "homestay", "hostel"] = "any"
    max_per_night_inr: int | None = Field(default=None, ge=0, le=500_000)
    area: str | None = Field(default=None, max_length=60)  # None = near the must-sees


class Stay(BaseModel):
    id: str
    name: str
    type: Literal["hotel", "homestay", "hostel"]
    area: str
    lat: float
    lon: float
    price_per_night_inr: int
    rating: float = 4.5
    review_count: int = 0
    accessibility: list[Access] = []
    description: str = ""
    phone: str = ""
    website: str = ""
    sample_contact: bool = True


class Candidate(BaseModel):
    experience_id: str
    title: str
    score: float
    reasons: list[str] = []
    travel_by_mode: dict[str, int] = {}
    duration_min: int
    cost_inr: int
    feasible_days: list[int] = []
    must_see: bool = False
    along_route: float = 0.0
    outdoor_convenience_heat: float = 0.5
    outdoor_convenience_rain: float = 0.5


class StayRecommendation(BaseModel):
    stay: Stay
    score: float
    distance_to_picks_km: float
    travel_to_centroid_min: int
    reasons: list[str] = []


class MealSuggestion(BaseModel):
    meal_type: str
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


class QuickStopSuggestion(BaseModel):
    experience_id: str
    title: str
    place_name: str
    duration_min: int
    distance_km: float
    reason: str


class GuideSuggestion(BaseModel):
    type: str
    title: str
    description: str
    estimated_cost_inr: int
    reason: str
    phone: str = ""
    rating: float = 4.9
    languages: str = ""
    contact_name: str = ""


class SplitSuggestion(BaseModel):
    day: date
    start_time: time
    end_time: time
    rejoin_name: str
    rejoin_place_id: str
    reason: str
    group_a: list[str] = []
    activity_a: str
    group_b: list[str] = []
    activity_b: str


class TripSuggestions(BaseModel):
    meals: list[MealSuggestion] = []
    quick_stops: list[QuickStopSuggestion] = []
    guides: list[GuideSuggestion] = []
    splits: list[SplitSuggestion] = []


ShortlistDecision = Literal["in_person", "ar", "skip"]


class TripDraft(BaseModel):
    """What the "Plan a trip" wizard collects. Shortlist, stay pick, itinerary, splits and
    feedback are added as optional fields in P4-P6, so drafts saved now stay valid."""

    title: str = Field(min_length=1, max_length=80)
    destination: Literal["jaipur"] = "jaipur"  # the only city with data; others "coming soon"
    origin_city: str | None = Field(default=None, max_length=60)
    start_date: date
    end_date: date
    day_start: time = time(9, 30)
    day_end: time = time(20, 30)
    budget_inr: int = Field(ge=0, le=10_000_000)  # total for the whole trip and group
    stay: StayPref = StayPref()
    travelers: list[TripTraveler] = Field(min_length=1, max_length=12)
    use_my_prefs_for_all: bool = False
    must_see: list[str] = Field(default=[], max_length=20)  # experience ids
    shortlist: dict[str, ShortlistDecision] = Field(default_factory=dict)
    stay_id: str | None = None
    itinerary: Itinerary | None = None
    weather: Literal["clear", "rain", "heat"] | str | None = "clear"
    weather_scenario_name: str | None = None
    weather_temp_c: float | None = None
    weather_rain_mm_h: float | None = None

    @model_validator(mode="after")
    def _dates(self) -> "TripDraft":
        if self.end_date < self.start_date:
            raise ValueError("the trip can't end before it starts")
        if (self.end_date - self.start_date).days >= MAX_TRIP_DAYS:
            raise ValueError(f"trips can be at most {MAX_TRIP_DAYS} days")
        if self.day_end <= self.day_start:
            raise ValueError("each day must end after it starts")
        return self


class Trip(TripDraft):
    id: int
    created: datetime
    updated: datetime


# ---------------------------------------------------------------- onboarding + profile context


class Question(BaseModel):
    """One onboarding question. `id` is the Profile field the answer is saved to."""

    id: str
    text: str
    kind: Literal["number", "text", "single", "multi", "bool", "companions"]
    options: list[str] = []
    max_choices: int | None = None
    why: str  # shown to the traveler: what we use the answer for


class ContextEntry(BaseModel):
    tag: Tag
    weight: float = Field(ge=-1, le=1)  # -1 = avoid, +1 = loves it
    source: str  # onboarding / chat / feedback / import / trips
    updated: datetime | None = None


class ProfileContext(BaseModel):
    """What the planner has learned about the traveler, visible and correctable (doc §12.2)."""

    entries: list[ContextEntry] = []  # stored: from chats, feedback, imported itineraries
    from_trips: list[ContextEntry] = []  # derived on the fly from saved trips
    summary: str = ""  # the text the assistant is given as background


class ContextImport(BaseModel):
    """A past itinerary or trip notes, in the traveler's words."""

    text: str = Field(min_length=3, max_length=4000)


# ---------------------------------------------------------------- chat context + calendar


class WeatherNow(BaseModel):
    available: bool
    condition: str | None = None  # "rain" | "heat" | "clear"
    temp_c: float | None = None
    rain_chance: int | None = None
    applied: bool = False  # true when it changed what's feasible (rain rules out outdoors)


class ClosedNow(BaseModel):
    """A good match that can't happen in this window, and when it next can."""

    experience_id: str
    title: str
    why: str
    next_open: datetime | None = None
    hours_confirmed: bool = False  # False = typical hours for this kind of place


class ChatContext(BaseModel):
    location: str  # human-readable, e.g. "Pune" or "Hawa Mahal"
    location_source: Literal["text", "device", "previous", "profile", "default"]
    lat: float
    lon: float
    data_source: str  # "curated", "curated+wikidata", "wikipedia", ...
    places_considered: int
    weather: WeatherNow
    traffic: str
    closed_now: list[ClosedNow] = []
    assumptions: list[str] = []  # what we assumed; the traveler can correct any of it
    profile_used: bool = False


class CalendarEvent(BaseModel):
    title: str
    start: datetime
    end: datetime
    remind_min: int  # minutes before start: travel time from the previous stop + 15
    reminder: str
    google_url: str  # one-click "add to Google Calendar"


class CalendarExport(BaseModel):
    ics: str  # import into Google/Apple/Outlook calendar; carries the reminders
    events: list[CalendarEvent]
