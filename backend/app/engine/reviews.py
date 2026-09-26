"""Review verification: which reviews to trust, and the rating that's left when fakes are set aside.

How AI-written and bot-farm reviews give themselves away, and the signal for each:
- style: AI's tells: long dashes, "not X but Y" constructions, stock praise
  ("exceptionally attentive", "seamless", "a testament to").
- no specifics: real people mention staff names, prices, times, the bed and the shower;
  generic praise ("excellent service") names nothing.
- burst: real reviews trickle in over months; a bot farm lands 20 in one day.
- repeated claim: bots copy each other, errors included (47 five-star reviews praising a
  restaurant that closed two years ago). Near-copies and a shared phrase across many reviews.
- extremes: 1 and 5 stars count less than 2-4; a 3-star is usually a rational, real visitor.
- verified visit: a review tied to a booking made here ("verified purchase") is trusted most.

Nothing is deleted or hidden: every review keeps its flags and trust, and only the ones we trust
feed the rating the engine ranks on (doc §6.3 independent evidence, §12.1 trust signals).
ponytail: heuristics, not a classifier; AI text keeps getting harder to spot, so booking-linked
reviews are the durable signal. Tune the word lists and thresholds as real data arrives.
"""

import re
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from statistics import mean

from pydantic import BaseModel, Field

# ---------------------------------------------------------------- word lists
STOCK_PRAISE = [
    "exceptionally attentive",
    "impeccable",
    "seamless",
    "a testament to",
    "nestled",
    "unparalleled",
    "second to none",
    "exceeded my expectations",
    "exceeded all expectations",
    "exceeded our expectations",
    "top-notch",
    "world-class",
    "truly unforgettable",
    "unforgettable experience",
    "excellent service",
    "highly recommend",
    "must-visit",
    "perfect blend",
    "attention to detail",
    "every detail",
    "memorable experience",
    "culinary journey",
    "exquisite",
    "delve",
    "tapestry",
    "elevate",
    "breathtaking",
    "above and beyond",
    "hidden gem",
    "look no further",
    "an absolute gem",
    "truly exceptional",
]
CONTRAST = re.compile(
    r"\bnot (?:just|only|merely|simply)?\s*[\w' ]{1,40}?,?\s*but (?:also |rather )?\w+"
    r"|\bisn'?t (?:just )?(?:a |an )?\w+[\w ]{0,30}?[,;—–-]+\s*it'?s\b"
    r"|\bit'?s not (?:just )?about [\w ]{1,30}?[,;—–-]+\s*it'?s about\b",
    re.I,
)
CONCRETE = re.compile(
    r"\b(?:bed|beds|shower|pillow|towel|bathroom|toilet|washroom|a/?c|fan|queue|line|parking|"
    r"auto|rickshaw|cab|ticket|tickets|entry|guide|chai|thali|stairs|steps|shoes|water|price|"
    r"prices|rupees|rs|inr|wait|waited|minutes|mins|hours?|crowd|crowded|dust|dusty|noise|noisy|"
    r"smell|cold|spicy|rain|mosquito|mosquitoes|breakfast|lunch|dinner|menu|plate|table|room|"
    r"window|floor|roof|rooftop|lift|elevator|wifi|staircase|photo|camera|locker|slippers|"
    r"cash|upi|card|change|tip|refund|booking|driver|kid|kids|son|daughter|mother|father|wife|"
    r"husband|grandma|grandpa)\b",
    re.I,
)
DETAIL = re.compile(r"\d|₹", re.I)
NAME = re.compile(
    r"(?<=[a-z,] )(?:[A-Z][a-z]{2,})(?:\s[A-Z][a-z]+)?"
)  # a capitalised word mid-sentence
NOT_NAMES = {
    "I",
    "The",
    "This",
    "India",
    "Indian",
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Google",
    "Instagram",
}
STOP = set(
    "a an the and or but of to in on at for with is was were it this that my we our i".split()
)

# ---------------------------------------------------------------- weights
PENALTY = {"style": 0.45, "generic": 0.7, "burst": 0.35, "copy": 0.25, "repeated": 0.5}
UNVERIFIED = 0.85
VERIFIED_FLOOR = 0.5  # a real visit can still be written with AI help; never discard it
COUNT_FROM = 0.4  # trust at or above this counts towards the rating
EXTREMITY = {1: 0.6, 2: 0.9, 3: 1.0, 4: 0.9, 5: 0.6}
BURST_MIN, BURST_SHARE, BURST_WINDOW = 5, 0.5, timedelta(days=15)
COPY_JACCARD, SHARED_NGRAM, SHARED_MIN = 0.5, 4, 3


class Review(BaseModel):
    id: str
    at: datetime
    rating: int = Field(ge=1, le=5)
    text: str = ""
    verified: bool = False  # tied to a booking made on the platform


class ReviewCheck(BaseModel):
    id: str
    at: datetime
    rating: int
    text: str
    verified: bool
    trust: float  # 0..1
    counted: bool  # feeds the trusted rating
    flags: list[str]  # why it's less trusted, in plain words


class ReviewReport(BaseModel):
    total: int
    counted: int
    suspicious: int
    verified: int
    rating_all: float | None  # the naive average, what most sites show
    rating_trusted: float | None  # counted reviews only, extremes weighted down
    verdict: str
    bursts: list[str] = []
    reviews: list[ReviewCheck] = []


def _words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", text.lower())


def style_signs(text: str) -> list[str]:
    """What makes a text read machine-written. Two or more signs = flagged."""
    signs = []
    if (dashes := len(re.findall(r"—|–| - ", text))) >= 2:
        signs.append(f"{dashes} long dashes")
    if CONTRAST.search(text):
        signs.append("a 'not X but Y' line")
    low = text.lower()
    if stock := [p for p in STOCK_PRAISE if p in low]:
        signs.append("stock praise (" + ", ".join(f"'{p}'" for p in stock[:3]) + ")")
        if len(stock) >= 3:
            signs.append("piled-up superlatives")
    return signs


def specifics(text: str) -> int:
    names = [n for n in NAME.findall(text) if n.split()[0] not in NOT_NAMES]
    return len(CONCRETE.findall(text)) + len(DETAIL.findall(text)) + len(names)


def _ngrams(words: list[str], n: int) -> set[tuple[str, ...]]:
    return {tuple(words[i : i + n]) for i in range(len(words) - n + 1)}


def _bursts(reviews: list[Review]) -> dict[date, str]:
    """Days holding at least 5 reviews and at least half of those within 15 days around them."""
    by_day = Counter(r.at.date() for r in reviews)
    out = {}
    for day, n in by_day.items():
        around = sum(c for d, c in by_day.items() if abs(d - day) <= BURST_WINDOW and d != day)
        if n >= BURST_MIN and n >= BURST_SHARE * (n + around):
            out[day] = f"{n} reviews on {day:%a %d %b %Y}, {around} in the 30 days around it"
    return out


def _copies(reviews: list[Review]) -> tuple[dict[str, int], dict[str, str]]:
    """(review id -> how many near-copies it has, review id -> a phrase it shares with >= 2
    others). Phrases made only of common words don't count."""
    shingles = {r.id: _ngrams(_words(r.text), 3) for r in reviews}
    copies: dict[str, int] = defaultdict(int)
    ids = [r.id for r in reviews if len(shingles[r.id]) >= 4]
    for i, a in enumerate(ids):
        for b in ids[i + 1 :]:
            sa, sb = shingles[a], shingles[b]
            if len(sa & sb) / len(sa | sb) >= COPY_JACCARD:
                copies[a] += 1
                copies[b] += 1
    grams: dict[tuple, set[str]] = defaultdict(set)
    for r in reviews:
        for g in _ngrams(_words(r.text), SHARED_NGRAM):
            if sum(w not in STOP for w in g) >= 3:
                grams[g].add(r.id)
    shared: dict[str, str] = {}
    # most widely shared first; among equals, the one with the fewest filler words
    for g, who in sorted(grams.items(), key=lambda x: (-len(x[1]), sum(w in STOP for w in x[0]))):
        if len(who) >= SHARED_MIN:
            for rid in who:
                shared.setdefault(rid, f"'{' '.join(g)}' (in {len(who)} reviews)")
    return copies, shared


def check(reviews: list[Review]) -> ReviewReport:
    bursts = _bursts(reviews)
    copies, shared = _copies(reviews)
    checked = []
    for r in reviews:
        trust, flags = 1.0, []
        words = _words(r.text)
        if len(signs := style_signs(r.text)) >= 2:
            trust *= PENALTY["style"]
            flags.append("reads machine-written: " + ", ".join(signs))
        if len(words) >= 8 and specifics(r.text) == 0:
            trust *= PENALTY["generic"]
            flags.append("generic: no names, prices, times or concrete details")
        if r.at.date() in bursts:
            trust *= PENALTY["burst"]
            flags.append("arrived in a burst: " + bursts[r.at.date()])
        if n := copies.get(r.id):
            trust *= PENALTY["copy"]
            flags.append(f"near-copy of {n} other review{'s' * (n > 1)}")
        elif r.id in shared:
            trust *= PENALTY["repeated"]
            flags.append("repeats the same claim as others: " + shared[r.id])
        if r.verified:
            trust = max(trust, VERIFIED_FLOOR)
        else:
            trust *= UNVERIFIED
        if r.rating in (1, 5):
            flags.append(f"{r.rating}★ counts {EXTREMITY[r.rating]:.0%} (extremes weigh less)")
        checked.append(
            ReviewCheck(
                **r.model_dump(), trust=round(trust, 2), counted=trust >= COUNT_FROM, flags=flags
            )
        )
    return _report(checked, list(bursts.values()))


def _report(checked: list[ReviewCheck], bursts: list[str]) -> ReviewReport:
    counted = [c for c in checked if c.counted]
    weights = [(c.rating, c.trust * EXTREMITY[c.rating]) for c in counted]
    trusted = (sum(r * w for r, w in weights) / sum(w for _, w in weights)) if weights else None
    raw = mean(c.rating for c in checked) if checked else None
    sus = len(checked) - len(counted)
    if not checked:
        verdict = "No reviews yet."
    elif not sus:
        verdict = f"All {len(checked)} reviews look genuine."
    else:
        verdict = f"{sus} of {len(checked)} reviews look fake or unreliable and aren't counted."
        if raw is not None and trusted is not None and abs(raw - trusted) >= 0.3:
            verdict += f" Trusted rating {trusted:.1f} vs {raw:.1f} for all reviews."
    return ReviewReport(
        total=len(checked),
        counted=len(counted),
        suspicious=sus,
        verified=sum(c.verified for c in checked),
        rating_all=None if raw is None else round(raw, 2),
        rating_trusted=None if trusted is None else round(trusted, 2),
        verdict=verdict,
        bursts=bursts,
        reviews=sorted(checked, key=lambda c: c.at, reverse=True),
    )
