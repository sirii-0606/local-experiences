"""The signed-in traveler's context: profile + what we've learned + past trips -> a starting
TravelerState, and a short summary the LLM gets as background (retrieval, not decisions).

Stable profile and learned taste stay apart from what's asked right now (doc §5.1): the
profile fills the group and preferences, learned weights feed the ranker's `learned` factor,
and this message's intents always come from the message itself.
"""
from datetime import datetime, timedelta

from app import accounts
from app.engine.learn import NOT_TASTE
from app.models import Traveler, TravelerState
from app.schemas import ContextEntry, Profile, ProfileContext
from app.seed import Seed

TRIP_WEIGHT = {"in_person": 0.2, "ar": 0.1, "skip": -0.1}
MUST_SEE, PLANNED = 0.2, 0.1
DISLIKE = -0.6
BUDGET_PER_PERSON = {"budget": 700, "mid": 2000, "premium": 6000}  # a few hours out, in ₹
CHAT_STEP, AVOID_STEP, IMPORT_STEP, IMPORT_AVOID = 0.1, -0.2, 0.3, -0.4


def _clamp(w: float) -> float:
    return round(max(-1.0, min(1.0, w)), 2)


def trip_weights(user_id: int, seed: Seed) -> dict[str, float]:
    """Taste from saved trips: what they kept, must-saw and planned, or skipped."""
    out: dict[str, float] = {}
    for trip in accounts.list_trips(user_id):
        picks = {**{e: MUST_SEE for e in trip.must_see},
                 **{e: TRIP_WEIGHT[d] for e, d in trip.shortlist.items()}}
        for stop in (trip.itinerary.stops if trip.itinerary else []):
            if stop.experience_id and stop.experience_id not in picks:
                picks[stop.experience_id] = PLANNED
        for eid, w in picks.items():
            if exp := seed.experiences.get(eid):
                for t in set(exp.tags) - NOT_TASTE:
                    out[t] = _clamp(out.get(t, 0.0) + w)
    return out


def weights(user_id: int, profile: Profile | None, seed: Seed) -> dict[str, float]:
    """Everything learned, one number per tag. Stated dislikes always win."""
    out = trip_weights(user_id, seed)
    for c in accounts.get_context(user_id):
        out[c.tag] = _clamp(out.get(c.tag, 0.0) + c.weight)
    for t in (profile.dislikes if profile else []):
        out[t] = min(out.get(t, 0.0), DISLIKE)
    return {t: w for t, w in out.items() if w}


def context(user_id: int, profile: Profile | None, seed: Seed) -> ProfileContext:
    trips = trip_weights(user_id, seed)
    return ProfileContext(
        entries=accounts.get_context(user_id),
        from_trips=[ContextEntry(tag=t, weight=w, source="trips")
                    for t, w in sorted(trips.items(), key=lambda x: -abs(x[1])) if w],
        summary=summary(profile, weights(user_id, profile, seed)))


def summary(profile: Profile | None, learned: dict[str, float]) -> str:
    if profile is None and not learned:
        return ""
    parts = []
    if profile:
        if profile.age:
            parts.append(f"Age {profile.age}.")
        if profile.home_city:
            parts.append(f"Lives in {profile.home_city}.")
        if profile.interests:
            parts.append("Interests: " + ", ".join(profile.interests) + ".")
        if profile.accessibility:
            parts.append("Needs: " + ", ".join(profile.accessibility) + ".")
        parts.append(f"Pace: {profile.pace}.")
        if profile.companions:
            parts.append("Usually travels with: " + ", ".join(
                c.name + (f" ({c.age})" if c.age is not None else "")
                for c in profile.companions) + ".")
    likes = [t for t, w in sorted(learned.items(), key=lambda x: -x[1]) if w >= 0.2][:6]
    avoids = [t for t, w in sorted(learned.items(), key=lambda x: x[1]) if w <= -0.2][:6]
    if likes:
        parts.append("Has liked: " + ", ".join(likes) + ".")
    if avoids:
        parts.append("Avoids: " + ", ".join(avoids) + ".")
    return " ".join(parts)


def state(profile: Profile, learned: dict[str, float], lat: float, lon: float, now: datetime,
          with_companions: bool = False) -> TravelerState:
    """Where a signed-in traveler starts before they say anything about this outing."""
    me = Traveler(name=profile.display_name[:40], age=profile.age or 30,
                  interests=profile.interests, accessibility=profile.accessibility)
    group = [me] + ([Traveler(name=c.name, age=c.age if c.age is not None else 30,
                              interests=c.interests, accessibility=c.accessibility)
                     for c in profile.companions] if with_companions else [])
    older = (profile.age or 0) >= 70 or profile.needs_rest_breaks
    mode = next((m for m in profile.transport if m in ("walk", "auto", "car")), "auto")
    return TravelerState(
        lat=lat, lon=lon, window_start=now, window_end=now + timedelta(hours=3),
        budget_inr=BUDGET_PER_PERSON[profile.budget_style or "mid"] * len(group),
        group=group, mode=mode, pace="relaxed" if older else profile.pace,
        avoid=profile.dislikes,
        avoid_crowds=profile.avoid_crowds, novelty=0.6 if profile.hidden_gems else 0.15,
        learned={t: w for t, w in learned.items() if t not in NOT_TASTE},
    )


def from_message(intents: list[str], avoid: list[str]) -> dict[str, float]:
    """A chat message nudges the stored context a little: asked-for +0.1, refused -0.2."""
    return {**{t: CHAT_STEP for t in intents if t not in NOT_TASTE},
            **{t: AVOID_STEP for t in avoid}}


def from_import(intents: list[str], avoid: list[str]) -> dict[str, float]:
    """A past itinerary counts more than one message: it's what they actually chose to do."""
    return {**{t: IMPORT_STEP for t in intents if t not in NOT_TASTE and t != "iconic"},
            **{t: IMPORT_AVOID for t in avoid}}
