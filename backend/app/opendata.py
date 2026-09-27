"""Open data for anywhere in India: geocoding and places, turned into the engine's own Seed.

- Geocoding: Open-Meteo's GeoNames search (no key), restricted to India.
- Places: Wikidata (typed items within a radius, with heritage designations), falling back to
  Wikipedia GeoSearch (classified from titles/descriptions) when Wikidata is busy.

This module only describes supply; the engine still decides. These sources have no opening hours
or prices, so both are filled with typical values for the kind of place and carry `estimate`
evidence: the engine flags them low confidence instead of passing them off as fact (doc §6.3).
A heritage designation (ASI Monument of National Importance, state protected, municipal list)
makes the site government-listed: a verified, formal provider.

Every fetch is cached in SQLite (the free services rate-limit hard, Wikidata to 1 query/min at
times), so each area is fetched once. LIVE_DATA=0 (tests) never touches the network.
"""

import json
import logging
import os
import re
import time as clock
import urllib.parse
import urllib.request
from datetime import date, datetime, time, timedelta
from functools import lru_cache

from app import store
from app.engine.feasibility import km_between
from app.models import AvailabilityWindow, Evidence, Experience, Place, Provider
from app.seed import Seed

log = logging.getLogger(__name__)
UA = {"User-Agent": "TrueLocal/1.0 (local-experiences hackathon)"}
AREA_KM = 15  # radius fetched around a point; a cached area serves points within AREA_KM - 5
CACHE_DAYS = 14
NEAR_KM = 40  # curated/provider experiences further than this from the traveler are left out
RETRY_S = 300  # after every source failed for an area, don't ask again for 5 minutes
FALLBACK_TTL = timedelta(hours=1)  # a Wikipedia fallback is replaced by Wikidata when it can be
# Areas fetched before this lack newer kinds of place (eateries): refreshed once, like a fallback.
KINDS_SINCE = datetime(2026, 9, 27, 10, 0)
NOT_PUBLIC = re.compile(r"\bclub\b|gymkhana", re.I)  # members-only, not somewhere to drop in
_failed: dict[tuple[float, float], float] = {}

# Wikidata classes (labels checked against wikidata.org) -> our kind of place.
KIND_BY_QID = {
    "Q40080": "beach",
    "Q787113": "promenade",
    "Q6017969": "viewpoint",
    "Q54050": "hill",
    "Q23397": "lake",
    "Q22698": "park",
    "Q1107656": "park",
    "Q167346": "park",
    "Q43501": "zoo",
    "Q33506": "museum",
    "Q2087181": "museum",
    "Q148319": "museum",
    "Q207694": "gallery",
    "Q1007870": "gallery",
    "Q57821": "fort",
    "Q57831": "fort",
    "Q1785071": "fort",
    "Q23413": "fort",
    "Q16560": "palace",
    "Q839954": "site",
    "Q35509": "site",
    "Q1473950": "site",
    "Q4989906": "monument",
    "Q5003624": "monument",
    "Q16748868": "monument",
    "Q44539": "worship",
    "Q842402": "worship",
    "Q16970": "worship",
    "Q2977": "worship",
    "Q32815": "worship",
    "Q34627": "worship",
    "Q337986": "worship",
    "Q1370598": "worship",
    "Q1010155": "ghat",
    "Q330284": "market",
    "Q219760": "market",
    "Q11707": "eatery",
    "Q30022": "eatery",
    "Q274393": "eatery",
    "Q55488": "station",
    "Q1248784": "airport",
}
# When an item is several kinds (a zoo that is also a park), the first one here wins.
PRIORITY = [
    "eatery",
    "station",
    "airport",
    "beach",
    "zoo",
    "museum",
    "gallery",
    "fort",
    "palace",
    "site",
    "monument",
    "worship",
    "ghat",
    "market",
    "promenade",
    "viewpoint",
    "hill",
    "lake",
    "park",
]
LANDMARK_KINDS = {"station", "airport"}  # places to get to, not experiences

# kind -> (category, tags, minutes, indoor, weather-sensitive, typical open, close, typical ₹)
TEMPLATES = {
    "museum": (
        "culture",
        ["museum", "history", "heritage", "learning"],
        90,
        True,
        False,
        "10:00",
        "17:30",
        50,
    ),
    "gallery": ("art", ["art", "museum"], 60, True, False, "11:00", "19:00", 0),
    "fort": (
        "culture",
        ["heritage", "history", "architecture", "photography"],
        90,
        False,
        True,
        "09:00",
        "17:30",
        25,
    ),
    "palace": (
        "culture",
        ["heritage", "history", "architecture"],
        60,
        True,
        False,
        "09:00",
        "17:30",
        25,
    ),
    "site": (
        "culture",
        ["heritage", "history", "photography"],
        60,
        False,
        True,
        "09:00",
        "17:30",
        25,
    ),
    "monument": (
        "culture",
        ["heritage", "history", "photography"],
        30,
        False,
        True,
        "08:00",
        "19:00",
        0,
    ),
    "worship": (
        "culture",
        ["spiritual", "heritage", "architecture"],
        45,
        True,
        False,
        "06:00",
        "21:00",
        0,
    ),
    "ghat": (
        "culture",
        ["spiritual", "heritage", "sunset", "photography"],
        45,
        False,
        True,
        "05:30",
        "21:00",
        0,
    ),
    "eatery": ("food", ["local-food"], 45, True, False, "08:00", "22:30", 200),
    "market": (
        "shopping",
        ["market", "shopping", "local-food"],
        60,
        False,
        False,
        "10:00",
        "21:00",
        0,
    ),
    "beach": (
        "nature",
        ["beach", "nature", "sunset", "viewpoint", "relaxed", "photography"],
        75,
        False,
        True,
        "05:30",
        "22:00",
        0,
    ),
    "promenade": (
        "nature",
        ["viewpoint", "sunset", "relaxed", "photography", "evening"],
        60,
        False,
        True,
        "05:00",
        "23:30",
        0,
    ),
    "viewpoint": (
        "nature",
        ["viewpoint", "sunset", "photography"],
        45,
        False,
        True,
        "06:00",
        "19:30",
        0,
    ),
    "hill": ("nature", ["viewpoint", "nature", "active"], 90, False, True, "06:00", "19:00", 0),
    "lake": ("nature", ["nature", "relaxed", "viewpoint"], 60, False, True, "06:00", "20:00", 0),
    "park": ("nature", ["nature", "relaxed", "family"], 60, False, True, "06:00", "20:00", 0),
    "zoo": ("nature", ["wildlife", "kids", "family"], 150, False, True, "09:30", "17:30", 50),
}
HERITAGE = {  # Wikidata heritage designations (P1435) -> who lists it
    "Q17047513": "Archaeological Survey of India (Monument of National Importance)",
    "Q17047640": "State Archaeology Department (State Protected Monument)",
}
OTHER_HERITAGE = "Local government heritage list"

# Wikipedia fallback: kind from the title first, then the short description.
TEXT_KINDS = [
    ("eatery", r"\brestaurant\b|\bcaf[eé]\b|\bbakery\b|\beatery\b"),
    ("station", r"railway station|railway terminus|\bterminus\b"),
    ("airport", r"\bairport\b"),
    ("beach", r"\bbeach\b|chowpatty"),
    ("zoo", r"\bzoo\b|zoological"),
    ("museum", r"\bmuseum\b|planetarium"),
    ("gallery", r"\bgallery\b"),
    ("fort", r"\bforts?\b|fortification|fortress|\bkilla\b|\bcastle\b"),
    ("palace", r"\bpalace\b|\bwada\b|\bmahal\b|\bhaveli\b"),
    ("site", r"\bcaves?\b|archaeological|\bruins\b|stepwell"),
    ("monument", r"\bmonument\b|\bmemorial\b|\bchhatri\b|\bgateway\b"),
    (
        "worship",
        r"\btemple\b|\bmandir\b|\bchurch\b|\bcathedral\b|\bbasilica\b|\bmosque\b|"
        r"\bmasjid\b|\bsynagogue\b|\bgurdwara\b|\bdargah\b|\bganapati\b",
    ),
    ("ghat", r"\bghats?\b"),
    ("market", r"\bmarket\b|\bbazaar\b|\bmandai\b"),
    ("promenade", r"\bpromenade\b|sea ?face|\bbandstand\b"),
    ("viewpoint", r"\bviewpoint\b|\bview point\b"),
    ("hill", r"\bhills?\b"),
    ("lake", r"\blake\b|\btalao\b|\btalav\b"),
    ("park", r"\bpark\b|\bgardens?\b|\budyan\b|\bbaug\b|\bbagh\b"),
]
NOT_A_PLACE = re.compile(  # in the description: what the article is really about
    r"constituency|college|school|universit|hospital|clinic|metro station|monorail|bus st|"
    r"stadium|district|suburb|neighbou?rhood|village|locality|company|bank|exchange|battle|riot|"
    r"bombing|crash|killing|consulate|institut|industrial|business park|it park|tech park|"
    r"technology park|film|river|landfill|division|mall",
    re.I,
)
NOT_A_PLACE_TITLE = re.compile(  # in the title: events, roads, hospitals, transit stops
    r"^\d{4}\b|college|school|hospital|metro|monorail|\broad\b|\bmarg\b|\bzone\b|"
    r"residential|colony|constituency",
    re.I,
)


def live() -> bool:
    return os.environ.get("LIVE_DATA", "1") != "0"


def _get(
    url: str, data: dict | None = None, headers: dict | None = None, timeout: int = 20
) -> dict:
    body = urllib.parse.urlencode(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers={**UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


# ---------------------------------------------------------------- geocoding


def geocode_phrase(phrase: str) -> tuple[str, float, float] | None:
    """The most specific place in a short phrase: "versova mumbai" tries the whole phrase, then
    "versova", then "mumbai" (longest first, left to right). Each lookup is cached."""
    words = phrase.split()[:4]
    for n in range(len(words), 0, -1):
        for i in range(len(words) - n + 1):
            if found := geocode(" ".join(words[i : i + n])):
                return found
    return None


def geocode(name: str, fetch=None) -> tuple[str, float, float] | None:
    """(display name, lat, lon) of a town, city or locality in India; None if unknown/offline."""
    key = "geo-in:" + name.strip().lower()  # "geo:" entries predate the India filter: ignored
    if (hit := store.cache_get(key, CACHE_DAYS)) is not None:
        return tuple(hit) if hit else None
    if fetch is None and not live():
        return None
    try:
        raw = (fetch or _get)(
            "https://geocoding-api.open-meteo.com/v1/search?"
            + urllib.parse.urlencode(
                {"name": name.strip(), "count": 5, "countryCode": "IN", "language": "en"}
            )
        )
    except Exception as e:  # offline or rate-limited: location stays unknown
        log.warning("geocoding failed: %s", type(e).__name__)
        return None
    hits = [  # the API filters by country; checked again so a place abroad can never slip in
        r
        for r in raw.get("results", [])
        if r.get("country_code") == "IN"
        and str(r.get("feature_code", "")).startswith(("PPL", "ADM"))
    ]
    found = (hits[0]["name"], hits[0]["latitude"], hits[0]["longitude"]) if hits else None
    store.cache_put(key, list(found) if found else [])
    return found


# ---------------------------------------------------------------- fetching places

SPARQL = """SELECT ?item ?itemLabel ?itemDescription ?type ?loc ?links (SAMPLE(?h) AS ?heritage)
WHERE {{
  SERVICE wikibase:around {{ ?item wdt:P625 ?loc .
    bd:serviceParam wikibase:center "Point({lon} {lat})"^^geo:wktLiteral ;
    wikibase:radius "{km}" . }}
  VALUES ?type {{ {types} }}
  ?item wdt:P31/wdt:P279? ?type .
  ?item wikibase:sitelinks ?links .
  OPTIONAL {{ ?item wdt:P1435 ?h }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}} GROUP BY ?item ?itemLabel ?itemDescription ?type ?loc ?links"""


def _popularity(links: int) -> float:
    """Wikipedia language editions as a tourist proxy: 0 = locals only, 1 = on every list."""
    return next(p for limit, p in ((15, 0.9), (8, 0.7), (4, 0.45), (0, 0.2)) if links >= limit)


def from_wikidata(raw: dict) -> list[dict]:
    items: dict[str, dict] = {}
    for r in raw["results"]["bindings"]:
        qid = r["item"]["value"].rsplit("/", 1)[-1]
        name = r.get("itemLabel", {}).get("value", "")
        kind = KIND_BY_QID.get(r["type"]["value"].rsplit("/", 1)[-1])
        m = re.match(r"Point\(([-\d.]+) ([-\d.]+)\)", r["loc"]["value"])
        if (
            not kind
            or not m
            or not name
            or name == qid
            or (kind == "station" and re.search(r"metro|monorail", name, re.I))
            or (kind == "eatery" and NOT_PUBLIC.search(name))
        ):
            continue
        it = items.setdefault(
            qid,
            {
                "id": qid,
                "name": name,
                "kinds": [],
                "lat": float(m[2]),
                "lon": float(m[1]),
                "about": r.get("itemDescription", {}).get("value", ""),
                "popularity": _popularity(int(r["links"]["value"])),
                "heritage": (r.get("heritage", {}).get("value") or "").rsplit("/", 1)[-1] or None,
            },
        )
        it["kinds"].append(kind)
    return list(items.values())


def _fetch_wikidata(lat: float, lon: float, km: int) -> list[dict]:
    types = " ".join(f"wd:{q}" for q in KIND_BY_QID)
    q = SPARQL.format(lat=lat, lon=lon, km=km, types=types)
    raw = _get(
        "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": q}),
        headers={"Accept": "application/sparql-results+json"},
        timeout=25,
    )
    return from_wikidata(raw)


def _text_kind(title: str, about: str) -> str | None:
    """Kind from the title ("Aksa Beach"), else from the description unless that says it's
    something else ("Suburb in Mumbai")."""
    if NOT_A_PLACE_TITLE.search(title):
        return None
    for text in (title, about):
        if text is about and NOT_A_PLACE.search(about):
            return None
        if kind := next((k for k, rx in TEXT_KINDS if re.search(rx, text, re.I)), None):
            return kind
    return None


def from_wikipedia(raw: dict) -> list[dict]:
    out = []
    for pg in raw.get("query", {}).get("pages", []):
        coords, title = pg.get("coordinates") or [{}], pg["title"]
        about = pg.get("description") or ""
        kind = _text_kind(title, about)
        if not kind or "lat" not in coords[0]:
            continue
        views = sum(v or 0 for v in (pg.get("pageviews") or {}).values())
        pop = next(
            p for limit, p in ((5000, 0.9), (1000, 0.7), (200, 0.45), (0, 0.2)) if views >= limit
        )
        out.append(
            {
                "id": f"wp{pg['pageid']}",
                "name": re.sub(r",.*$|\s*\(.*\)$", "", title),
                "kinds": [kind],
                "lat": coords[0]["lat"],
                "lon": coords[0]["lon"],
                "about": about,
                "popularity": pop,
                "heritage": None,
            }
        )
    return out


def _fetch_wikipedia(lat: float, lon: float, km: int) -> list[dict]:
    raw = _get(
        "https://en.wikipedia.org/w/api.php?"
        + urllib.parse.urlencode(
            {
                "action": "query",
                "format": "json",
                "formatversion": 2,
                "generator": "geosearch",
                "ggscoord": f"{lat}|{lon}",
                "ggsradius": min(km, 10) * 1000,
                "ggslimit": 500,
                "prop": "description|coordinates|pageviews",
                "colimit": "max",
                "pvipdays": 30,
            }
        )
    )
    return from_wikipedia(raw)


def pois(lat: float, lon: float, fetch=None) -> tuple[list[dict], str]:
    """Places around a point and where they came from ("wikidata", "wikipedia", "none").

    A Wikipedia fallback is only kept for an hour; then Wikidata is tried again, and the old
    fallback is still served if that fails too."""
    hit = store.area_near(lat, lon, AREA_KM - 5, CACHE_DAYS)
    fresh_kinds = hit is not None and hit[2] >= KINDS_SINCE
    if hit and ((hit[1] == "wikidata" and fresh_kinds) or datetime.now() - hit[2] < FALLBACK_TTL):
        return hit[0], hit[1]
    stale = (hit[0], hit[1]) if hit else ([], "none")
    cell = (round(lat, 1), round(lon, 1))
    if fetch is None and (not live() or clock.monotonic() - _failed.get(cell, -RETRY_S) < RETRY_S):
        return stale
    sources = fetch or {"wikidata": _fetch_wikidata, "wikipedia": _fetch_wikipedia}
    for source, f in list(sources.items())[: 1 if hit else None]:  # a refresh only wants Wikidata
        try:
            found = f(lat, lon, AREA_KM)
        except Exception as e:  # rate-limited or offline: try the next source
            log.warning("%s places failed: %s", source, type(e).__name__)
            continue
        if found:
            store.area_put(lat, lon, AREA_KM, source, found)
            return found, source
    _failed[cell] = clock.monotonic()
    return stale


# ---------------------------------------------------------------- places -> Seed


def _kind(p: dict) -> str | None:
    return next((k for k in PRIORITY if k in p["kinds"]), None)


def to_seed(items: list[dict], fetched: date) -> Seed:
    providers: dict[str, Provider] = {}
    places: dict[str, Place] = {}
    exps: dict[str, Experience] = {}
    typical = Evidence(source="estimate", updated_at=fetched)
    for p in sorted(items, key=lambda x: -x["popularity"]):  # landmarks(): main stations first
        kind = _kind(p)
        if kind is None:
            continue
        if kind in LANDMARK_KINDS:
            pid = f"pl-od-{kind}-{p['id']}"
            places[pid] = Place(
                id=pid, name=p["name"], neighbourhood="", lat=p["lat"], lon=p["lon"]
            )
            continue
        place = Place(
            id=f"pl-od-{p['id']}", name=p["name"], neighbourhood="", lat=p["lat"], lon=p["lon"]
        )
        places[place.id] = place
        if p["heritage"]:
            lister = HERITAGE.get(p["heritage"], OTHER_HERITAGE)
            pv = Provider(
                id=f"pv-gov-{p['heritage']}",
                name=lister,
                kind="formal",
                neighbourhood="-",
                verified=True,
            )
        else:
            pv = Provider(
                id="pv-open-data",
                name="Public place (Wikidata/Wikipedia)",
                kind="formal",
                neighbourhood="-",
            )
        providers[pv.id] = pv
        cat, tags, minutes, indoor, wet, opens, closes, price = TEMPLATES[kind]
        if p["heritage"] and "history" not in tags:
            tags = [*tags, "history"]
        if p["popularity"] >= 0.7:
            tags = [*tags, "iconic"]
        about = p["about"] or kind
        exps[f"ex-od-{p['id']}"] = Experience(
            id=f"ex-od-{p['id']}",
            title=p["name"],
            provider_id=pv.id,
            place_id=place.id,
            category=cat,
            tags=tags,
            description=f"{about[0].upper()}{about[1:]}. Hours and price are typical for a "
            f"{kind}, not confirmed.",
            duration_min=minutes,
            price_inr=price,
            price_model="per_person" if price else "free",
            indoor=indoor,
            weather_sensitive=wet,
            tourist_index=p["popularity"],
            availability=[
                AvailabilityWindow(start=time.fromisoformat(opens), end=time.fromisoformat(closes))
            ],
            evidence={"availability": typical, "price_inr": typical},
        )
    return Seed(providers, places, exps)


@lru_cache(maxsize=32)
def _area_seed(key: str, fetched: date) -> Seed:
    return to_seed(json.loads(key), fetched)


def area_seed(lat: float, lon: float) -> tuple[Seed, str]:
    items, source = pois(lat, lon)
    return _area_seed(json.dumps(items), date.today()), source


# ---------------------------------------------------------------- merging with curated supply


def _words(name: str) -> set[str]:
    return {w for w in re.findall(r"[a-z]+", name.lower()) if len(w) > 3}


def merge_near(curated: Seed, live_seed: Seed, lat: float, lon: float, km: float = NEAR_KM) -> Seed:
    """Curated + provider supply within `km`, plus open-data places that aren't duplicates of a
    curated one (same words in the name, under 400 m apart). Curated data wins: it has hours."""
    near = {i: p for i, p in curated.places.items() if km_between(lat, lon, p.lat, p.lon) <= km}
    exps = {i: e for i, e in curated.experiences.items() if e.place_id in near}
    places, providers = (
        dict(near),
        {e.provider_id: curated.providers[e.provider_id] for e in exps.values()},
    )
    for eid, e in live_seed.experiences.items():
        pl = live_seed.places[e.place_id]
        if (
            eid in exps
            or km_between(lat, lon, pl.lat, pl.lon) > km
            or any(
                km_between(pl.lat, pl.lon, c.lat, c.lon) < 0.4 and _words(pl.name) & _words(c.name)
                for c in near.values()
            )
        ):
            continue
        exps[eid], places[pl.id] = e, pl
        providers[e.provider_id] = live_seed.providers[e.provider_id]
    places |= {
        i: p
        for i, p in live_seed.places.items()
        if i.startswith(("pl-od-station-", "pl-od-airport-"))
    }
    return Seed(providers, places, exps, stays=dict(curated.stays))


def landmarks(seed: Seed, kind: str) -> list[Place]:
    """Railway stations or airports in the served area, best known first."""
    return [p for i, p in seed.places.items() if i.startswith(f"pl-od-{kind}-")]


def next_open(exp: Experience, after: datetime, days: int = 7) -> datetime | None:
    """When it can next be started (for "closed now, opens tomorrow 10:00")."""
    from app.engine.feasibility import earliest_start

    for d in range(days):
        day_start = datetime.combine(after.date() + timedelta(days=d), time(0))
        if found := earliest_start(exp, max(after, day_start)):
            return found
    return None


# ---------------------------------------------------------------- photos of open-data places


def _meta_text(meta: dict, key: str) -> str:
    return re.sub(r"<[^>]+>", "", meta.get(key, {}).get("value", "")).strip()


def _commons_info(files: list[str]) -> dict[str, dict]:
    """File name -> {url (640 px), page, author, license} for Commons images."""
    raw = _get(
        "https://commons.wikimedia.org/w/api.php?"
        + urllib.parse.urlencode(
            {
                "action": "query",
                "format": "json",
                "formatversion": 2,
                "prop": "imageinfo",
                "titles": "|".join(f"File:{f}" for f in files),
                "iiprop": "url|extmetadata",
                "iiurlwidth": 640,
            }
        )
    )
    out = {}
    for pg in raw.get("query", {}).get("pages", []):
        ii = (pg.get("imageinfo") or [{}])[0]
        if ii.get("thumburl"):
            meta = ii.get("extmetadata", {})
            out[pg["title"].removeprefix("File:")] = {
                "url": ii["thumburl"],
                "page": ii.get("descriptionurl", ""),
                "author": _meta_text(meta, "Artist")[:80] or "Wikimedia Commons contributor",
                "license": _meta_text(meta, "LicenseShortName"),
            }
    return out


def _image_files(ids: list[str], get) -> dict[str, str]:
    """id -> Commons file name: Wikidata's image of the place (P18) for Q ids, the article's lead
    image for Wikipedia page ids (wp123, the fallback source)."""
    files: dict[str, str] = {}
    if qs := [i for i in ids if i.startswith("Q")]:
        ents = get(
            "https://www.wikidata.org/w/api.php?"
            + urllib.parse.urlencode(
                {
                    "action": "wbgetentities",
                    "format": "json",
                    "ids": "|".join(qs),
                    "props": "claims",
                }
            )
        ).get("entities", {})
        files |= {
            q: e["claims"]["P18"][0]["mainsnak"]["datavalue"]["value"]
            for q, e in ents.items()
            if e.get("claims", {}).get("P18")
        }
    if wps := [i.removeprefix("wp") for i in ids if i.startswith("wp")]:
        raw = get(
            "https://en.wikipedia.org/w/api.php?"
            + urllib.parse.urlencode(
                {
                    "action": "query",
                    "format": "json",
                    "formatversion": 2,
                    "pageids": "|".join(wps),
                    "prop": "pageimages",
                    "piprop": "name",
                }
            )
        )
        files |= {
            f"wp{pg['pageid']}": pg["pageimage"]
            for pg in raw.get("query", {}).get("pages", [])
            if pg.get("pageimage")
        }
    return {k: v.replace("_", " ") for k, v in files.items()}


def photos(ids: list[str], fetch=None) -> dict[str, dict]:
    """A real photo of each open-data place (Wikidata Q id or Wikipedia wp id), with its credit.
    Only Commons images (so the licence and author are known). Cached 30 days, including
    "no photo", so each place is looked up once."""
    out, missing = {}, []
    for q in dict.fromkeys(ids):
        hit = store.cache_get(f"photo:{q}", 30)
        if hit is None:
            missing.append(q)
        elif hit:
            out[q] = hit
    if not missing or (fetch is None and not live()):
        return out
    get = fetch or _get
    for i in range(0, len(missing), 50):
        chunk = missing[i : i + 50]
        try:
            files = _image_files(chunk, get)
            info = _commons_info(sorted(set(files.values()))) if files and fetch is None else {}
        except Exception as e:  # rate-limited or offline: try again next time
            log.warning("photo lookup failed: %s", type(e).__name__)
            continue
        for q in chunk:
            photo = info.get(files.get(q, ""))
            store.cache_put(f"photo:{q}", photo or {})
            if photo:
                out[q] = photo
    return out
