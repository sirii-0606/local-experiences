"""The signed-in user's trips (P3): list, create, open, edit/rename, delete.
Scoring, shortlist, stays and itineraries build on these in P4-P6."""
from fastapi import APIRouter, Depends, HTTPException

from app import accounts
from app.routes.deps import csrf, current_user
from app.schemas import Trip, TripDraft

router = APIRouter(prefix="/trips", tags=["trips"], dependencies=[Depends(csrf)])


def _check_must_see(draft: TripDraft) -> None:
    from app.main import seed  # lazy: main mounts this router, so a top-level import would cycle
    unknown = sorted(set(draft.must_see) - set(seed().experiences))
    if unknown:
        raise HTTPException(422, f"unknown experiences: {', '.join(unknown)}")


def _found(trip: Trip | None) -> Trip:
    if trip is None:
        raise HTTPException(404, "no such trip")
    return trip


@router.get("")
def list_trips(user: dict = Depends(current_user)) -> list[Trip]:
    return accounts.list_trips(user["id"])


@router.post("", status_code=201)
def create_trip(draft: TripDraft, user: dict = Depends(current_user)) -> Trip:
    _check_must_see(draft)
    return accounts.create_trip(user["id"], draft)


@router.get("/{trip_id}")
def get_trip(trip_id: int, user: dict = Depends(current_user)) -> Trip:
    return _found(accounts.get_trip(user["id"], trip_id))


@router.put("/{trip_id}")
def update_trip(trip_id: int, draft: TripDraft, user: dict = Depends(current_user)) -> Trip:
    _found(accounts.get_trip(user["id"], trip_id))
    _check_must_see(draft)
    return _found(accounts.update_trip(user["id"], trip_id, draft))


@router.delete("/{trip_id}", status_code=204)
def delete_trip(trip_id: int, user: dict = Depends(current_user)) -> None:
    if not accounts.delete_trip(user["id"], trip_id):
        raise HTTPException(404, "no such trip")
