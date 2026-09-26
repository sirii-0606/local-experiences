"""Sign up, sign in, sign out, who am I."""
from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app import accounts
from app.routes.deps import (
    clear_session_cookie,
    csrf,
    current_user,
    session_token,
    set_session_cookie,
)
from app.schemas import LoginRequest, RegisterRequest, User

router = APIRouter(prefix="/auth", tags=["auth"], dependencies=[Depends(csrf)])


def _ip(request: Request) -> str:
    return request.client.host if request.client else "?"


@router.post("/register", status_code=201)
def register(req: RegisterRequest, request: Request, response: Response) -> User:
    if accounts.get_by_email(req.email):
        raise HTTPException(409, "an account with this email already exists")
    user = accounts.create(req.email, req.password, req.display_name.strip())
    set_session_cookie(response, request, accounts.new_session(user["id"]))
    return accounts.public(user)


@router.post("/login")
def login(req: LoginRequest, request: Request, response: Response) -> User:
    accounts.bootstrap_admin_from_env()  # idempotent; lets the env-configured admin sign in
    ip = _ip(request)
    if wait := accounts.throttled(req.email, ip):
        raise HTTPException(429, f"too many attempts; try again in {wait // 60 + 1} min")
    user = accounts.get_by_email(req.email)
    if user is None or not accounts.verify_password(req.password, user["password_hash"]):
        accounts.record_failure(req.email, ip)
        raise HTTPException(401, "wrong email or password")  # same message: don't reveal accounts
    if user["disabled"]:
        raise HTTPException(403, "this account is disabled; contact an admin")
    accounts.clear_failures(req.email, ip)
    set_session_cookie(response, request, accounts.new_session(user["id"]))
    return accounts.public(user)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response) -> None:
    accounts.end_session(session_token(request))
    clear_session_cookie(response)


@router.get("/me")
def me(user: dict = Depends(current_user)) -> User:
    return accounts.public(user)
