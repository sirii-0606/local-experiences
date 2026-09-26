"""Rank feasible experiences and explain why (doc §7.1, §7.4, §7.5).

Feasibility first (feasibility.check), then a weighted utility, then an MMR pass for diversity.
Explanations are built from the same factors as the score, never from a separate narrative.
"""

from collections.abc import Collection
from datetime import datetime
from statistics import mean

from pydantic import BaseModel

from app.engine.confidence import LOW_CONFIDENCE, attr_confidence
from app.engine.feasibility import Fit, check, rush_hour
from app.engine.learn import NOT_TASTE
from app.models import Experience, TravelerState
from app.seed import Seed

# Weights from docs/ideation/decisions.md. Novelty is added on top, scaled by state.novelty.
WEIGHTS = {
    "preference": 0.25,
    "intent": 0.20,
    "spatial": 0.10,
    "budget": 0.10,
    "quality": 0.15,
    "localness": 0.10,
    "context": 0.10,
    "learned": 0.20,  # -1..1 from this session's feedback; 0 (no effect) until there is some
}
MMR_LAMBDA = 0.8  # 1 = pure score, 0 = pure diversity
CONFIDENCE_ATTRS = {"availability": "hours", "price_inr": "price", "accessibility": "accessibility"}


class Recommendation(BaseModel):
    experience_id: str
    title: str
    score: float
    lat: float
    lon: float
    start: datetime
    end: datetime
    km: float
    travel_min: int
    cost_inr: int
    confidence: float
    low_confidence: bool
    factors: dict[str, float]
    reasons: list[str]


def is_strenuous(exp: Experience) -> bool:
    return bool({"active", "adventure"} & set(exp.tags)) or exp.duration_min > 150


def _overlap(wanted: list[str], tags: set[str], cap: int) -> float:
    if not wanted:
        return 0.5  # no signal: neutral
    return min(1.0, len(set(wanted) & tags) / min(len(wanted), cap))


def _attrs_checked(state: TravelerState) -> list[str]:
    needs_access = any(t.accessibility for t in state.group)
    return ["availability", "price_inr"] + (["accessibility"] if needs_access else [])


def _factors(exp: Experience, fit: Fit, state: TravelerState, seed: Seed, conf: float) -> dict:
    provider, place = seed.providers[exp.provider_id], seed.places[exp.place_id]
    tags = set(exp.tags)
    per_member = [_overlap(t.interests, tags, 3) for t in state.group]
    # Bayesian-smoothed rating (prior 4.0 from 20 reviews) mapped 3..5 -> 0..1.
    quality = 0.5
    if exp.rating is not None:
        smoothed = (exp.rating * exp.review_count + 4.0 * 20) / (exp.review_count + 20)
        quality = min(1.0, max(0.0, (smoothed - 3) / 2))
    crowd = 1 - exp.tourist_index if state.avoid_crowds else 0.5
    pace = 0.0 if state.pace == "relaxed" and is_strenuous(exp) else 1.0
    if state.weather == "heat" and exp.weather_sensitive and not exp.indoor:
        pace *= 0.5  # soft: outdoors in the heat is possible, just less appealing
    wants_iconic = "iconic" in state.intents
    # averaged over all of its taste tags, so one shared generic tag isn't "similar"
    taste = tags - NOT_TASTE
    return {
        "learned": sum(state.learned.get(t, 0.0) for t in taste) / len(taste) if taste else 0.0,
        # group fairness: don't let one member be miserable (decisions.md)
        "preference": 0.7 * mean(per_member) + 0.3 * min(per_member),
        "intent": _overlap(state.intents, tags, 2),
        "spatial": max(0.0, 1 - fit.travel_min / 60),
        "budget": 1 - fit.cost_inr / state.budget_inr if state.budget_inr else 1.0,
        "quality": quality * conf,
        "localness": 0.5 * provider.community_led
        + 0.3 * (provider.neighbourhood == place.neighbourhood)
        + 0.2 * (1 - exp.tourist_index),
        "context": (crowd + pace) / 2,
        "novelty": exp.tourist_index if wants_iconic else 1 - exp.tourist_index,
    }


def _reasons(
    exp: Experience, fit: Fit, state: TravelerState, seed: Seed, low: dict, f: dict
) -> list[str]:
    size = len(state.group)
    out = [
        f"{fit.km:.1f} km away, ~{fit.travel_min} min by {state.mode}"
        + (" (rush-hour estimate)" if rush_hour(state.window_start, state.mode) else "")
        if fit.travel_min
        else "right where you are",
        f"{fit.start:%H:%M}–{fit.end:%H:%M}, "
        + (
            f"in time for your next stop at {state.window_end:%H:%M}"
            if state.end_lat is not None
            else f"done before your {state.window_end:%H:%M} cutoff"
        ),
        "free"
        if fit.cost_inr == 0
        else f"₹{fit.cost_inr} for {size}, within your ₹{state.budget_inr} budget",
    ]
    if hits := [t for t in state.intents if t in exp.tags]:
        out.append("matches " + ", ".join(hits))
    if size > 1 and any(t.interests for t in state.group):
        fans = [t.name for t in state.group if set(t.interests) & set(exp.tags)]
        if len(fans) == size:
            out.append("something for everyone in your group")
        elif fans:
            out.append("especially for " + ", ".join(fans))
    if f["learned"] > 0.1:
        out.append("similar to things you liked")
    elif f["learned"] < -0.1:
        out.append("similar to things you passed on")
    provider = seed.providers[exp.provider_id]
    if provider.community_led:
        out.append("run by a local community host")
    if provider.id.startswith("pv-gov-"):
        out.append(f"protected heritage site ({provider.name})")
    if exp.tourist_index <= 0.2:
        out.append("mostly locals, few tourists")
    if size > 1 and exp.min_age:
        out.append(f"fine for your group (ages {exp.min_age}+)")
    if needed := sorted({a for t in state.group for a in t.accessibility}):
        out.append(", ".join(needed) + " access confirmed")
    for attr, ev in low.items():
        label = CONFIDENCE_ATTRS[attr]
        out.append(
            f"⚠ {label}: typical for this kind of place, not confirmed (check before going)"
            if ev and ev.source == "estimate"
            else f"⚠ {label} last confirmed {ev.updated_at:%d %b %Y} ({ev.source})"
            if ev
            else f"⚠ {label} not independently confirmed"
        )
    return out


def _jaccard(a: set, b: set) -> float:
    return len(a & b) / len(a | b)


def discover(
    state: TravelerState, seed: Seed, k: int = 5, skip: Collection[str] = ()
) -> tuple[list[Recommendation], dict[str, list[str]]]:
    """Top-k feasible, diverse recommendations, plus why every other experience was excluded.

    `skip`: experience ids not to consider at all (e.g. already in the itinerary).
    """
    today = state.window_start.date()
    scored: list[tuple[Recommendation, set]] = []
    excluded: dict[str, list[str]] = {}
    for exp in seed.experiences.values():
        if exp.id in skip:
            continue
        if exp.id in state.rejected:
            excluded[exp.id] = ["you said no to this earlier"]
            continue
        fit = check(exp, state, seed)
        if not fit.ok:
            excluded[exp.id] = fit.reasons
            continue
        provider = seed.providers[exp.provider_id]
        confs = {a: attr_confidence(exp, provider, a, today) for a in _attrs_checked(state)}
        conf = mean(confs.values())
        f = _factors(exp, fit, state, seed, conf)
        score = sum(WEIGHTS[n] * f[n] for n in WEIGHTS) + state.novelty * f["novelty"]
        low = {a: exp.evidence.get(a) for a, c in confs.items() if c < LOW_CONFIDENCE}
        place = seed.places[exp.place_id]
        rec = Recommendation(
            experience_id=exp.id,
            title=exp.title,
            score=round(score, 4),
            lat=place.lat,
            lon=place.lon,
            start=fit.start,
            end=fit.end,
            km=fit.km,
            travel_min=fit.travel_min,
            cost_inr=fit.cost_inr,
            confidence=round(conf, 2),
            low_confidence=conf < LOW_CONFIDENCE,
            factors={n: round(v, 3) for n, v in f.items()},
            reasons=_reasons(exp, fit, state, seed, low, f),
        )
        scored.append((rec, set(exp.tags) | {exp.category, exp.provider_id}))

    # MMR: trade score against similarity to what's already picked (no five near-identical options).
    # What they asked for comes first: diversity reorders matches, it never lifts a non-match
    # above one (decisions.md).
    picked: list[tuple[Recommendation, set]] = []
    while scored and len(picked) < k:
        matches = [it for it in scored if it[0].factors["intent"] > 0] if state.intents else []
        best = max(
            matches or scored,
            key=lambda it: (
                MMR_LAMBDA * it[0].score
                - (1 - MMR_LAMBDA) * max((_jaccard(it[1], p[1]) for p in picked), default=0.0)
            ),
        )
        picked.append(best)
        scored.remove(best)
    return [r for r, _ in picked], excluded
