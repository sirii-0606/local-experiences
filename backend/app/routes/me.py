"""The signed-in user's own data: profile (onboarding), password, export, delete."""
from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app import accounts
from app.routes.deps import clear_session_cookie, csrf, current_user, session_token
from app.schemas import DeleteAccount, PasswordChange, Profile

router = APIRouter(prefix="/me", tags=["me"], dependencies=[Depends(csrf)])


@router.get("/profile")
def get_profile(user: dict = Depends(current_user)) -> Profile:
    p = accounts.get_profile(user["id"])
    if p is None:  # not onboarded yet: a starting point, not saved
        return Profile(display_name=user["display_name"])
    return p


@router.put("/profile")
def put_profile(profile: Profile, user: dict = Depends(current_user)) -> Profile:
    accounts.put_profile(user["id"], profile)
    return profile


@router.put("/password", status_code=204)
def change_password(req: PasswordChange, request: Request,
                    user: dict = Depends(current_user)) -> None:
    if not accounts.verify_password(req.current_password, user["password_hash"]):
        raise HTTPException(403, "current password is wrong")
    accounts.update(user["id"], password_hash=accounts.hash_password(req.new_password))
    accounts.end_all_sessions(user["id"], keep=session_token(request))  # sign out other devices


@router.get("/export")
def export(user: dict = Depends(current_user)) -> dict:
    return accounts.export(user["id"])


@router.delete("", status_code=204)
def delete_me(req: DeleteAccount, response: Response, user: dict = Depends(current_user)) -> None:
    if not accounts.verify_password(req.password, user["password_hash"]):
        raise HTTPException(403, "password is wrong")
    if user["role"] == "admin" and accounts.admin_count() <= 1:
        raise HTTPException(409, "you're the last admin; make someone else admin first")
    accounts.delete(user["id"])
    clear_session_cookie(response)
