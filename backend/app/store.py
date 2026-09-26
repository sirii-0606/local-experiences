"""SQLite (stdlib) for what changes at runtime: provider listings, pauses, and the demand log.

The curated JSON seed stays read-only; `current_seed()` overlays provider data on top of it,
so the engine never knows the difference. Demand rows are aggregates only: no location, no
free text, no identity (mvp-scope.md privacy stance).
"""
import json
import os
import sqlite3
from contextlib import closing
from datetime import datetime
from pathlib import Path

from app.models import Experience, Place, Provider, TravelerState
from app.seed import Seed

SCHEMA = """
create table if not exists listings (
    id text primary key, provider text not null, place text not null,
    experience text not null, created_at text not null);
create table if not exists paused (experience_id text primary key);
create table if not exists demand (
    id integer primary key, at text not null, start_hour integer, duration_min integer,
    budget_inr integer, group_size integer, has_kids integer,
    intents text, shown text, excluded text);
"""


DEFAULT_DB = Path(__file__).resolve().parents[1] / "data" / "local.db"


def db_path() -> Path:
    return Path(os.environ.get("DB_PATH", DEFAULT_DB))


def _run(sql: str, args: tuple = ()) -> list[tuple]:
    with closing(sqlite3.connect(db_path())) as c:
        c.executescript(SCHEMA)
        rows = c.execute(sql, args).fetchall()
        c.commit()
        return rows


def add_listing(provider: Provider, place: Place, exp: Experience) -> None:
    _run("insert into listings values (?, ?, ?, ?, ?)",
         (exp.id, provider.model_dump_json(), place.model_dump_json(), exp.model_dump_json(),
          datetime.now().isoformat(timespec="seconds")))


def listing_ids() -> list[str]:
    return [r[0] for r in _run("select id from listings order by created_at")]


def set_paused(experience_id: str, paused: bool) -> None:
    if paused:
        _run("insert or ignore into paused values (?)", (experience_id,))
    else:
        _run("delete from paused where experience_id = ?", (experience_id,))


def paused_ids() -> set[str]:
    return {r[0] for r in _run("select experience_id from paused")}


def current_seed(base: Seed) -> Seed:
    """Seed + provider listings; paused experiences keep their data but have no availability,
    so discovery skips them and replanning treats a paused stop as unavailable."""
    providers, places, exps = dict(base.providers), dict(base.places), dict(base.experiences)
    for pv, pl, ex in _run("select provider, place, experience from listings"):
        e = Experience.model_validate_json(ex)
        providers[e.provider_id] = Provider.model_validate_json(pv)
        places[e.place_id] = Place.model_validate_json(pl)
        exps[e.id] = e
    for eid in paused_ids() & exps.keys():
        exps[eid] = exps[eid].model_copy(update={"availability": []})
    return Seed(providers, places, exps)


def log_demand(state: TravelerState, shown: list[str], excluded: dict[str, list[str]]) -> None:
    _run("insert into demand (at, start_hour, duration_min, budget_inr, group_size, has_kids,"
         " intents, shown, excluded) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
         (datetime.now().isoformat(timespec="seconds"), state.window_start.hour,
          int((state.window_end - state.window_start).total_seconds() // 60), state.budget_inr,
          len(state.group), int(any(t.age < 16 for t in state.group)),
          json.dumps(state.intents), json.dumps(shown), json.dumps(excluded)))


def demand_rows() -> list[dict]:
    cols = ["start_hour", "duration_min", "budget_inr", "group_size", "has_kids", "intents",
            "shown", "excluded"]
    rows = _run(f"select {', '.join(cols)} from demand")
    out = [dict(zip(cols, r, strict=True)) for r in rows]
    for row in out:
        for k in ("intents", "shown", "excluded"):
            row[k] = json.loads(row[k])
    return out
