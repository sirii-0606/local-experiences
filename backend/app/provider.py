"""Provider side (doc §10): free text -> editable listing draft -> live experience; demand insights.

Track B onboarding: a small provider describes what they offer in their own words; Claude (or
the offline rules) drafts a structured listing the provider reviews before publishing.
"""
import re
import uuid
from collections import Counter
from datetime import date, time
from typing import Literal

from pydantic import BaseModel

from app.intent import (
    KEYWORDS,
    _find_place,
    claude_parse,
    clock_range,
    duration,
    known_places,
    llm_or_rules,
    money,
)
from app.models import (
    Access,
    AvailabilityWindow,
    Category,
    Evidence,
    Experience,
    Place,
    Provider,
    Tag,
    Weekday,
)
from app.seed import Seed

NEW_LISTING_TOURIST_INDEX = 0.1  # new small providers are, by definition, not yet discovered


class ListingDraft(BaseModel):
    provider_name: str = ""
    title: str = ""
    description: str = ""
    category: Category = "community"
    tags: list[Tag] = []
    near: str | None = None  # a known place name; the listing is pinned there
    duration_min: int = 60
    price_inr: int = 0
    price_model: Literal["per_person", "per_group", "free", "donation"] = "per_person"
    capacity: int = 8
    min_age: int = 0
    accessibility: list[Access] = []
    indoor: bool = True
    weather_sensitive: bool = False
    open_time: str = "10:00"  # "HH:MM"
    close_time: str = "18:00"
    days: list[Weekday] = [0, 1, 2, 3, 4, 5, 6]
    community_led: bool = False


# ---------------------------------------------------------------- drafting

PROVIDER_KEYWORDS = {
    r"bangle|\blac\b": ["craft", "jewellery"],
    r"kids welcome|children welcome|family[- ]friendly|kid[- ]friendly": ["kids", "family"],
    r"make your own|try it|hands[- ]on|learn": ["hands-on", "workshop"],
}
CATEGORY_BY_TAG: list[tuple[set[str], str]] = [
    ({"local-food", "street-food", "sweets", "chai", "fine-dining"}, "food"),
    ({"craft", "art"}, "art"),
    ({"heritage", "history", "museum", "performance", "dance", "music"}, "culture"),
    ({"wellness", "yoga"}, "wellness"),
    ({"nightlife"}, "nightlife"),
    ({"nature", "wildlife"}, "nature"),
    ({"adventure", "active"}, "adventure"),
    ({"shopping", "market", "textiles"}, "shopping"),
]
DAYS = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}


def draft_rules(text: str, seed: Seed) -> ListingDraft:
    t = text.lower().replace("–", "-").replace("—", "-")
    d = ListingDraft(description=text.strip())
    if found := _find_place(t, seed):
        d.near = found[0]
        t = t.replace(found[1], " ")  # "near Tripolia Bazaar" must not read as a shopping tag
    intro = r"(?:i am|i'm|we are|we're|this is)\s+([a-z][a-z .'-]{1,40}?)(?:,|\.| and | a | an )"
    if m := re.search(intro, t):
        d.provider_name = m[1].strip().title()
    own = r"\b(?:make|paint|print|cook|build) (?:your|their) own ([a-z ]{3,30}?)(?=[,.]| and|$)"
    if m := re.search(own, t):
        d.title = f"Make your own {m[1].strip()}"
    else:  # first clause of the first sentence, e.g. "Sunset rooftop tea"
        d.title = re.split(r"[,.!?]", text.strip())[0][:60]
    if d.provider_name:
        d.title += f" with {d.provider_name}"

    price, t_no_money = money(t)
    d.price_inr = price or 0
    if re.search(r"per (?:group|family|booking)", t):
        d.price_model = "per_group"
    elif "donation" in t:
        d.price_model = "donation"
    elif not price and re.search(r"\bfree\b", t):
        d.price_model = "free"
    d.duration_min = duration(t_no_money) or d.duration_min
    if span := clock_range(t_no_money):
        d.open_time, d.close_time = span
    if m := re.search(r"closed on (mon|tue|wed|thu|fri|sat|sun)", t):
        d.days = [x for x in d.days if x != DAYS[m[1]]]
    if "weekends only" in t:
        d.days = [5, 6]
    if m := re.search(r"(\d{1,2})\s*\+|above (\d{1,2})|minimum age (?:of )?(\d{1,2})", t):
        d.min_age = int(next(g for g in m.groups() if g))
    if m := re.search(r"(?:up to|max(?:imum)?(?: of)?)\s*(\d+)\s*(?:people|guests|visitors)?", t):
        d.capacity = int(m[1])

    for pattern, tags in list(KEYWORDS.items()) + list(PROVIDER_KEYWORDS.items()):
        if re.search(pattern, t):
            d.tags += [x for x in tags if x not in d.tags]
    d.category = next((c for tags, c in CATEGORY_BY_TAG if tags & set(d.tags)), "community")
    d.community_led = bool(re.search(
        r"family business|our family|community|cooperative|collective|women|generation|hereditary",
        t))
    if re.search(r"outdoor|rooftop|open[- ]air|\bwalk", t):
        d.indoor, d.weather_sensitive = False, True
    if "wheelchair" in t:
        d.accessibility.append("wheelchair")
    if re.search(r"step[- ]free|ground floor", t):
        d.accessibility.append("step_free")
    if re.search(r"seating|chairs", t):
        d.accessibility.append("seating")
    return d


DRAFT_SYSTEM = """A small local business or host in Jaipur describes an experience they offer
to travelers. Turn it into a listing draft the provider will review before publishing.
Use only what they said; keep defaults for anything not mentioned.
- near: copy one name exactly from KNOWN PLACES that is closest to where it happens.
- title: short and inviting, e.g. "Make your own lac bangle with Salim's family".
- description: 1-2 sentences in plain language, in the provider's spirit; no invented claims.
- tags/category: closest values from the allowed lists.
- open_time/close_time: 24h "HH:MM". price_inr: per person unless they say per group.
- community_led: true for family businesses, cooperatives, hereditary artisans, community hosts."""


def draft(text: str, seed: Seed, client=None) -> tuple[ListingDraft, str]:
    return llm_or_rules(
        lambda: claude_parse(DRAFT_SYSTEM, f"KNOWN PLACES: {known_places(seed)}\n\n"
                                           f"PROVIDER: {text}", ListingDraft, client),
        lambda: draft_rules(text, seed))


# ---------------------------------------------------------------- publishing

def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:32] or "listing"


def to_listing(d: ListingDraft, seed: Seed, today: date) -> tuple[Provider, Place, Experience]:
    """Validate a reviewed draft (trust boundary) and build the entities. ValueError = bad draft."""
    near = next((p for p in seed.places.values() if p.name == d.near), None)
    if near is None:
        raise ValueError("pick the nearest landmark from the list so travelers can find you")
    if not d.title.strip():
        raise ValueError("give the experience a title")
    opens, closes = time.fromisoformat(d.open_time), time.fromisoformat(d.close_time)
    if (closes.hour * 60 + closes.minute) - (opens.hour * 60 + opens.minute) < d.duration_min:
        raise ValueError(f"open hours {d.open_time}-{d.close_time} are shorter than the "
                         f"{d.duration_min}-minute experience")
    if not d.days:
        raise ValueError("choose at least one day")
    if not d.tags:
        raise ValueError("add at least one tag so travelers with that interest are matched")
    key = f"{_slug(d.title)}-{uuid.uuid4().hex[:4]}"
    name = d.provider_name.strip() or d.title.strip()
    provider = Provider(id=f"pv-u-{key}", name=name, kind="informal",
                        neighbourhood=near.neighbourhood, community_led=d.community_led)
    place = Place(id=f"pl-u-{key}", name=f"{name}, near {near.name}",
                  neighbourhood=near.neighbourhood, lat=near.lat, lon=near.lon)
    said = Evidence(source="provider", updated_at=today)
    exp = Experience(
        id=f"ex-u-{key}", title=d.title.strip(), provider_id=provider.id, place_id=place.id,
        category=d.category, tags=d.tags, description=d.description.strip() or d.title.strip(),
        duration_min=d.duration_min, price_inr=d.price_inr, price_model=d.price_model,
        start_model="rolling", capacity=d.capacity, min_age=d.min_age,
        accessibility=d.accessibility, indoor=d.indoor, weather_sensitive=d.weather_sensitive,
        tourist_index=NEW_LISTING_TOURIST_INDEX,
        availability=[AvailabilityWindow(start=opens, end=closes, days=d.days)],
        evidence={a: said for a in ("price_inr", "availability", "duration_min")}
        | ({"accessibility": said} if d.accessibility else {}),
    )
    return provider, place, exp


# ---------------------------------------------------------------- demand insights (doc §10.3)

REASON_BUCKETS = [
    ("budget", "over their budget"),
    ("no time left", "doesn't fit their free time or your hours"),
    ("would end", "too long for their free time"),
    ("leaving too little", "too long for their free time"),
    ("not running", "closed on the day they asked"),
    ("minimum age", "age limit"),
    ("access", "accessibility needs"),
    ("takes at most", "group bigger than your capacity"),
    ("km away", "too far from them"),
    ("raining", "outdoors while it rained"),
    ("not indoors", "they wanted indoors"),
]
TIPS = {
    "over their budget": "Interested travelers found it too expensive. A shorter, cheaper "
                         "version could win them.",
    "doesn't fit their free time or your hours": "Most interested travelers are free at other "
                                                 "times. Consider longer hours or another slot.",
    "too long for their free time": "Travelers had less time than it takes. A shorter format "
                                    "would fit more plans.",
    "group bigger than your capacity": "Groups larger than your capacity asked for it.",
    "accessibility needs": "Travelers with accessibility needs couldn't book it. Confirming "
                           "step-free access or seating would open it to them.",
}


def _bucket(reason: str) -> str:
    return next((label for key, label in REASON_BUCKETS if key in reason), "other")


def _band(per_person: float) -> str:
    return next(b for limit, b in ((200, "under ₹200"), (500, "₹200-500"), (1000, "₹500-1000"),
                                   (float("inf"), "₹1000+")) if per_person < limit)


FEEDBACK_REASONS = {
    "not_interested": "travelers said: not for them", "too_expensive": "over their budget",
    "too_far": "too far from them", "bad_time": "doesn't fit their free time or your hours",
    None: "travelers passed without saying why",
}


def insights(exp: Experience, rows: list[dict], feedback: list[tuple[str, str | None]]) -> dict:
    """What travelers who *wanted* something like this asked for, and why they didn't get it.

    Combines engine exclusions (couldn't be recommended) with explicit traveler feedback
    (was recommended, and they said no, and why).
    """
    matching = [r for r in rows if set(r["intents"]) & set(exp.tags)]
    reasons = Counter(_bucket(x) for r in matching for x in r["excluded"].get(exp.id, []))
    reasons.update(FEEDBACK_REASONS.get(reason, "other") for kind, reason in feedback
                   if kind == "reject")
    return {
        "accepted": sum(kind == "accept" for kind, _ in feedback),
        "passed": sum(kind == "reject" for kind, _ in feedback),
        "searches": len(rows),
        "matching_searches": len(matching),
        "shown": sum(exp.id in r["shown"] for r in rows),
        "shown_to_matching": sum(exp.id in r["shown"] for r in matching),
        "why_not_chosen": reasons.most_common(),
        "tips": [TIPS[b] for b, _ in reasons.most_common(2) if b in TIPS],
        "start_hours": sorted(Counter(r["start_hour"] for r in matching).items()),
        "budget_per_person": Counter(
            _band(r["budget_inr"] / max(r["group_size"], 1)) for r in matching).most_common(),
        "with_kids": sum(r["has_kids"] for r in matching),
        "also_wanted": Counter(i for r in matching for i in r["intents"]
                               if i not in exp.tags).most_common(5),
    }
