"""Reviews, verified (engine/reviews.py): post one, read an experience's reviews with the
trust report, or check any batch of reviews (e.g. pasted from another site) without saving.

A review linked to a booking made here, after the booked visit, is a verified visit.
"""

from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app import store
from app.engine.reviews import Review, ReviewCheck, ReviewReport, check
from app.intent import now_ist

router = APIRouter(prefix="/reviews", tags=["reviews"])
EXPERIENCE_ID = r"^ex-[\w.-]{1,80}$"


class ReviewIn(BaseModel):
    experience_id: str = Field(pattern=EXPERIENCE_ID)
    rating: int = Field(ge=1, le=5)
    text: str = Field(default="", max_length=2000)
    at: datetime | None = None  # defaults to now
    booking_code: str | None = Field(default=None, max_length=20)


class ReviewPosted(BaseModel):
    review: ReviewCheck  # how this review was judged
    report: ReviewReport  # the experience's reviews after it


class ReviewDraft(BaseModel):
    at: datetime
    rating: int = Field(ge=1, le=5)
    text: str = Field(default="", max_length=2000)
    verified: bool = False


class ReviewBatch(BaseModel):
    reviews: list[ReviewDraft] = Field(max_length=500)


def _known(experience_id: str) -> None:
    from app.main import seed  # lazy: main mounts this router

    if experience_id not in seed().experiences and not experience_id.startswith("ex-od-"):
        raise HTTPException(422, f"unknown experience id: {experience_id}")


@router.post("")
def post_review(req: ReviewIn) -> ReviewPosted:
    _known(req.experience_id)
    at = req.at or now_ist()
    verified = False
    if req.booking_code:
        found = store.booking(req.booking_code)
        if found is None or found[0] != req.experience_id:
            raise HTTPException(422, "that booking code isn't for this experience")
        if at < found[1]:
            raise HTTPException(422, "you can review it after your visit")
        if store.booking_reviewed(req.booking_code):
            raise HTTPException(409, "this booking has already been reviewed")
        verified = True
    rid = store.add_review(
        req.experience_id, at, req.rating, req.text.strip(), req.booking_code, verified
    )
    report = check(store.reviews(req.experience_id).get(req.experience_id, []))
    return ReviewPosted(review=next(c for c in report.reviews if c.id == rid), report=report)


@router.get("/{experience_id}")
def get_reviews(experience_id: str) -> ReviewReport:
    return check(store.reviews(experience_id).get(experience_id, []))


@router.post("/check")
def check_batch(req: ReviewBatch) -> ReviewReport:
    """Nothing is saved: paste reviews from anywhere and see which look fake, and why."""
    return check([Review(id=str(i), **r.model_dump()) for i, r in enumerate(req.reviews)])
