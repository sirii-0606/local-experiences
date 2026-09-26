from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Literal

from pydantic import BaseModel, Field

IST = timezone(timedelta(hours=5, minutes=30))

SocialSource = Literal[
    "x_twitter",
    "reddit",
    "traffic_police",
    "local_guide",
    "crowd_report",
    "instagram",
]


class SocialSignal(BaseModel):
    id: str
    source: SocialSource
    author: str
    handle: str
    avatar: str
    content: str
    tags: list[str] = Field(default_factory=list)
    lat: float
    lon: float
    location_name: str
    timestamp: datetime
    sentiment: Literal["positive", "neutral", "warning", "critical"]
    weather_related: bool = True
    verified: bool = False
    impact_level: Literal["low", "medium", "high"] = "low"
    relevance_score: float = 0.95


class UserSocialReport(BaseModel):
    author: str = "Anonymous Traveler"
    content: str
    location_name: str
    lat: float
    lon: float
    sentiment: Literal["positive", "neutral", "warning", "critical"] = "warning"
    tags: list[str] = Field(default_factory=list)
    weather_related: bool = True


# In-memory user-submitted reports buffer
_custom_reports: list[SocialSignal] = []

# Curated authentic real-world Jaipur social signal base
BASE_SIGNALS: list[dict] = [
    # Rain & Waterlogging Signals
    {
        "id": "sig-rain-01",
        "source": "traffic_police",
        "author": "Jaipur Traffic Police Official",
        "handle": "@JaipurTrafficPol",
        "avatar": "👮",
        "content": (
            "⚠️ Traffic Advisory: Water accumulation observed near Badi Chaupar & Ramganj "
            "Bazaar following heavy showers. Slow-moving traffic. Diversion via MI Road suggested."
        ),
        "tags": ["#JaipurRains", "#TrafficAlert", "#Waterlogging", "#OldCity"],
        "lat": 26.9248,
        "lon": 75.8295,
        "location_name": "Badi Chaupar, Old Walled City",
        "time_offset_min": -15,
        "sentiment": "warning",
        "impact_level": "high",
        "condition": "rain",
    },
    {
        "id": "sig-rain-02",
        "source": "x_twitter",
        "author": "Pooja Sharma · Heritage Explorer",
        "handle": "@pooja_travels",
        "avatar": "🎒",
        "content": (
            "Sudden cloudburst in Jaipur! The cobbles outside Hawa Mahal are slick as ice and "
            "water is ankle-deep. Taking shelter at Wind View Cafe directly opposite! 🌧️☕"
        ),
        "tags": ["#JaipurRains", "#HawaMahal", "#TravelRealities"],
        "lat": 26.9239,
        "lon": 75.8267,
        "location_name": "Hawa Mahal Frontage",
        "time_offset_min": -25,
        "sentiment": "warning",
        "impact_level": "medium",
        "condition": "rain",
    },
    {
        "id": "sig-rain-03",
        "source": "reddit",
        "author": "u/PinkCityLocal_99",
        "handle": "r/jaipur",
        "avatar": "📱",
        "content": (
            "PSA: If you're heading up to Amer Fort right now, avoid the elephant ramp and "
            "open stone stairs - tourists are slipping and guides say ramparts are roped off."
        ),
        "tags": ["#AmerFort", "#MonsoonJaipur", "#TravelSafety"],
        "lat": 26.9855,
        "lon": 75.8513,
        "location_name": "Amer Fort Ramparts",
        "time_offset_min": -40,
        "sentiment": "critical",
        "impact_level": "high",
        "condition": "rain",
    },
    {
        "id": "sig-rain-04",
        "source": "local_guide",
        "author": "Mahesh Rawat · Certified Rajasthan Guide",
        "handle": "@mahesh_jaipurguides",
        "avatar": "🧭",
        "content": (
            "Pro-tip for rainy afternoons in Jaipur: Swap outdoor Jantar Mantar for the indoor "
            "City Palace Textile & Arms galleries. Dry, AC, and stunning Pichwai paintings!"
        ),
        "tags": ["#CityPalace", "#IndoorSanctuary", "#JaipurGuide"],
        "lat": 26.9258,
        "lon": 75.8236,
        "location_name": "City Palace Complex",
        "time_offset_min": -60,
        "sentiment": "positive",
        "impact_level": "low",
        "condition": "rain",
    },
    {
        "id": "sig-rain-05",
        "source": "instagram",
        "author": "Kavita · Craft & Block Print Artisan",
        "handle": "@sanganer_heritage_crafts",
        "avatar": "🎨",
        "content": (
            "Rainy afternoon chai & block printing workshop is full and cozy! Natural vegetable "
            "dyes smell incredible in monsoon humidity. Hot samosas for all workshop guests! ✨🫖"
        ),
        "tags": ["#SanganerPrint", "#HandmadeInJaipur", "#MonsoonMagic"],
        "lat": 26.8152,
        "lon": 75.7682,
        "location_name": "Sanganer Artisan Hub",
        "time_offset_min": -50,
        "sentiment": "positive",
        "impact_level": "low",
        "condition": "rain",
    },
    # Heatwave & Scorching Summer Signals
    {
        "id": "sig-heat-01",
        "source": "traffic_police",
        "author": "Rajasthan Disaster Mgmt Authority",
        "handle": "@RajDisasterMgmt",
        "avatar": "☀️",
        "content": (
            "☀️ Severe Heatwave Warning: Peak temperatures exceeding 42°C across Jaipur district "
            "today between 12:00-16:00. High UV index. Hydration camps active at Sindhi Camp."
        ),
        "tags": ["#JaipurHeatwave", "#HeatwaveAlert", "#StayHydrated"],
        "lat": 26.9220,
        "lon": 75.8010,
        "location_name": "Jaipur Central District",
        "time_offset_min": -30,
        "sentiment": "critical",
        "impact_level": "high",
        "condition": "heat",
    },
    {
        "id": "sig-heat-02",
        "source": "x_twitter",
        "author": "Arunav Sen · Heritage Backpacker",
        "handle": "@arunav_explores",
        "avatar": "🕶️",
        "content": (
            "Jantar Mantar stone instruments at 1:30 PM are literally radiating heat like an oven. "
            "Barefoot walking required inside marble zones is impossible right now without socks!"
        ),
        "tags": ["#JantarMantar", "#JaipurHeat", "#TravelTip"],
        "lat": 26.9247,
        "lon": 75.8245,
        "location_name": "Jantar Mantar Observatory",
        "time_offset_min": -45,
        "sentiment": "warning",
        "impact_level": "high",
        "condition": "heat",
    },
    {
        "id": "sig-heat-03",
        "source": "local_guide",
        "author": "Vikram Singh · Rajputana Heritage Walks",
        "handle": "@vikram_rajputana",
        "avatar": "🏰",
        "content": (
            "For this 43°C afternoon: We are taking our group to Panna Meena Ka Kund stepwell in "
            "Amer. The subterranean geometric architecture is a full 8 degrees cooler than street!"
        ),
        "tags": ["#PannaMeenaKund", "#Stepwells", "#CoolHavens"],
        "lat": 26.9880,
        "lon": 75.8540,
        "location_name": "Panna Meena Ka Kund, Amer",
        "time_offset_min": -70,
        "sentiment": "positive",
        "impact_level": "medium",
        "condition": "heat",
    },
    {
        "id": "sig-heat-04",
        "source": "reddit",
        "author": "u/FoodieJaipurite",
        "handle": "r/jaipur",
        "avatar": "🥛",
        "content": (
            "Lassiwala on MI Road has an insane line right now. The clay kulhad lassi is the only "
            "thing surviving this 41-degree sun. Get the thick malai topping."
        ),
        "tags": ["#Lassiwala", "#JaipurFood", "#BeatTheHeat"],
        "lat": 26.9189,
        "lon": 75.8142,
        "location_name": "MI Road, Jayanti Market",
        "time_offset_min": -20,
        "sentiment": "positive",
        "impact_level": "low",
        "condition": "heat",
    },
    # Clear & Pleasant Weather Signals
    {
        "id": "sig-clear-01",
        "source": "instagram",
        "author": "Ananya Roy · Travel Photographer",
        "handle": "@ananya_captures",
        "avatar": "📸",
        "content": (
            "Golden hour at Nahargarh Fort ramparts today is pure magic! Mild 26°C breeze, zero "
            "clouds, and the entire Pink City glowing below like a jewel box. ✨🌅"
        ),
        "tags": ["#NahargarhSunset", "#JaipurDiaries", "#GoldenHour"],
        "lat": 26.9378,
        "lon": 75.8155,
        "location_name": "Nahargarh Sunset Point",
        "time_offset_min": -35,
        "sentiment": "positive",
        "impact_level": "low",
        "condition": "clear",
    },
    {
        "id": "sig-clear-02",
        "source": "x_twitter",
        "author": "Rohan & Dev · Cycle Jaipur",
        "handle": "@cycle_pinkcity",
        "avatar": "🚲",
        "content": (
            "Morning heritage cycling tour through Johari & Tripolia Bazaars went flawlessly. "
            "Spice aromas, early temple bells at Govind Dev Ji, perfect 22°C start to the day."
        ),
        "tags": ["#MorningJaipur", "#CyclingTour", "#JohariBazaar"],
        "lat": 26.9205,
        "lon": 75.8235,
        "location_name": "Johari Bazaar",
        "time_offset_min": -90,
        "sentiment": "positive",
        "impact_level": "low",
        "condition": "clear",
    },
    {
        "id": "sig-clear-03",
        "source": "crowd_report",
        "author": "Community Crowd Monitor",
        "handle": "@CrowdPulseJaipur",
        "avatar": "👥",
        "content": (
            "Moderate crowds at Albert Hall Museum grounds. Evening lighting show starts at "
            "18:30. Plenty of open bench space and chai vendors active."
        ),
        "tags": ["#AlbertHall", "#JaipurEvening", "#LiveCrowd"],
        "lat": 26.9118,
        "lon": 75.8195,
        "location_name": "Albert Hall Museum Grounds",
        "time_offset_min": -10,
        "sentiment": "neutral",
        "impact_level": "low",
        "condition": "clear",
    },
]


def _distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def get_social_signals(
    condition: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
    radius_km: float = 20.0,
    now: datetime | None = None,
) -> list[SocialSignal]:
    """Retrieve filtered, sorted social signals matching current weather and urgency."""
    ref_time = now or datetime.now(IST)
    results: list[SocialSignal] = []

    # First add custom user reports
    for rep in _custom_reports:
        results.append(rep)

    target_cond = (condition or "all").lower()

    for item in BASE_SIGNALS:
        item_cond = item.get("condition", "clear")
        if target_cond != "all" and target_cond in ("rain", "heat"):
            if item_cond != target_cond and item_cond != "clear":
                continue
        elif target_cond == "clear" and item_cond != "clear":
            continue

        ts = ref_time + timedelta(minutes=item["time_offset_min"])
        sig = SocialSignal(
            id=item["id"],
            source=item["source"],
            author=item["author"],
            handle=item["handle"],
            avatar=item["avatar"],
            content=item["content"],
            tags=item["tags"],
            lat=item["lat"],
            lon=item["lon"],
            location_name=item["location_name"],
            timestamp=ts,
            sentiment=item["sentiment"],
            weather_related=item_cond in ("rain", "heat"),
            verified=item["source"] in ("traffic_police", "local_guide"),
            impact_level=item["impact_level"],
            relevance_score=0.98 if item_cond == target_cond else 0.85,
        )

        if lat is not None and lon is not None:
            dist = _distance_km(lat, lon, sig.lat, sig.lon)
            if dist > radius_km:
                continue

        results.append(sig)

    severity_order = {"critical": 0, "warning": 1, "neutral": 2, "positive": 3}
    results.sort(key=lambda s: (severity_order.get(s.sentiment, 2), -s.timestamp.timestamp()))
    return results


def add_social_report(report: UserSocialReport, now: datetime | None = None) -> SocialSignal:
    """Store crowdsourced traveler report into live social buffer."""
    ref_time = now or datetime.now(IST)
    sig = SocialSignal(
        id=f"sig-user-{len(_custom_reports) + 1:03d}",
        source="crowd_report",
        author=report.author,
        handle=f"@{report.author.lower().replace(' ', '_')}",
        avatar="🙋",
        content=report.content,
        tags=report.tags or ["#TravelerAlert", "#LiveJaipur"],
        lat=report.lat,
        lon=report.lon,
        location_name=report.location_name,
        timestamp=ref_time,
        sentiment=report.sentiment,
        weather_related=report.weather_related,
        verified=False,
        impact_level="high" if report.sentiment in ("critical", "warning") else "medium",
        relevance_score=1.0,
    )
    _custom_reports.insert(0, sig)
    return sig


def get_trending_hashtags(condition: str | None = None) -> list[dict]:
    """Returns trending hashtags and current activity volume."""
    cond = (condition or "clear").lower()
    if cond == "rain":
        return [
            {"tag": "#JaipurRains", "count": 2840, "trend": "up", "sentiment": "warning"},
            {"tag": "#WaterloggingAlert", "count": 1420, "trend": "up", "sentiment": "critical"},
            {"tag": "#CityPalaceMuseum", "count": 980, "trend": "up", "sentiment": "positive"},
            {"tag": "#AmerRamparts", "count": 760, "trend": "down", "sentiment": "warning"},
            {"tag": "#SanganerPrintWorkshop", "count": 620, "trend": "up", "sentiment": "positive"},
        ]
    elif cond == "heat":
        return [
            {"tag": "#JaipurHeatwave", "count": 3120, "trend": "up", "sentiment": "critical"},
            {"tag": "#BeatTheHeat", "count": 1840, "trend": "up", "sentiment": "neutral"},
            {"tag": "#LassiwalaMI", "count": 1150, "trend": "up", "sentiment": "positive"},
            {"tag": "#StepwellsJaipur", "count": 890, "trend": "up", "sentiment": "positive"},
            {"tag": "#StayHydrated", "count": 740, "trend": "up", "sentiment": "warning"},
        ]
    return [
        {"tag": "#PinkCityJaipur", "count": 4200, "trend": "up", "sentiment": "positive"},
        {"tag": "#NahargarhSunset", "count": 2150, "trend": "up", "sentiment": "positive"},
        {"tag": "#HawaMahal", "count": 1980, "trend": "steady", "sentiment": "positive"},
        {"tag": "#JohariBazaar", "count": 1340, "trend": "steady", "sentiment": "positive"},
        {"tag": "#AlbertHallNight", "count": 920, "trend": "up", "sentiment": "positive"},
    ]
