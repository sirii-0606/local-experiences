"""Natural language -> TravelerState. The LLM only extracts; the engine decides.

Two parsers produce the same ParsedRequest: Claude (structured output) and a rule-based
fallback that works offline. `parse()` picks one and always falls back to rules on failure.
"""
import logging
import os
import re
from collections.abc import Callable
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal, get_args

from pydantic import BaseModel, field_validator

from app.models import Access, Tag, Traveler, TravelerState
from app.seed import Seed

log = logging.getLogger(__name__)
IST = timezone(timedelta(hours=5, minutes=30))
MODEL = "claude-opus-5"
DEFAULT_PLACE = "pl-hawa-mahal"  # city centre when no location is given

TAG_SYNONYMS: dict[str, list[Tag]] = {
    "cultural": ["heritage", "performance"],
    "culture": ["heritage"],
    "food": ["local-food"],
    "crafts": ["craft"],
    "arts": ["art"],
    "views": ["viewpoint"],
    "view": ["viewpoint"],
    "walks": ["walking-tour"],
    "walking": ["walking-tour"],
    "gem": ["hidden-gem"],
    "gems": ["hidden-gem"],
}

ACCESS_SYNONYMS: dict[str, Access] = {
    "wheelchair_ramp": "wheelchair",
    "wheelchair_accessible": "wheelchair",
    "wheelchair-access": "wheelchair",
    "step-free": "step_free",
    "step_free_access": "step_free",
}


class ParsedRequest(BaseModel):
    """Only what the traveler said. None = not mentioned (keep previous value)."""
    near: str | None = None  # a place name from the known list
    place_name: str | None = None  # a town/city/area they are in, in their words ("Pune")
    my_age: int | None = None  # the speaker's own age ("I am 76")
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
    avoid: list[Tag] = []  # what they said they don't want ("not a park")
    accessibility: list[Access] = []
    with_companions: bool | None = None  # "with my family/friends", no head count given
    return_to: Literal["station", "airport"] | None = None  # "before my train/flight"
    budget_hint: Literal["low", "high"] | None = None  # "I'm a student" / "luxury"
    avoid_crowds: bool | None = None
    indoor_only: bool | None = None
    hidden_gems: bool | None = None
    raining: bool | None = None
    pace: Literal["relaxed", "normal", "packed"] | None = None
    mode: Literal["walk", "auto", "car"] | None = None

    @field_validator("child_ages", mode="before")
    @classmethod
    def _clean_child_ages(cls, v):
        return v if isinstance(v, list) else []

    @field_validator("intents", "avoid", mode="before")
    @classmethod
    def _clean_intents(cls, v):
        if not isinstance(v, list):
            return []
        valid_tags = set(get_args(Tag))
        out: list[Tag] = []
        for item in v:
            if not isinstance(item, str):
                continue
            item_low = item.strip().lower()
            if item_low in valid_tags:
                out.append(item_low)  # type: ignore
            elif item_low in TAG_SYNONYMS:
                out.extend(TAG_SYNONYMS[item_low])
        return list(dict.fromkeys(out))

    @field_validator("accessibility", mode="before")
    @classmethod
    def _clean_accessibility(cls, v):
        if not isinstance(v, list):
            return []
        valid_access = set(get_args(Access))
        out: list[Access] = []
        for item in v:
            if not isinstance(item, str):
                continue
            item_low = item.strip().lower()
            if item_low in valid_access:
                out.append(item_low)  # type: ignore
            elif item_low in ACCESS_SYNONYMS:
                out.append(ACCESS_SYNONYMS[item_low])
        return list(dict.fromkeys(out))


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
    r"temple|spiritual|aarti|church|cathedral|mosque|masjid|dargah|gurdwara|synagogue":
        ["spiritual"],
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
    r"\bbeach|chowpatty|seaside|sea ?face|\bsea\b|\bocean": ["beach"],
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


NOT_A_PLACE_WORD = {
    "the", "a", "an", "my", "our", "me", "us", "i", "iam", "im", "we", "you", "it", "its", "is",
    "am", "are", "and", "or", "but", "with", "for", "of", "on", "by", "before", "after", "until",
    "till", "now", "today", "tonight", "tomorrow", "this", "that", "there", "here", "some",
    "something", "anything", "explore", "see", "visit", "go", "going", "do", "eat", "have", "get",
    "find", "show", "plan", "use", "using", "back", "home", "hotel", "station", "airport", "work",
    "office", "trip", "family", "friends", "hours", "hour", "minutes", "pm", "morning", "evening",
    "night", "afternoon", "time", "place", "places", "city", "town", "sites", "site", "least",
    "all", "more", "less", "car", "auto", "cab", "taxi", "train", "bus", "flight", "budget",
    "historical", "historial", "cultural", "local", "old", "other", "nearby", "around", "want",
    "not", "no", "any", "don't", "dont", "without", "please", "so", "then", "right", "just",
}
PLACE_AFTER = (r"\b(?:in|at|to|near|around|visiting|exploring|from)\s+"
               r"([a-z][\w.'-]*(?:\s+[a-z][\w.'-]*){0,2})")


def place_candidates(t: str) -> list[str]:
    """Words after "in/at/to/near..." that could be a town or area: "its 6 pm in pune i am" ->
    ["pune"]. The caller geocodes them; anything that isn't a real place is dropped there."""
    out = []
    for m in re.finditer(PLACE_AFTER, t):
        words = []
        for w in m[1].split():
            if w in NOT_A_PLACE_WORD or any(re.search(rx, w) for rx in KEYWORDS):
                break
            words.append(w)
        if words and (name := " ".join(words)) not in out:
            out.append(name)
    return out


NEGATION = (r"\b(?:not|no|don't want|dont want|avoid(?:ed)?|rather than|instead of|except|"
            r"skip(?:ped)?|didn't (?:like|enjoy)|did not (?:like|enjoy)|hated|not a fan of)\s+"
            r"((?:\w+\s*){1,3})")


def parse_rules(text: str, seed: Seed) -> ParsedRequest:
    t = text.lower().replace("–", "-").replace("—", "-").replace("’", "'")
    p = ParsedRequest()
    if found := _find_place(t, seed):  # first, so "near City Palace" doesn't read as "palace"
        p.near, matched = found
        t = t.replace(matched, " ")
    elif cands := place_candidates(t):
        p.place_name = cands[0]

    p.budget_inr, t_no_money = money(t, r"|budget(?: of| is)?\s*(\d[\d,]*)")
    if span := clock_range(t_no_money):
        p.start_time, p.end_time = span
    elif m := re.search(r"(?:until|till|by|before|back at)\s+" + CLOCK, t_no_money):
        p.end_time = _clock(m[1], m[2], m[3])
    elif m := re.search(r"(?:it'?s|it is|now|right now|currently)\s+(?:about |around )?"
                        r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)", t_no_money):
        p.start_time = _clock(m[1], m[2], m[3])  # "it's 6 pm": the window starts then
    p.duration_min = duration(t_no_money)
    if m := re.search(r"\b(?:i am|i'm|iam|im|my age is)\s+(\d{2,3})\b(?!\s*(?:km|min|people))",
                      t_no_money):
        p.my_age = int(m[1])

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
    p.child_ages = [a for a in map(int, re.findall(r"(\d{1,2})[- ]?(?:year|yr)s?[- ]old", t))
                    if a < 16 and a != p.my_age]
    if (re.search(r"\bwith (?:my |our )?(?:family|folks|friends|colleagues|family members)\b", t)
            and p.group_size is None and p.adults is None):
        p.with_companions = True
    if re.search(r"\btrain\b|\brailway\b", t):
        p.return_to = "station"
    elif re.search(r"\bflight\b|\bairport\b|\bplane\b", t):
        p.return_to = "airport"
    if re.search(r"\bstudent\b|backpack|\bcheap\b|shoestring|low budget|tight budget", t):
        p.budget_hint = "low"
    elif re.search(r"luxury|premium|splurge", t):
        p.budget_hint = "high"
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

    for m in re.finditer(NEGATION, t):  # "not any other park" is a dislike, not an intent
        p.avoid += [x for pattern, tags in KEYWORDS.items() if re.search(pattern, m[1])
                    for x in tags if x not in p.avoid]
    for pattern, tags in KEYWORDS.items():
        if re.search(pattern, t):
            p.intents += [x for x in tags if x not in p.intents and x not in p.avoid]
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
        if (first in words and len(first) > 3 and first not in GENERIC
                and not pl.id.startswith("pl-od-")):  # "in pune" isn't "Pune Junction station"
            return pl.name, first
    return None


# ---------------------------------------------------------------- LLM parser (NVIDIA NIM / Claude)

SYSTEM = """You extract a traveler's request for a local-experience planner in India into JSON.
Only record what the traveler actually said; leave everything else null or empty. Never guess
a budget, time or group size that was not stated.
- near: copy one name exactly from KNOWN PLACES if the traveler mentions it or something clearly
  at it; otherwise null.
- place_name: the town, city or area they say they are in or visiting ("Pune", "Colaba"), as
  written; null if none.
- my_age: the speaker's own age if stated. child_ages: only children under 16.
- avoid: tags for things they say they do NOT want ("not a park" -> nature).
- with_companions: true for "with my family/friends" when no head count is given.
- return_to: "station" if they must catch a train, "airport" for a flight; else null.
- budget_hint: "low" for students/backpackers/"cheap", "high" for luxury; null otherwise.
- start_time: "it's 6 pm" means the free time starts at 18:00.
- start_time / end_time: 24h "HH:MM" on the current day. "free 4-6" means 16:00-18:00.
- duration_min: for "I have 2 hours" style statements.
- budget_inr: the total for the whole group, in rupees.
- group: a "family of 4 with two kids" is group_size 4, children 2. "my parents" are 2 seniors.
- intents: pick the closest tags from the allowed list. "cultural" usually means heritage and
  performance; "local food" means local-food.
- hidden_gems: true for "hidden", "offbeat", "less touristy" requests.
- raining: true only if the traveler says it is raining.
- TRAVELER PROFILE, when given, is background from their account and past trips: use it to
  resolve references like "the usual" or "like last time", but record only what this message
  asks for."""


def _clean_json_str(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text


def nim_parse[T: BaseModel](system: str, content: str, schema: type[T]) -> T:
    """Structured JSON extraction via NVIDIA NIM (OpenAI-compatible chat completion endpoint)."""
    import json
    import urllib.request

    api_key = os.environ.get("NVIDIA_API_KEY") or os.environ.get("NIM_API_KEY")
    if not api_key:
        raise ValueError("no NVIDIA API key configured")

    base_url = os.environ.get("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1").rstrip("/")
    model = (
        os.environ.get("NVIDIA_MODEL")
        or os.environ.get("NIM_MODEL")
        or "meta/llama-3.2-11b-vision-instruct"
    )

    schema_json = json.dumps(schema.model_json_schema(), indent=2)
    sys_prompt = (
        f"{system}\n\n"
        f"You must respond ONLY with a valid JSON object strictly matching this schema:\n"
        f"{schema_json}\n"
        f"Do not include any commentary, Markdown fences, or text outside the JSON object."
    )

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": content},
        ],
        "temperature": 0.1,
        "max_tokens": 4096,
        "response_format": {"type": "json_object"},
    }

    req = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "local-experiences/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        res_data = json.loads(resp.read().decode("utf-8"))

    msg_content = res_data["choices"][0]["message"]["content"]
    cleaned = _clean_json_str(msg_content)
    return schema.model_validate_json(cleaned)


def claude_parse[T: BaseModel](system: str, content: str, schema: type[T], client=None) -> T:
    """One structured-output extraction call. Routes to NVIDIA NIM if configured,
    else Anthropic Claude."""
    if client is None and (os.environ.get("NVIDIA_API_KEY") or os.environ.get("NIM_API_KEY")):
        return nim_parse(system, content, schema)

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


def parse_llm(text: str, now: datetime, seed: Seed, client=None,
              profile: str = "") -> ParsedRequest:
    note = f"TRAVELER PROFILE: {profile}\n" if profile else ""
    return claude_parse(SYSTEM, f"KNOWN PLACES: {known_places(seed)}\n{note}"
                                f"CURRENT TIME: {now:%A %d %B %Y, %H:%M}\n\nTRAVELER: {text}",
                        ParsedRequest, client)


def _llm_enabled() -> bool:
    mode = os.environ.get("INTENT_PARSER", "auto")
    if mode != "auto":
        return mode == "llm"
    return any(os.environ.get(k) for k in
               ("NVIDIA_API_KEY", "NIM_API_KEY",
                "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_PROFILE",
                "OPENAI_API_KEY"))


def llm_or_rules[T](llm: Callable[[], T], rules: Callable[[], T]) -> tuple[T, str]:
    """Try LLM when enabled; any failure (auth, network, refusal) falls back to rules."""
    if _llm_enabled():
        try:
            return llm(), "llm"
        except Exception as e:
            log.warning("LLM extraction failed, using rules: %s", e)
    return rules(), "rules"


def parse(text: str, now: datetime, seed: Seed, profile: str = "") -> tuple[ParsedRequest, str]:
    """Returns (parsed request, which parser produced it: "llm" or "rules").
    `profile`: a short summary of the signed-in traveler's context, given to the LLM only."""
    return llm_or_rules(lambda: parse_llm(text, now, seed, profile=profile),
                        lambda: parse_rules(text, seed))


# ---------------------------------------------------------------- ParsedRequest -> state

def _hhmm(day: date, s: str) -> datetime:
    return datetime.combine(day, time.fromisoformat(s))


GENERATED = re.compile(r"^(?:me|adult|senior|child)\d*$")


def to_state(p: ParsedRequest, now: datetime, seed: Seed,
             base: TravelerState | None = None) -> TravelerState:
    """Merge what was said into the previous state (conversational refinement).
    With no base, the location is the demo city centre; callers that know better override it."""
    home = seed.places.get(DEFAULT_PLACE)
    s = base.model_dump() if base else {
        "lat": home.lat if home else 0.0, "lon": home.lon if home else 0.0,
        "budget_inr": 2000, "group": [Traveler().model_dump()],
        "window_start": now, "window_end": now + timedelta(hours=3),
    }
    day = s["window_start"].date() if base else now.date()

    if p.near and (place := next((x for x in seed.places.values() if x.name == p.near), None)):
        s["lat"], s["lon"] = place.lat, place.lon
    if p.start_time:
        length = s["window_end"] - s["window_start"]
        s["window_start"] = _hhmm(day, p.start_time)
        if not (p.end_time or p.duration_min):  # "it's 6 pm": same length of free time, from 6
            s["window_end"] = s["window_start"] + length
    if p.end_time:
        s["window_end"] = _hhmm(day, p.end_time)
    elif p.duration_min:
        s["window_end"] = s["window_start"] + timedelta(minutes=p.duration_min)
    if s["window_end"] <= s["window_start"]:
        s["window_end"] = s["window_start"] + timedelta(hours=2)
    if p.budget_inr is not None:
        s["budget_inr"] = p.budget_inr

    if p.with_companions and not any(
            v is not None for v in (p.group_size, p.children, p.seniors)) and len(s["group"]) < 2:
        p = p.model_copy(update={"group_size": 3})  # ponytail: "with my family" = 3 of you
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
        me = next((t for t in s["group"] if not GENERATED.match(t["name"])), None)
        s["group"] = ([Traveler(name=f"adult{i + 1}").model_dump() for i in range(adults)]
                      + [Traveler(name=f"senior{i + 1}", age=68).model_dump()
                         for i in range(seniors)]
                      + [Traveler(name=f"child{i + 1}", age=a, interests=["kids"]).model_dump()
                         for i, a in enumerate(ages)])
        if me and s["group"]:  # the signed-in traveler stays themselves inside the new group
            s["group"][0] = me
    if p.my_age is not None:
        s["group"][0]["age"] = p.my_age
    if p.pace is None and (p.my_age or 0) >= 70:
        s["pace"] = "relaxed"  # an older traveler gets slack between stops unless they say not
    if p.accessibility:
        member = s["group"][0]
        member["accessibility"] = sorted(set(member["accessibility"]) | set(p.accessibility))

    if p.intents:
        s["intents"] = list(p.intents)
    if p.avoid or p.intents:  # asking for something again lifts an earlier "not that"
        s["intents"] = [i for i in s.get("intents", []) if i not in p.avoid]
        s["avoid"] = sorted((set(s.get("avoid", [])) | set(p.avoid)) - set(p.intents))
    if p.budget_hint and p.budget_inr is None and base is None:
        s["budget_inr"] = {"low": 600, "high": 6000}[p.budget_hint] * len(s["group"])
    for field in ("avoid_crowds", "indoor_only", "pace", "mode"):
        if (v := getattr(p, field)) is not None:
            s[field] = v
    if p.hidden_gems:
        s["novelty"] = 0.6
    if p.raining:
        s["weather"] = "rain"
    return TravelerState.model_validate(s)
