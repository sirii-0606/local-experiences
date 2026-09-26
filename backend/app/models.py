"""Domain models — the shared vocabulary from ideation doc §4.1 / §14.

Profile (Traveler) is kept separate from situation (TravelerState), per doc §5.1.
Confidence is derived from Evidence in the engine, not stored.
"""
from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, Field

Category = Literal[
    "food", "culture", "art", "learning", "adventure", "shopping",
    "nightlife", "wellness", "community", "nature",
]
# Closed vocabulary shared by experience tags and traveler intents/interests,
# so intent parsing (rule-based or LLM) maps onto exactly these.
Tag = Literal[
    "local-food", "street-food", "fine-dining", "vegetarian", "sweets", "chai",
    "heritage", "history", "architecture", "museum", "spiritual",
    "craft", "art", "music", "dance", "performance", "workshop", "hands-on",
    "shopping", "market", "textiles", "jewellery",
    "nature", "wildlife", "sunset", "sunrise", "viewpoint", "photography",
    "adventure", "active", "wellness", "relaxed",
    "nightlife", "evening", "social", "romantic",
    "family", "kids", "learning", "community", "walking-tour",
    "hidden-gem", "iconic",
]
Access = Literal["wheelchair", "step_free", "seating", "quiet"]
Weekday = Literal[0, 1, 2, 3, 4, 5, 6]  # Mon=0, matches date.weekday()


class Evidence(BaseModel):
    """Where one attribute's value came from and when it was last confirmed."""
    source: Literal["provider", "traveler", "verified"]
    updated_at: date


class Place(BaseModel):
    id: str
    name: str
    neighbourhood: str
    lat: float
    lon: float


class Provider(BaseModel):
    id: str
    name: str
    kind: Literal["formal", "informal"]  # doc §10.2 Track A / Track B
    neighbourhood: str
    community_led: bool = False
    verified: bool = False


class AvailabilityWindow(BaseModel):
    """The experience must start and finish within [start, end].

    `slots` set → fixed start times only. `on_date` set → one-off event (festival, show).
    """
    start: time
    end: time
    days: list[Weekday] = [0, 1, 2, 3, 4, 5, 6]
    slots: list[time] = []
    on_date: date | None = None


class Experience(BaseModel):
    id: str
    title: str
    provider_id: str
    place_id: str
    category: Category
    tags: list[Tag]
    description: str
    duration_min: int = Field(gt=0)
    start_model: Literal["fixed_slot", "rolling", "reservation", "drop_in"] = "drop_in"
    price_inr: int = Field(ge=0)  # per person unless price_model says otherwise
    price_model: Literal["per_person", "per_group", "free", "donation"] = "per_person"
    capacity: int = Field(default=20, gt=0)  # max group size per booking/slot
    min_age: int = 0
    accessibility: list[Access] = []
    indoor: bool = False
    weather_sensitive: bool = False
    tourist_index: float = Field(ge=0, le=1)  # 0 = locals only, 1 = tourist-packed
    rating: float | None = Field(default=None, ge=1, le=5)
    review_count: int = 0
    availability: list[AvailabilityWindow]
    evidence: dict[str, Evidence] = {}  # attribute name -> provenance


class Traveler(BaseModel):
    """Stable-ish profile of one person in the group."""
    name: str = "me"
    age: int = 30
    interests: list[Tag] = []
    accessibility: list[Access] = []


class TravelerState(BaseModel):
    """The traveler/group situation right now (doc §5.1)."""
    lat: float
    lon: float
    window_start: datetime
    window_end: datetime
    budget_inr: int  # total for the whole group
    group: list[Traveler] = Field(default_factory=lambda: [Traveler()], min_length=1)
    intents: list[Tag] = []  # what they want *now*, e.g. ["local-food", "heritage"]
    mode: Literal["walk", "auto", "car"] = "auto"
    pace: Literal["relaxed", "normal", "packed"] = "normal"
    indoor_only: bool = False
    max_distance_km: float | None = None
    avoid_crowds: bool = False
    novelty: float = Field(default=0.15, ge=0, le=1)  # appetite for hidden/local vs iconic
    weather: Literal["clear", "rain", "heat"] = "clear"  # current context (doc §5.1)
    # Learned from feedback this session (doc §5.2): tag -> -1..1. Visible and resettable by the
    # traveler, kept apart from what they explicitly asked for (`intents`).
    learned: dict[Tag, float] = {}
    rejected: list[str] = []  # experience ids the traveler said no to: never shown again
    # Where you must be by window_end (hotel, station, next booking). None = no return trip.
    end_lat: float | None = None
    end_lon: float | None = None


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


class Stop(BaseModel):
    """One itinerary entry. experience_id=None for the traveler's own commitments (train, hotel)."""
    title: str
    experience_id: str | None = None
    lat: float
    lon: float
    start: datetime
    end: datetime
    status: Literal["proposed", "confirmed", "active", "completed", "skipped", "replaced"] = (
        "proposed"
    )
    locked: bool = False  # user-fixed: replanning must not touch it
    cost_inr: int = 0  # for the whole group
    who: list[str] = []  # traveler names on this stop; empty means everyone


class SplitLane(BaseModel):
    traveler_names: list[str]
    stops: list[Stop] = []


class GroupSplit(BaseModel):
    id: str
    day: date
    start_time: time
    end_time: time
    rejoin_place_id: str
    rejoin_name: str
    rejoin_lat: float
    rejoin_lon: float
    reason: str = ""
    lanes: list[SplitLane] = []


class Itinerary(BaseModel):
    stops: list[Stop] = []
    splits: list[GroupSplit] = []


class ContextEvent(BaseModel):
    kind: Literal["closure", "provider_cancel", "weather", "delay", "budget_change", "fatigue"]
    at: datetime
    experience_id: str | None = None  # closure / provider_cancel
    weather: Literal["rain", "heat", "clear"] | None = None
    delay_min: int | None = None
    budget_inr: int | None = None


class Feedback(BaseModel):
    experience_id: str
    kind: Literal["accept", "reject", "skip", "rating"]
    at: datetime
    reason: str | None = None  # reject chip: too_far, too_expensive, not_interested, ...
    rating: int | None = Field(default=None, ge=1, le=5)  # kind="rating": after a visit
    as_described: bool | None = None  # kind="rating": was it on, at the listed price/hours?
