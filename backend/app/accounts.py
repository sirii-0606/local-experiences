"""Accounts: users, password hashing, sessions, profiles, trips (stdlib: hashlib.scrypt + sqlite3).

Passwords: scrypt (n=2^14, r=8, p=1) with a random 16-byte salt, compared in constant time.
Sessions: random 32-byte tokens; only their sha256 is stored, 7-day expiry, revocable.
Never log passwords, tokens or profile contents.
"""

import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from collections import defaultdict, deque
from contextlib import closing
from datetime import datetime, timedelta

from app.schemas import AdminStats, AdminUserRow, Profile, Role, Trip, TripDraft, User
from app.store import db_path

SCHEMA = """
create table if not exists users (
    id integer primary key autoincrement, email text unique not null, password_hash text not null,
    role text not null, display_name text not null, disabled integer not null default 0,
    created text not null, last_login text);
create table if not exists sessions (
    token_hash text primary key, user_id integer not null, expires text not null);
create table if not exists profiles (user_id integer primary key, json text not null);
create table if not exists trips (
    id integer primary key autoincrement, user_id integer not null,
    created text not null, updated text not null, json text not null);
"""
SESSION_DAYS = 7
SCRYPT = {"n": 2**14, "r": 8, "p": 1}


def _db(sql: str, args: tuple = ()) -> tuple[list[tuple], int | None]:
    """(rows, lastrowid). New tables live beside store.py's in the same SQLite file."""
    with closing(sqlite3.connect(db_path(), timeout=10)) as c:
        c.execute("pragma journal_mode=wal")
        c.executescript(SCHEMA)
        cur = c.execute(sql, args)
        rows = cur.fetchall()
        c.commit()
        return rows, cur.lastrowid


def _now() -> datetime:
    return datetime.now().replace(microsecond=0)


def _sha(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ---------------------------------------------------------------- passwords


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, **SCRYPT)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt, digest = stored.split("$")
    except ValueError:
        return False
    candidate = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), **SCRYPT)
    return hmac.compare_digest(candidate.hex(), digest)


# ---------------------------------------------------------------- users

COLS = "id, email, role, display_name, disabled, created, last_login, password_hash"


def _row(r: tuple) -> dict:
    keys = [
        "id",
        "email",
        "role",
        "display_name",
        "disabled",
        "created",
        "last_login",
        "password_hash",
    ]
    return dict(zip(keys, r, strict=True))


def get_by_email(email: str) -> dict | None:
    rows, _ = _db(f"select {COLS} from users where email = ?", (email,))
    return _row(rows[0]) if rows else None


def get(user_id: int) -> dict | None:
    rows, _ = _db(f"select {COLS} from users where id = ?", (user_id,))
    return _row(rows[0]) if rows else None


def create(email: str, password: str, display_name: str, role: Role = "traveler") -> dict:
    _, uid = _db(
        "insert into users (email, password_hash, role, display_name, created)"
        " values (?, ?, ?, ?, ?)",
        (email, hash_password(password), role, display_name, _now().isoformat()),
    )
    return get(uid)


def update(user_id: int, **fields) -> None:
    allowed = {"role", "display_name", "disabled", "last_login", "password_hash"}
    sets = {k: v for k, v in fields.items() if k in allowed}
    if sets:
        _db(
            f"update users set {', '.join(f'{k} = ?' for k in sets)} where id = ?",
            (*sets.values(), user_id),
        )


def delete(user_id: int) -> None:
    for sql in (
        "delete from sessions where user_id = ?",
        "delete from profiles where user_id = ?",
        "delete from trips where user_id = ?",
        "delete from users where id = ?",
    ):
        _db(sql, (user_id,))


def public(u: dict) -> User:
    return User(
        id=u["id"],
        email=u["email"],
        role=u["role"],
        display_name=u["display_name"],
        created=datetime.fromisoformat(u["created"]),
        onboarded=get_profile(u["id"]) is not None,
    )


def admin_row(u: dict) -> AdminUserRow:
    return AdminUserRow(
        id=u["id"],
        email=u["email"],
        role=u["role"],
        display_name=u["display_name"],
        disabled=bool(u["disabled"]),
        created=datetime.fromisoformat(u["created"]),
        last_login=(datetime.fromisoformat(u["last_login"]) if u["last_login"] else None),
    )


def list_all() -> list[dict]:
    rows, _ = _db(f"select {COLS} from users order by id")
    return [_row(r) for r in rows]


def admin_count() -> int:
    return _db("select count(*) from users where role = 'admin' and disabled = 0")[0][0][0]


def bootstrap_admin_from_env() -> None:
    """ADMIN_EMAIL + ADMIN_PASSWORD create the admin if missing (never a default in code).
    An existing account with that email is (re)made an enabled admin; its password is kept."""
    email, password = (
        os.environ.get("ADMIN_EMAIL", "").strip().lower(),
        os.environ.get("ADMIN_PASSWORD", ""),
    )
    if not email or len(password) < 8:
        return
    u = get_by_email(email)
    if u is None:
        create(email, password, "Admin", "admin")
    elif u["role"] != "admin" or u["disabled"]:
        update(u["id"], role="admin", disabled=0)


# ---------------------------------------------------------------- sessions


def new_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    expires = (_now() + timedelta(days=SESSION_DAYS)).isoformat()
    _db("insert into sessions values (?, ?, ?)", (_sha(token), user_id, expires))
    update(user_id, last_login=_now().isoformat())
    return token


def user_for(token: str | None) -> dict | None:
    if not token:
        return None
    rows, _ = _db("select user_id, expires from sessions where token_hash = ?", (_sha(token),))
    if not rows or datetime.fromisoformat(rows[0][1]) < _now():
        return None
    u = get(rows[0][0])
    return None if u is None or u["disabled"] else u


def end_session(token: str | None) -> None:
    if token:
        _db("delete from sessions where token_hash = ?", (_sha(token),))


def end_all_sessions(user_id: int, keep: str | None = None) -> None:
    if keep:
        _db("delete from sessions where user_id = ? and token_hash != ?", (user_id, _sha(keep)))
    else:
        _db("delete from sessions where user_id = ?", (user_id,))


def expire_session_for_test(token: str) -> None:
    _db(
        "update sessions set expires = ? where token_hash = ?",
        ((_now() - timedelta(seconds=1)).isoformat(), _sha(token)),
    )


# ---------------------------------------------------------------- profiles


def get_profile(user_id: int) -> Profile | None:
    rows, _ = _db("select json from profiles where user_id = ?", (user_id,))
    return Profile.model_validate_json(rows[0][0]) if rows else None


def put_profile(user_id: int, profile: Profile) -> None:
    _db(
        "insert into profiles values (?, ?)"
        " on conflict(user_id) do update set json = excluded.json",
        (user_id, profile.model_dump_json()),
    )
    update(user_id, display_name=profile.display_name)


def export(user_id: int) -> dict:
    """Everything we hold about this user (right of access). No password hash, no tokens."""
    u = get(user_id)
    p = get_profile(user_id)
    return {
        "account": public(u).model_dump(mode="json"),
        "profile": json.loads(p.model_dump_json()) if p else None,
        "trips": [t.model_dump(mode="json") for t in list_trips(user_id)],
    }


# ---------------------------------------------------------------- trips (P3)
# Stored as the TripDraft JSON; id, owner and timestamps are columns. Every query is scoped to
# the owner, so another user's trip id simply doesn't exist for you.


def _trip(r: tuple) -> Trip:
    return Trip(id=r[0], created=r[1], updated=r[2], **json.loads(r[3]))


def list_trips(user_id: int) -> list[Trip]:
    rows, _ = _db("select id, created, updated, json from trips where user_id = ?", (user_id,))
    return sorted((_trip(r) for r in rows), key=lambda t: (t.start_date, t.id))


def get_trip(user_id: int, trip_id: int) -> Trip | None:
    rows, _ = _db(
        "select id, created, updated, json from trips where id = ? and user_id = ?",
        (trip_id, user_id),
    )
    return _trip(rows[0]) if rows else None


def create_trip(user_id: int, draft: TripDraft) -> Trip:
    now = _now().isoformat()
    _, tid = _db(
        "insert into trips (user_id, created, updated, json) values (?, ?, ?, ?)",
        (user_id, now, now, draft.model_dump_json()),
    )
    return get_trip(user_id, tid)


def update_trip(user_id: int, trip_id: int, draft: TripDraft) -> Trip | None:
    _db(
        "update trips set updated = ?, json = ? where id = ? and user_id = ?",
        (_now().isoformat(), draft.model_dump_json(), trip_id, user_id),
    )
    return get_trip(user_id, trip_id)


def delete_trip(user_id: int, trip_id: int) -> bool:
    found = get_trip(user_id, trip_id) is not None
    _db("delete from trips where id = ? and user_id = ?", (trip_id, user_id))
    return found


# ---------------------------------------------------------------- stats + login throttle


def stats(provider_listings: int) -> AdminStats:
    users = list_all()
    sessions = _db("select count(*) from sessions where expires > ?", (_now().isoformat(),))[0]
    return AdminStats(
        users=len(users),
        admins=sum(u["role"] == "admin" for u in users),
        providers=sum(u["role"] == "provider" for u in users),
        disabled=sum(bool(u["disabled"]) for u in users),
        active_sessions=sessions[0][0],
        provider_listings=provider_listings,
    )


MAX_FAILURES, WINDOW_S = 5, 15 * 60
_failures: dict[tuple[str, str], deque] = defaultdict(deque)


def throttled(email: str, ip: str) -> int:
    """Seconds until another attempt is allowed (0 = allowed).
    ponytail: in-memory, per process; move to SQLite/Redis if the API ever runs multi-process."""
    q, now = _failures[(email, ip)], time.monotonic()
    while q and now - q[0] > WINDOW_S:
        q.popleft()
    return int(WINDOW_S - (now - q[0])) + 1 if len(q) >= MAX_FAILURES else 0


def record_failure(email: str, ip: str) -> None:
    _failures[(email, ip)].append(time.monotonic())


def clear_failures(email: str, ip: str) -> None:
    _failures.pop((email, ip), None)
