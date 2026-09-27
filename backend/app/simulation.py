from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal

from pydantic import BaseModel, Field

from app.engine.adapt import Change, replan
from app.engine.feasibility import km_between
from app.models import ContextEvent, Itinerary, TravelerState
from app.seed import Seed, load_seed
from app.social import SocialSignal, get_social_signals

IST = timezone(timedelta(hours=5, minutes=30))


class SimulationScenario(BaseModel):
    name: str = "Custom What-If Scenario"
    temp_c: float = Field(default=28.0, ge=10.0, le=52.0)
    rain_intensity_mm_h: float = Field(default=0.0, ge=0.0, le=80.0)
    duration_hours: float = Field(default=2.0, ge=0.5, le=10.0)
    epicenter_lat: float = 26.9239  # Default Hawa Mahal / Walled City
    epicenter_lon: float = 75.8267
    epicenter_name: str = "Old Walled City, Jaipur"
    radius_km: float = Field(default=3.5, ge=0.5, le=15.0)
    wind_kmh: float = Field(default=15.0, ge=0.0, le=100.0)


class ImpactZonePolygon(BaseModel):
    name: str
    severity: Literal["low", "medium", "high", "extreme"]
    center: tuple[float, float]
    radius_meters: float
    description: str
    waterlogging_prob: float
    heat_index_c: float


class DigitalTwinMetrics(BaseModel):
    safety_score: int  # 0 - 100
    comfort_index: int  # 0 - 100
    transit_friction_multiplier: float  # e.g. 1.0 - 2.5x
    added_transit_delay_min: int
    sheltered_ratio_pct: int
    weather_classification: Literal["rain", "heat", "clear"]


class DigitalTwinResult(BaseModel):
    scenario: SimulationScenario
    metrics: DigitalTwinMetrics
    impact_zones: list[ImpactZonePolygon]
    original_itinerary: Itinerary
    adapted_itinerary: Itinerary
    changes: list[Change]
    vulnerable_stop_ids: list[str]
    protected_stop_ids: list[str]
    simulated_social_signals: list[SocialSignal]
    ai_executive_summary: str


# Preset scenarios for 1-click traveler demonstrations
PRESET_SCENARIOS: list[SimulationScenario] = [
    SimulationScenario(
        name="Sudden Monsoon Cloudburst (35 mm/h)",
        temp_c=29.5,
        rain_intensity_mm_h=35.0,
        duration_hours=2.5,
        epicenter_lat=26.9239,
        epicenter_lon=75.8267,
        epicenter_name="Old Walled City & Badi Chaupar",
        radius_km=3.8,
        wind_kmh=32.0,
    ),
    SimulationScenario(
        name="Extreme May Heatwave (43.8°C)",
        temp_c=43.8,
        rain_intensity_mm_h=0.0,
        duration_hours=4.0,
        epicenter_lat=26.9247,
        epicenter_lon=75.8245,
        epicenter_name="Jantar Mantar & Central Open Terraces",
        radius_km=5.0,
        wind_kmh=18.0,
    ),
    SimulationScenario(
        name="Amer Hillside Flash Flood & Rampart Closure",
        temp_c=27.0,
        rain_intensity_mm_h=48.0,
        duration_hours=3.0,
        epicenter_lat=26.9855,
        epicenter_lon=75.8513,
        epicenter_name="Amer Fort Hills & Maota Lake",
        radius_km=2.8,
        wind_kmh=28.0,
    ),
    SimulationScenario(
        name="Pleasant Autumn Evening (24.0°C)",
        temp_c=24.0,
        rain_intensity_mm_h=0.0,
        duration_hours=3.0,
        epicenter_lat=26.9378,
        epicenter_lon=75.8155,
        epicenter_name="Nahargarh Ridge & Sunset Point",
        radius_km=4.0,
        wind_kmh=12.0,
    ),
]


def _compute_impact_zones(scenario: SimulationScenario) -> list[ImpactZonePolygon]:
    """Generates concentric geospatial impact propagation polygons."""
    r_meters = scenario.radius_km * 1000.0
    is_rain = scenario.rain_intensity_mm_h > 2.0
    is_heat = scenario.temp_c >= 38.0

    zones: list[ImpactZonePolygon] = []

    # Zone 1: Epicenter Core
    zones.append(
        ImpactZonePolygon(
            name=f"Epicenter Core ({scenario.epicenter_name})",
            severity="extreme"
            if (scenario.rain_intensity_mm_h > 20.0 or scenario.temp_c > 42.0)
            else "high",
            center=(scenario.epicenter_lat, scenario.epicenter_lon),
            radius_meters=r_meters * 0.4,
            description="Direct impact: severe transit delays or radiant heat.",
            waterlogging_prob=min(1.0, scenario.rain_intensity_mm_h / 40.0) if is_rain else 0.0,
            heat_index_c=scenario.temp_c + (3.5 if scenario.temp_c > 35 else 0),
        )
    )

    # Zone 2: Propagation Wave
    zones.append(
        ImpactZonePolygon(
            name="Intermediate Impact Buffer",
            severity="high"
            if (scenario.rain_intensity_mm_h > 15.0 or scenario.temp_c > 40.0)
            else "medium",
            center=(scenario.epicenter_lat, scenario.epicenter_lon),
            radius_meters=r_meters * 0.75,
            description="Secondary ripple: pedestrian congestion, slower auto speeds.",
            waterlogging_prob=min(0.8, scenario.rain_intensity_mm_h / 55.0) if is_rain else 0.0,
            heat_index_c=scenario.temp_c + (2.0 if scenario.temp_c > 35 else 0),
        )
    )

    # Zone 3: Outer Watch Perimeter
    zones.append(
        ImpactZonePolygon(
            name="Outer Advisory Perimeter",
            severity="low" if not (is_rain or is_heat) else "medium",
            center=(scenario.epicenter_lat, scenario.epicenter_lon),
            radius_meters=r_meters,
            description="Advisory boundary: transit delays +10-15m, outdoor caution advised.",
            waterlogging_prob=0.15 if is_rain else 0.0,
            heat_index_c=scenario.temp_c,
        )
    )
    return zones


def run_digital_twin_simulation(
    scenario: SimulationScenario,
    state: TravelerState,
    itinerary: Itinerary,
    seed: Seed | None = None,
    now: datetime | None = None,
) -> DigitalTwinResult:
    """Core Digital Twin engine: propagates weather perturbation through the traveler plan."""
    s = seed or load_seed()
    current_time = now or state.window_start
    if current_time.tzinfo is not None:
        current_time = current_time.replace(tzinfo=None)

    # Determine simulated weather classification
    if scenario.rain_intensity_mm_h >= 1.0:
        sim_cond = "rain"
    elif scenario.temp_c >= 38.0:
        sim_cond = "heat"
    else:
        sim_cond = "clear"

    # 1. Calculate transit friction
    if sim_cond == "rain":
        transit_mult = round(1.0 + min(1.5, scenario.rain_intensity_mm_h / 25.0), 2)
    elif sim_cond == "heat":
        transit_mult = round(1.0 + min(0.6, (scenario.temp_c - 38.0) * 0.08), 2)
    else:
        transit_mult = 1.0

    # 2. Evaluate venue vulnerability for current itinerary
    vulnerable_ids: list[str] = []
    protected_ids: list[str] = []

    for stop in itinerary.stops:
        exp = s.experiences.get(stop.experience_id) if stop.experience_id else None
        if not exp:
            continue
        dist_to_epicenter = km_between(
            scenario.epicenter_lat, scenario.epicenter_lon, stop.lat, stop.lon
        )

        # Inside impact radius
        if dist_to_epicenter <= scenario.radius_km:
            conv_rain = getattr(exp, "outdoor_convenience_rain", 0.9 if exp.indoor else 0.4)
            conv_heat = getattr(exp, "outdoor_convenience_heat", 0.9 if exp.indoor else 0.4)
            if sim_cond == "rain" and (conv_rain < 0.45 or exp.weather_sensitive or not exp.indoor):
                vulnerable_ids.append(exp.id)
            elif sim_cond == "heat" and (conv_heat < 0.45 or not exp.indoor):
                vulnerable_ids.append(exp.id)
            else:
                protected_ids.append(exp.id)
        else:
            conv = getattr(
                exp,
                "outdoor_convenience_rain" if sim_cond == "rain" else "outdoor_convenience_heat",
                0.5,
            )
            if exp.indoor or conv >= 0.75:
                protected_ids.append(exp.id)

    # 3. Compute safety & comfort scores
    total_stops = max(
        1, len([st for st in itinerary.stops if st.status in ("proposed", "confirmed", "active")])
    )
    vuln_ratio = len(vulnerable_ids) / total_stops

    if sim_cond == "rain":
        base_safety = max(20, int(100 - (vuln_ratio * 60) - (scenario.rain_intensity_mm_h * 0.8)))
        base_comfort = max(15, int(95 - (scenario.rain_intensity_mm_h * 1.1) - (vuln_ratio * 40)))
    elif sim_cond == "heat":
        base_safety = max(30, int(100 - (vuln_ratio * 45) - ((scenario.temp_c - 30) * 2.5)))
        base_comfort = max(20, int(90 - ((scenario.temp_c - 28) * 3.2)))
    else:
        base_safety = 96
        base_comfort = 94

    added_delay_min = int(len(itinerary.stops) * 12 * (transit_mult - 1.0))
    sheltered_ratio = int((len(protected_ids) / total_stops) * 100)

    metrics = DigitalTwinMetrics(
        safety_score=base_safety,
        comfort_index=base_comfort,
        transit_friction_multiplier=transit_mult,
        added_transit_delay_min=added_delay_min,
        sheltered_ratio_pct=sheltered_ratio,
        weather_classification=sim_cond,
    )

    # 4. Run dynamic plan repair using engine's replan()
    synthetic_event = ContextEvent(
        kind="weather",
        at=current_time,
        weather=sim_cond,
    )
    replan_out = replan(itinerary, state, synthetic_event, s)

    # 5. Retrieve simulated social signals reflecting this scenario
    social_feed = get_social_signals(
        condition=sim_cond,
        lat=scenario.epicenter_lat,
        lon=scenario.epicenter_lon,
        radius_km=scenario.radius_km + 2.0,
        now=current_time,
    )

    # 6. Synthesize AI Executive Summary
    if sim_cond == "rain":
        summary = (
            f"Digital Twin detected {scenario.rain_intensity_mm_h:.1f} mm/h rainfall "
            f"centered at {scenario.epicenter_name}. Transit times inflated by "
            f"{transit_mult}x (+{added_delay_min} min). {len(vulnerable_ids)} outdoor stops were "
            "identified as waterlogged or lightning risks. The engine adapted "
            f"{len(replan_out.changes)} items, redirecting travelers toward sheltered indoor "
            "galleries and artisan workshops while preserving group budget and pacing."
        )
    elif sim_cond == "heat":
        summary = (
            f"Digital Twin simulated severe heatwave conditions ({scenario.temp_c:.1f}°C) over "
            f"{scenario.epicenter_name}. Traveler thermal comfort dropped to {base_comfort}%. "
            "Unshaded stone observatories and ramparts were flagged as heat exhaustion risks. "
            f"The engine adapted {len(replan_out.changes)} stops, routing into naturally cooled "
            "stepwells, climate-controlled museums, and traditional lassi sanctuaries."
        )
    else:
        summary = (
            f"Digital Twin baseline simulation: optimal weather ({scenario.temp_c:.1f}°C, clear). "
            f"Safety score is {base_safety}%. The planned itinerary operates without disruptions."
        )

    return DigitalTwinResult(
        scenario=scenario,
        metrics=metrics,
        impact_zones=_compute_impact_zones(scenario),
        original_itinerary=itinerary,
        adapted_itinerary=replan_out.itinerary,
        changes=replan_out.changes,
        vulnerable_stop_ids=vulnerable_ids,
        protected_stop_ids=protected_ids,
        simulated_social_signals=social_feed[:6],
        ai_executive_summary=summary,
    )
