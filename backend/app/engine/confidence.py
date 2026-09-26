"""How much to trust one attribute of an experience (doc §6.3, §12.1)."""
from datetime import date

from app.models import Evidence, Experience, Provider

SOURCE_WEIGHT = {"verified": 1.0, "traveler": 0.7, "provider": 0.6, "estimate": 0.3}
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


CONFIRMED_BY_VISITS = ("availability", "price_inr")  # "it was on, at that price"


def with_ratings(exp: Experience, rows: list[tuple[date, int, bool | None]]) -> Experience:
    """Fold post-visit ratings into rating, review_count and evidence (doc §6.3).

    rows: (visit date, 1-5 stars, was it as described? None = not asked). When most visitors say
    it was as described, their latest visit becomes traveler evidence for hours and price,
    replacing provider claims and older traveler evidence, but never a verified check.
    ponytail: disputes only block the upgrade; they don't downgrade existing evidence.
    """
    if not rows:
        return exp
    total, n = sum(r for _, r, _ in rows), len(rows)
    rating = (total / n if exp.rating is None
              else (exp.rating * exp.review_count + total) / (exp.review_count + n))
    evidence = dict(exp.evidence)
    confirmed = [d for d, _, ok in rows if ok is not False]
    if len(confirmed) > n - len(confirmed):
        latest = max(confirmed)
        for attr in CONFIRMED_BY_VISITS:
            ev = evidence.get(attr)
            if ev is None or (ev.source != "verified" and ev.updated_at <= latest):
                evidence[attr] = Evidence(source="traveler", updated_at=latest)
    return exp.model_copy(update={"rating": round(rating, 2), "review_count": exp.review_count + n,
                                  "evidence": evidence})
