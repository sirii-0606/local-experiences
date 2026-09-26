"""Shared FastAPI dependencies for the v2 website routers: session user, roles, CSRF guard."""

from fastapi import Depends, HTTPException, Request, Response

from app import accounts
from app.schemas import Role

COOKIE = "le_session"
CSRF_HEADER = "x-requested-with"


def csrf(request: Request) -> None:
    """Cookie auth + SameSite=Lax already blocks most cross-site writes; a custom header that
    browsers only send from our own JS closes the rest (forms can't set it)."""
    writing = request.method not in ("GET", "HEAD", "OPTIONS")
    if writing and request.headers.get(CSRF_HEADER) != "le":
        raise HTTPException(403, "missing X-Requested-With header")


def session_token(request: Request) -> str | None:
    return request.cookies.get(COOKIE)


def current_user(request: Request) -> dict:
    user = accounts.user_for(session_token(request))
    if user is None:
        raise HTTPException(401, "please sign in")
    return user


def require_role(*roles: Role):
    def check(user: dict = Depends(current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(403, "you don't have access to this")
        return user

    return check


def set_session_cookie(response: Response, request: Request, token: str) -> None:
    https = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
    response.set_cookie(
        COOKIE,
        token,
        max_age=accounts.SESSION_DAYS * 86400,
        httponly=True,
        samesite="lax",
        secure=https,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE, path="/")
