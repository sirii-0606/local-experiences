"""How much to trust one attribute of an experience (doc §6.3, §12.1)."""
from datetime import date

from app.models import Experience, Provider

SOURCE_WEIGHT = {"verified": 1.0, "traveler": 0.7, "provider": 0.6}
HALF_LIFE_DAYS = 90
LOW_CONFIDENCE = 0.5


def attr_confidence(exp: Experience, provider: Provider, attr: str, today: date) -> float:
    ev = exp.evidence.get(attr)
    if ev is None:
        # No explicit evidence: fall back to provider verification + review volume as corroboration.
        # ponytail: same fallback for every attribute; reviews say little about accessibility.
        return (0.5 if provider.verified else 0.35) + min(0.25, exp.review_count / 2000)
    age = max(0, (today - ev.updated_at).days)
    # Decays toward half the source weight, never to zero: old info is weak, not worthless.
    return SOURCE_WEIGHT[ev.source] * (0.5 + 0.5 * 0.5 ** (age / HALF_LIFE_DAYS))
