# Current Context

_Last updated: 2026-09-27 · latest entry: [docs/context/2026-09-27-21-additional-integration-tasks.md](docs/context/2026-09-27-21-additional-integration-tasks.md)_

## Where we are
- **`main` has everything through M9 + Website v2 P1, P3, P4, P5 + 4 Additional Integration Modules + EC2 Deployment:**
  - **Live Weather Integration**: Real-time Open-Meteo telemetry injected directly into AI system prompt; enriched `/weather` endpoint.
  - **Geospatial Map Visualization**: Interactive Leaflet layer rendering simulated impact propagation concentric rings, geo-tagged social signal alert pins, and vulnerable stop indicators.
  - **Real-World Social Signal Engine**: Municipal alerts, traffic police updates, verified guides, crowdsourced hazard reporting (`GET /social/signals`, `POST /social/report`).
  - **Digital Twin What-If Simulation Engine**: Physics-informed parametric simulation (rainfall, temperature, duration, epicenter), transit friction modeling, venue vulnerability scoring, and automated plan repair (`GET /simulation/presets`, `POST /simulation/what-if`).
  - **Website v2 Core**:
    - **P1**: accounts, sessions, roles, admin, profile shell, and routed pages.
    - **P3**: trips dashboard `/trips` and 4-step "Plan a trip" wizard `/trips/new`.
    - **P4**: multi-day scoring, travel mode times table, 3-way shortlist (*In Person* / *AR Preview* / *Skip*), and centroid stay recommendations.
    - **P5**: multi-day itinerary builder, nearby meal suggestions, quick stops, driver/guide suggestions, group splits.
  - **Design Identity**: Jaipur Terracotta & Royal Indigo with Sanganer block-print motifs, glassmorphism, responsive drawer layout, and interactive modals.
  - **Working Rule**: Contract-first and additive (`backend/app/schemas.py`, `docs/openapi.json` + contract test, new routers only).
- **Run it:**
  - Dev: `python scripts/dev.py [--reset]` → http://localhost:5173.
  - Prod: `python scripts/prod.py` → http://0.0.0.0:8000.
  - Routes: `/` Explore, `/provider`, `/login`, `/register`, `/profile`, `/trips`, `/trips/new`, `/trips/:id`, `/trips/:id/shortlist`, `/trips/:id/itinerary`, `/admin`.
- **Tests/CI:** Backend 121 tests (120 passed, 1 skipped: live LLM), frontend builds cleanly (`npm run build`).

## Next steps
1. Deploy / update on AWS EC2 (`docs/deploy-ec2.md`).
2. P2, onboarding flow (`/onboarding`).
3. Additional user feedback and performance optimizations.

## Setup
`python scripts/dev.py` (first run installs everything). For production build: `python scripts/prod.py`.
