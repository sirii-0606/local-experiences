"""Admin: users (account facts only, never profile data), roles, disabling, stats."""

from fastapi import APIRouter, Depends, HTTPException

from app import accounts, store
from app.routes.deps import csrf, require_role
from app.schemas import AdminStats, AdminUserPatch, AdminUserRow

router = APIRouter(
    prefix="/admin", tags=["admin"], dependencies=[Depends(csrf), Depends(require_role("admin"))]
)


@router.get("/users")
def users() -> list[AdminUserRow]:
    return [accounts.admin_row(u) for u in accounts.list_all()]


@router.patch("/users/{user_id}")
def patch_user(
    user_id: int, patch: AdminUserPatch, me: dict = Depends(require_role("admin"))
) -> AdminUserRow:
    u = accounts.get(user_id)
    if u is None:
        raise HTTPException(404, "no such user")
    losing_admin = u["role"] == "admin" and (patch.role not in (None, "admin") or patch.disabled)
    if losing_admin and accounts.admin_count() <= 1:
        raise HTTPException(409, "that's the last admin; make someone else admin first")
    if user_id == me["id"] and patch.disabled:
        raise HTTPException(409, "you can't disable your own account")
    if patch.role is not None:
        accounts.update(user_id, role=patch.role)
    if patch.disabled is not None:
        accounts.update(user_id, disabled=int(patch.disabled))
        if patch.disabled:
            accounts.end_all_sessions(user_id)
    if patch.temp_password:  # stands in for "forgot password" until there's an email service
        accounts.update(user_id, password_hash=accounts.hash_password(patch.temp_password))
        accounts.end_all_sessions(user_id)
    return accounts.admin_row(accounts.get(user_id))


@router.get("/stats")
def stats() -> AdminStats:
    return accounts.stats(provider_listings=len(store.listing_ids()))
