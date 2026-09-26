"""Natural language -> TravelerState. The LLM only extracts; the engine decides.

Two parsers produce the same ParsedRequest: Claude (structured output) and a rule-based
fallback that works offline. `parse()` picks one and always falls back to rules on failure.
"""
import logging
import os
import re
from collections.abc import Callable
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal

from pydantic import BaseModel

from app.models import Access, Tag, Traveler, TravelerState
from app.seed import Seed

log = logging.getLogger(__name__)
IST = timezone(timedelta(hours=5, minutes=30))
MODEL = "claude-opus-5"
DEFAULT_PLACE = "pl-hawa-mahal"  # city centre when no location is given


class ParsedRequest(BaseModel):
    """Only what the traveler said. None = not mentioned (keep previous value)."""
    near: str | None = None  # a place name from the known list
    start_time: str | None = None  # "HH:MM", 24h
    end_time: str | None = None
    duration_min: int | None = None
    budget_inr: int | None = None  # total for the whole group
    group_size: int | None = None
    adults: int | None = None
    children: int | None = None
    child_ages: list[int] = []
    seniors: int | None = None
    intents: list[Tag] = []
    accessibility: list[Access] = []
    avoid_crowds: bool | None = None
    indoor_only: bool | None = None
    hidden_gems: bool | None = None
    raining: bool | None = None
    pace: Literal["relaxed", "normal", "packed"] | None = None
    mode: Literal["walk", "auto", "car"] | None = None


def now_ist() -> datetime:
    return datetime.now(IST).replace(tzinfo=None, second=0, microsecond=0)


# ---------------------------------------------------------------- rule-based parser

NUM = {"a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
       "seven": 7, "eight": 8, "nine": 9, "ten": 10, "half": 0.5}
N = r"(\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|half)"
KEYWORDS: dict[str, list[str]] = {  # regex -> tags
    r"street[- ]?food|chaat|kachori": ["street-food", "local-food"],
    r"\b(?:food|foodie|eat|eating|lunch|dinner|snacks?|cuisine|thali|breakfast)\b": ["local-food"],
    r"sweet|dessert|mithai": ["sweets"],
    r"\bchai\b|\btea\b": ["chai"],
    r"cultur": ["heritage", "performance"],
    r"histor|heritage|\bforts?\b|palace|monument": ["heritage", "history"],
    r"museum": ["museum"],
    r"temple|spiritual|aarti": ["spiritual"],
    r"craft|artisan|pottery|block[- ]print": ["craft"],
    r"\bart\b|gallery|painting": ["art"],
    r"music|concert": ["music"],
    r"danc": ["dance"],
    r"\b(?:a|the) show\b|performance|puppet|theatre|theater": ["performance"],
    r"workshop|hands[- ]on|learn to|class\b": ["workshop", "hands-on"],
    r"\bshop|market|bazaar": ["shopping", "market"],
    r"textile|fabric|sari|saree": ["textiles"],
    r"jewel|gem[- ]?cut|gemstone": ["jewellery"],
    r"nature|park|garden": ["nature"],
    r"wildlife|leopard|safari|animal": ["wildlife"],
    r"sunset": ["sunset"],
    r"sunrise": ["sunrise"],
    r"\bview": ["viewpoint"],
    r"photo": ["photography"],
    r"adventure|thrill": ["adventure"],
    r"cycl|\bbike|\bactive\b|\bhik(?:e|ing)\b": ["active"],
    r"yoga|wellness|spa": ["wellness"],
    r"relax|chill|calm": ["relaxed"],
    r"nightlife|\bbar\b|night out|pub": ["nightlife"],
    r"romantic|\bdate\b|anniversary": ["romantic"],
    r"hidden|offbeat|off the beaten|less touristy|not touristy|like a local": ["hidden-gem"],
    r"iconic|must[- ]see|famous|landmark": ["iconic"],
}


def _num(s: str) -> float:
    return NUM[s] if s in NUM else float(s)


def _clock(h: str, m: str | None, ampm: str | None, hint: str | None = None) -> str:
    hour, ampm = int(h), ampm or hint
    if ampm == "pm" and hour < 12:
        hour += 12
    if ampm == "am" and hour == 12:
        hour = 0
    if ampm is None and hour < 8:  # "free 4-6" almost always means afternoon
        hour += 12
    return f"{hour:02d}:{int(m or 0):02d}"


MONEY = r"(?:₹|rs\.?|inr)\s*(\d[\d,]*)|(\d[\d,]*)\s*(?:₹|rs\b|rupees|inr)"
CLOCK = r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?"


def money(t: str, extra: str = "") -> tuple[int | None, str]:
    """(first amount in rupees, text with amounts removed so they don't read as times)."""
    m = re.search(MONEY + extra, t)
    amount = int(next(g for g in m.groups() if g).replace(",", "")) if m else None
    return amount, re.sub(MONEY, " ", t)


def clock_range(t: str) -> tuple[str, str] | None:
    if m := re.search(CLOCK + r"\s*(?:-|to|till|until)\s*" + CLOCK, t):
        return _clock(m[1], m[2], m[3], hint=m[6]), _clock(m[4], m[5], m[6])
    return None


def duration(t: str) -> int | None:
    if re.search(r"half an? hour", t):
        return 30
    if m := re.search(N + r"\s*(?:hours?|hrs?)\b", t):
        return int(_num(m[1]) * 60)
    if m := re.search(r"(\d+)\s*(?:minutes|mins?)\b", t):
        return int(m[1])
    if "half a day" in t or "half day" in t:
        return 240
    return None


def parse_rules(text: str, seed: Seed) -> ParsedRequest:
    t = text.lower().replace("–", "-").replace("—", "-")
    p = ParsedRequest()
    if found := _find_place(t, seed):  # first, so "near City Palace" doesn't read as "palace"
        p.near, matched = found
        t = t.replace(matched, " ")

    p.budget_inr, t_no_money = money(t, r"|budget(?: of| is)?\s*(\d[\d,]*)")
    if span := clock_range(t_no_money):
        p.start_time, p.end_time = span
    elif m := re.search(r"(?:until|till|by|before|back at)\s+" + CLOCK, t_no_money):
        p.end_time = _clock(m[1], m[2], m[3])
    p.duration_min = duration(t_no_money)

    if m := re.search(r"family of " + N, t):
        p.group_size = int(_num(m[1]))
    elif m := re.search(N + r"\s*(?:of us|people|friends|adults)", t):
        p.group_size = int(_num(m[1]))
    elif re.search(r"\bcouple\b|my (?:wife|husband|partner|girlfriend|boyfriend)", t):
        p.adults = 2
    elif re.search(r"\bsolo\b|\balone\b|by myself|just me", t):
        p.adults = 1
    if m := re.search(N + r"\s*(?:kids|children|child|sons|daughters)", t):
        p.children = int(_num(m[1]))
    elif re.search(r"\b(?:a|my) (?:kid|child|son|daughter)\b|with (?:a )?(?:kid|child)\b", t):
        p.children = 1
    p.child_ages = [int(a) for a in re.findall(r"(\d{1,2})[- ]?(?:year|yr)s?[- ]old", t)]
    if re.search(r"my parents|grandparents", t):
        p.seniors = 2
    elif re.search(r"my (?:mother|father|mom|dad|grandma|grandpa)|elderly|senior", t):
        p.seniors = 1

    if "wheelchair" in t:
        p.accessibility.append("wheelchair")
    if re.search(r"no stairs|can't climb|cannot climb|step[- ]free", t):
        p.accessibility.append("step_free")
    if re.search(r"crowd|quiet|peaceful", t):  # people only mention crowds to avoid them
        p.avoid_crowds = True
    if re.search(r"\bindoors?\b|inside", t):
        p.indoor_only = True
    if re.search(r"\brain(?:ing|y|s)?\b", t):
        p.raining = True
    if re.search(r"tired|exhausted|relaxed|slow|easy", t):
        p.pace = "relaxed"
    if re.search(r"on foot|walking distance|\bby walk", t):
        p.mode = "walk"
    elif re.search(r"\bcar\b|\bcab\b|taxi|driv", t):
        p.mode = "car"

    for pattern, tags in KEYWORDS.items():
        if re.search(pattern, t):
            p.intents += [x for x in tags if x not in p.intents]
    if "hidden-gem" in p.intents:
        p.hidden_gems = True
    if p.children and "kids" not in p.intents:
        p.intents.append("kids")

    return p


ALIASES = {"jkk": "Jawahar Kala Kendra", "railway station": "Station Road, Sindhi Camp",
           "train station": "Station Road, Sindhi Camp"}
GENERIC = {"city", "central", "station", "old"}


def _find_place(t: str, seed: Seed) -> tuple[str, str] | None:
    """(place name, the text that matched it)."""
    for alias, name in ALIASES.items():
        if alias in t:
            return name, alias
    words = set(re.findall(r"[a-z-]+", t))
    for pl in sorted(seed.places.values(), key=lambda x: -len(x.name)):  # longest name first
        low = pl.name.lower()
        full = re.split(r"[(:,&]", low)[0].strip()
        first = low.split()[0]
        if full in t:
            return pl.name, full
        if first in words and len(first) > 3 and first not in GENERIC:
            return pl.name, first
    return None


# ---------------------------------------------------------------- Claude parser

SYSTEM = """You extract a traveler's request for a local-experience planner in Jaipur into JSON.
Only record what the traveler actually said; leave everything else null or empty. Never guess
a budget, time or group size that was not stated.
- near: copy one name exactly from KNOWN PLACES if the traveler mentions it or something clearly
  at it; otherwise null.
- start_time / end_time: 24h "HH:MM" on the current day. "free 4-6" means 16:00-18:00.
- duration_min: for "I have 2 hours" style statements.
- budget_inr: the total for the whole group, in rupees.
- group: a "family of 4 with two kids" is group_size 4, children 2. "my parents" are 2 seniors.
- intents: pick the closest tags from the allowed list. "cultural" usually means heritage and
  performance; "local food" means local-food.
- hidden_gems: true for "hidden", "offbeat", "less touristy" requests.
- raining: true only if the traveler says it is raining."""


def claude_parse[T: BaseModel](system: str, content: str, schema: type[T], client=None) -> T:
    """One structured-output extraction call. Shared by traveler intents and provider drafts."""
    import anthropic

    client = client or anthropic.Anthropic(timeout=30, max_retries=1)
    response = client.beta.messages.parse(
        model=MODEL,
        max_tokens=16000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        output_config={"effort": "low"},  # plain extraction; low effort keeps it snappy
        system=system,
        messages=[{"role": "user", "content": content}],
        output_format=schema,
    )
    if response.stop_reason == "refusal" or response.parsed_output is None:
        raise ValueError(f"no structured output (stop_reason={response.stop_reason})")
    return response.parsed_output


def known_places(seed: Seed) -> str:
    return ", ".join(sorted(p.name for p in seed.places.values()))


def parse_llm(text: str, now: datetime, seed: Seed, client=None) -> ParsedRequest:
    return claude_parse(SYSTEM, f"KNOWN PLACES: {known_places(seed)}\n"
                                f"CURRENT TIME: {now:%A %d %B %Y, %H:%M}\n\nTRAVELER: {text}",
                        ParsedRequest, client)


def _llm_enabled() -> bool:
    mode = os.environ.get("INTENT_PARSER", "auto")
    if mode != "auto":
        return mode == "llm"
    return any(os.environ.get(k) for k in
               ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_PROFILE"))


def llm_or_rules[T](llm: Callable[[], T], rules: Callable[[], T]) -> tuple[T, str]:
    """Try Claude when enabled; any failure (auth, network, refusal) falls back to rules."""
    if _llm_enabled():
        try:
            return llm(), "llm"
        except Exception as e:
            log.warning("LLM extraction failed, using rules: %s", e)
    return rules(), "rules"


def parse(text: str, now: datetime, seed: Seed) -> tuple[ParsedRequest, str]:
    """Returns (parsed request, which parser produced it: "llm" or "rules")."""
    return llm_or_rules(lambda: parse_llm(text, now, seed), lambda: parse_rules(text, seed))


# ---------------------------------------------------------------- ParsedRequest -> state

def _hhmm(day: date, s: str) -> datetime:
    return datetime.combine(day, time.fromisoformat(s))


def to_state(p: ParsedRequest, now: datetime, seed: Seed,
             base: TravelerState | None = None) -> TravelerState:
    """Merge what was said into the previous state (conversational refinement)."""
    home = seed.places[DEFAULT_PLACE]
    s = base.model_dump() if base else {
        "lat": home.lat, "lon": home.lon, "budget_inr": 2000, "group": [Traveler().model_dump()],
        "window_start": now, "window_end": now + timedelta(hours=3),
    }
    day = s["window_start"].date() if base else now.date()

    if p.near and (place := next((x for x in seed.places.values() if x.name == p.near), None)):
        s["lat"], s["lon"] = place.lat, place.lon
    if p.start_time:
        s["window_start"] = _hhmm(day, p.start_time)
    if p.end_time:
        s["window_end"] = _hhmm(day, p.end_time)
    elif p.duration_min:
        s["window_end"] = s["window_start"] + timedelta(minutes=p.duration_min)
    if s["window_end"] <= s["window_start"]:
        s["window_end"] = s["window_start"] + timedelta(hours=2)
    if p.budget_inr is not None:
        s["budget_inr"] = p.budget_inr

    if any(v is not None for v in (p.group_size, p.adults, p.children, p.seniors)) or p.child_ages:
        # "solo", "a couple", "family of 4" describe the WHOLE group: nobody carries over from
        # before. "actually with my parents" / "with a kid" only adds to the previous group.
        prev = [] if (p.group_size is not None or p.adults is not None) else (
            base.group if base else [])
        children = p.children if p.children is not None else (
            len(p.child_ages) or sum(t.age < 16 for t in prev))
        seniors = p.seniors if p.seniors is not None else sum(t.age >= 65 for t in prev)
        adults = p.adults if p.adults is not None else (
            max(p.group_size - children - seniors, 0) if p.group_size
            else sum(16 <= t.age < 65 for t in prev) or 1)
        ages = (p.child_ages + [8] * children)[:children]
        s["group"] = ([Traveler(name=f"adult{i + 1}").model_dump() for i in range(adults)]
                      + [Traveler(name=f"senior{i + 1}", age=68).model_dump()
                         for i in range(seniors)]
                      + [Traveler(name=f"child{i + 1}", age=a, interests=["kids"]).model_dump()
                         for i, a in enumerate(ages)])
    if p.accessibility:
        member = s["group"][0]
        member["accessibility"] = sorted(set(member["accessibility"]) | set(p.accessibility))

    if p.intents:
        s["intents"] = list(p.intents)
    for field in ("avoid_crowds", "indoor_only", "pace", "mode"):
        if (v := getattr(p, field)) is not None:
            s[field] = v
    if p.hidden_gems:
        s["novelty"] = 0.6
    if p.raining:
        s["weather"] = "rain"
    return TravelerState.model_validate(s)
