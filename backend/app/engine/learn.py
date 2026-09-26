"""Learning from feedback (doc §5.2 behavioural inference, §9.2 step 8).

Only signals about *taste* teach anything: "too expensive" or "too far" says nothing about
liking pottery, and suitability tags (who it's for, diet, time of day) are not taste either.
An explicit "not my thing" counts fully; a bare skip is inferred and counts ~0.3x (decisions.md).
"""
from app.models import Experience, Feedback, TravelerState

ACCEPT, NOT_MY_THING, NO_REASON = 0.3, -0.3, -0.1
NOT_TASTE = {"family", "kids", "vegetarian", "evening"}


def _step(fb: Feedback) -> float:
    if fb.kind == "accept":
        return ACCEPT
    if fb.reason == "not_interested":
        return NOT_MY_THING
    if fb.reason is None and fb.kind in ("reject", "skip"):
        return NO_REASON
    return 0.0  # practical reasons (price, distance, time) or ratings: no taste signal


def learn(state: TravelerState, exp: Experience, fb: Feedback) -> TravelerState:
    learned, rejected = dict(state.learned), list(state.rejected)
    if fb.kind == "reject" and exp.id not in rejected:
        rejected.append(exp.id)
    if step := _step(fb):
        for t in set(exp.tags) - NOT_TASTE:
            learned[t] = round(max(-1.0, min(1.0, learned.get(t, 0.0) + step)), 2)
    return state.model_copy(update={"learned": learned, "rejected": rejected})
