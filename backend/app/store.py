"""SQLite (stdlib) for what changes at runtime: provider listings and their owners, pauses,
ratings, bookings, feedback and the demand log.

The curated JSON seed stays read-only; `current_seed()` overlays provider data and traveler
ratings on top of it, so the engine never knows the difference. Stored rows are aggregates
only: no location, no free text, no traveler identity (mvp-scope.md privacy stance).
New tables are separate `create table if not exists` statements so older demo DBs keep working.
"""
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
from contextlib import closing
from datetime import date, datetime, timedelta
from pathlib import Path

from app.engine.confidence import with_ratings
from app.models import Experience, Place, Provider, TravelerState
from app.seed import Seed

SCHEMA = """
create table if not exists listings (
    id text primary key, provider text not null, place text not null,
    experience text not null, created_at text not null);
create table if not exists owners (experience_id text primary key, token_hash text not null);
create table if not exists paused (experience_id text primary key);
create table if not exists demand (
    id integer primary key, at text not null, start_hour integer, duration_min integer,
    budget_inr integer, group_size integer, has_kids integer,
    intents text, shown text, excluded text);
create table if not exists feedback (
    id integer primary key, at text not null, experience_id text not null,
    kind text not null, reason text);
create table if not exists ratings (
    id integer primary key, at text not null, experience_id text not null,
    rating integer not null, as_described integer);
create table if not exists bookings (
    code text primary key, at text not null, experience_id text not null,
    start text not null, people integer not null);
create table if not exists cache (key text primary key, at text not null, json text not null);
create table if not exists areas (
    id integer primary key, lat real not null, lon real not null, km real not null,
    at text not null, source text not null, json text not null);
"""
DEFAULT_DB = Path(__file__).resolve().parents[1] / "data" / "local.db"


def db_path() -> Path:
    p = Path(os.environ.get("DB_PATH", DEFAULT_DB))
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def _run(sql: str, args: tuple = ()) -> list[tuple]:
    with closing(sqlite3.connect(db_path(), timeout=10)) as c:
        c.execute("pragma journal_mode=wal")
        c.executescript(SCHEMA)
        rows = c.execute(sql, args).fetchall()
        c.commit()
        return rows


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ---------------------------------------------------------------- provider listings + owners

def add_listing(provider: Provider, place: Place, exp: Experience) -> str:
    """Store a new listing; returns its secret edit token (shown to the provider once)."""
    token = secrets.token_urlsafe(18)
    _run("insert into listings values (?, ?, ?, ?, ?)",
         (exp.id, provider.model_dump_json(), place.model_dump_json(), exp.model_dump_json(),
          _now()))
    _run("insert into owners values (?, ?)", (exp.id, _hash(token)))
    return token


def update_listing(provider: Provider, place: Place, exp: Experience) -> None:
    _run("update listings set provider = ?, place = ?, experience = ? where id = ?",
         (provider.model_dump_json(), place.model_dump_json(), exp.model_dump_json(), exp.id))


def delete_listing(experience_id: str) -> None:
    for table, col in (("listings", "id"), ("owners", "experience_id"),
                       ("paused", "experience_id")):
        _run(f"delete from {table} where {col} = ?", (experience_id,))


def get_listing(experience_id: str) -> tuple[Provider, Place, Experience] | None:
    rows = _run("select provider, place, experience from listings where id = ?",
                (experience_id,))
    if not rows:
        return None
    pv, pl, ex = rows[0]
    return (Provider.model_validate_json(pv), Place.model_validate_json(pl),
            Experience.model_validate_json(ex))


def is_listing(experience_id: str) -> bool:
    return bool(_run("select 1 from listings where id = ?", (experience_id,)))


def owns(experience_id: str, token: str | None) -> bool:
    rows = _run("select token_hash from owners where experience_id = ?", (experience_id,))
    return bool(rows and token) and hmac.compare_digest(rows[0][0], _hash(token))


def listing_ids() -> list[str]:
    return [r[0] for r in _run("select id from listings order by created_at")]


def set_paused(experience_id: str, paused: bool) -> None:
    if paused:
        _run("insert or ignore into paused values (?)", (experience_id,))
    else:
        _run("delete from paused where experience_id = ?", (experience_id,))


def paused_ids() -> set[str]:
    return {r[0] for r in _run("select experience_id from paused")}


# ---------------------------------------------------------------- ratings

def add_rating(experience_id: str, rating: int, as_described: bool | None, at: datetime) -> None:
    _run("insert into ratings (at, experience_id, rating, as_described) values (?, ?, ?, ?)",
         (at.isoformat(timespec="seconds"), experience_id, rating,
          None if as_described is None else int(as_described)))


def ratings() -> dict[str, list[tuple[date, int, bool | None]]]:
    out: dict[str, list] = {}
    for at, eid, rating, described in _run(
            "select at, experience_id, rating, as_described from ratings"):
        ok = None if described is None else bool(described)
        out.setdefault(eid, []).append((datetime.fromisoformat(at).date(), rating, ok))
    return out


# ---------------------------------------------------------------- bookings

def booked(experience_id: str, start: datetime) -> int:
    rows = _run("select coalesce(sum(people), 0) from bookings"
                " where experience_id = ? and start = ?",
                (experience_id, start.isoformat(timespec="minutes")))
    return rows[0][0]


def add_booking(experience_id: str, start: datetime, people: int) -> str:
    code = "LE-" + secrets.token_hex(3).upper()
    _run("insert into bookings values (?, ?, ?, ?, ?)",
         (code, _now(), experience_id, start.isoformat(timespec="minutes"), people))
    return code


def cancel_booking(code: str) -> bool:
    if not _run("select 1 from bookings where code = ?", (code,)):
        return False
    _run("delete from bookings where code = ?", (code,))
    return True


def booked_people(experience_id: str) -> int:
    return _run("select coalesce(sum(people), 0) from bookings where experience_id = ?",
                (experience_id,))[0][0]


# ---------------------------------------------------------------- the served seed

def current_seed(base: Seed) -> Seed:
    """Seed + provider listings + traveler ratings. Paused experiences keep their data but have
    no availability, so discovery skips them and replanning treats a paused stop as unavailable."""
    providers, places, exps = dict(base.providers), dict(base.places), dict(base.experiences)
    for pv, pl, ex in _run("select provider, place, experience from listings"):
        e = Experience.model_validate_json(ex)
        providers[e.provider_id] = Provider.model_validate_json(pv)
        places[e.place_id] = Place.model_validate_json(pl)
        exps[e.id] = e
    for eid, rows in ratings().items():
        if eid in exps:
            exps[eid] = with_ratings(exps[eid], rows)
    for eid in paused_ids() & exps.keys():
        exps[eid] = exps[eid].model_copy(update={"availability": []})
    return Seed(providers, places, exps, stays=dict(base.stays))


# ---------------------------------------------------------------- demand + feedback logs

def log_demand(state: TravelerState, shown: list[str], excluded: dict[str, list[str]]) -> None:
    _run("insert into demand (at, start_hour, duration_min, budget_inr, group_size, has_kids,"
         " intents, shown, excluded) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
         (_now(), state.window_start.hour,
          int((state.window_end - state.window_start).total_seconds() // 60), state.budget_inr,
          len(state.group), int(any(t.age < 16 for t in state.group)),
          json.dumps(state.intents), json.dumps(shown), json.dumps(excluded)))


def log_feedback(experience_id: str, kind: str, reason: str | None) -> None:
    _run("insert into feedback (at, experience_id, kind, reason) values (?, ?, ?, ?)",
         (_now(), experience_id, kind, reason))


def feedback_rows(experience_id: str) -> list[tuple[str, str | None]]:
    return _run("select kind, reason from feedback where experience_id = ?", (experience_id,))


def demand_rows() -> list[dict]:
    cols = ["start_hour", "duration_min", "budget_inr", "group_size", "has_kids", "intents",
            "shown", "excluded"]
    rows = _run(f"select {', '.join(cols)} from demand")
    out = [dict(zip(cols, r, strict=True)) for r in rows]
    for row in out:
        for k in ("intents", "shown", "excluded"):
            row[k] = json.loads(row[k])
    return out


# ---------------------------------------------------------------- open-data cache (opendata.py)
# Public place data and geocodes only: never a traveler's location or text.

def cache_get(key: str, max_days: int):
    rows = _run("select at, json from cache where key = ?", (key,))
    if not rows or datetime.fromisoformat(rows[0][0]) < datetime.now() - timedelta(days=max_days):
        return None
    return json.loads(rows[0][1])


def cache_put(key: str, value) -> None:
    _run("insert or replace into cache values (?, ?, ?)", (key, _now(), json.dumps(value)))


def area_put(lat: float, lon: float, km: float, source: str, items: list[dict]) -> None:
    _run("insert into areas (lat, lon, km, at, source, json) values (?, ?, ?, ?, ?, ?)",
         (lat, lon, km, _now(), source, json.dumps(items)))


def area_near(lat: float, lon: float, within_km: float,
              max_days: int) -> tuple[list[dict], str, datetime] | None:
    """The freshest cached area whose centre is within `within_km` of the point:
    (places, source, fetched at)."""
    from app.engine.feasibility import km_between
    since = (datetime.now() - timedelta(days=max_days)).isoformat(timespec="seconds")
    rows = _run("select lat, lon, source, json, at from areas where at > ? order by at desc",
                (since,))
    for a_lat, a_lon, source, items, at in rows:
        if km_between(lat, lon, a_lat, a_lon) <= within_km:
            return json.loads(items), source, datetime.fromisoformat(at)
    return None
