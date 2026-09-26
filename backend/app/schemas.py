"""Contract for the v2 website endpoints (accounts, profile, admin; trips from P3).

Contract-first: the frontend builds against these shapes (mirrored in frontend/src/types.ts,
mocked in frontend/src/mocks/) while the backend behind them is still evolving.
The OpenAPI snapshot in docs/openapi.json is checked by tests/test_contract.py.
"""
import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.models import Access, Tag

Role = Literal["traveler", "provider", "admin"]
Diet = Literal["vegetarian", "non_vegetarian", "vegan", "jain"]
Mode = Literal["walk", "auto", "bus", "car"]
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _email(v: str) -> str:
    v = v.strip().lower()
    if len(v) > 254 or not EMAIL_RE.match(v):
        raise ValueError("enter a valid email address")
    return v


class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=60)
    _norm = field_validator("email")(_email)


class LoginRequest(BaseModel):
    email: str
    password: str = Field(max_length=128)
    _norm = field_validator("email")(_email)


class User(BaseModel):
    id: int
    email: str
    role: Role
    display_name: str
    created: datetime
    onboarded: bool  # has saved a profile (P2 onboarding)


class Companion(BaseModel):
    """A person the user often travels with; reused when planning trips (P3)."""
    name: str = Field(min_length=1, max_length=60)
    age: int | None = Field(default=None, ge=0, le=110)
    interests: list[Tag] = []
    dislikes: list[Tag] = []
    accessibility: list[Access] = []
    diet: Diet | None = None


class Profile(BaseModel):
    """Everything used to personalise recommendations. All optional except the name.
    Sensitive fields (age, accessibility, diet) are owner-only: never shown to admins/providers."""
    display_name: str = Field(min_length=1, max_length=60)
    age: int | None = Field(default=None, ge=0, le=110)
    home_city: str | None = Field(default=None, max_length=60)
    interests: list[Tag] = []
    dislikes: list[Tag] = []
    accessibility: list[Access] = []
    walking_limit_km: float | None = Field(default=None, ge=0, le=50)
    needs_rest_breaks: bool = False
    diet: Diet | None = None
    pace: Literal["relaxed", "normal", "packed"] = "normal"
    budget_style: Literal["budget", "mid", "premium"] | None = None
    transport: list[Mode] = []
    languages: list[str] = Field(default=[], max_length=10)
    companions: list[Companion] = Field(default=[], max_length=20)


class PasswordChange(BaseModel):
    current_password: str = Field(max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class DeleteAccount(BaseModel):
    password: str = Field(max_length=128)  # re-confirm: deleting is permanent


class AdminUserRow(BaseModel):
    """What an admin may see about a user: account facts only, never profile data."""
    id: int
    email: str
    role: Role
    display_name: str
    disabled: bool
    created: datetime
    last_login: datetime | None


class AdminUserPatch(BaseModel):
    role: Role | None = None
    disabled: bool | None = None
    temp_password: str | None = Field(default=None, min_length=8, max_length=128)


class AdminStats(BaseModel):
    users: int
    admins: int
    providers: int
    disabled: int
    active_sessions: int
    provider_listings: int
