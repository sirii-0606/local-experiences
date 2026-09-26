"""Pre-fetch open-data places for the cities a demo will use, so the first request in each city
is instant and gets Wikidata (not the weaker Wikipedia fallback).

Wikidata's public endpoint can be limited to one query a minute, so cities are fetched 65 s apart.
Usage: backend/.venv/Scripts/python scripts/warm_places.py Pune Mumbai Jaipur
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app import env  # noqa: E402,F401  (reads .env, e.g. DB_PATH)
from app import opendata  # noqa: E402

for i, city in enumerate(sys.argv[1:]):
    found = opendata.geocode(city)
    if not found:
        print(f"{city}: not found")
        continue
    name, lat, lon = found
    if i:
        time.sleep(65)
    items, source = opendata.pois(lat, lon)
    print(f"{name} ({lat:.3f}, {lon:.3f}): {len(items)} places from {source}")
