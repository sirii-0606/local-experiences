# Local & Experiences: Technical Architecture & Google Calendar Integration Plan

---

## 1. Executive Summary & Intuitive Explanation

### What is "Local & Experiences"?
**Local & Experiences** is an intelligent, context-aware local discovery and itinerary planning platform (prototyped for Jaipur, India). 

Traditional travel apps (like Google Maps, TripAdvisor, or Zomato) answer the question:
> *"What places or activities exist near this location?"*

**Local & Experiences** flips the paradigm completely to answer:
> *"What can our group **actually do next**, given our real-time situation, constraints, budget, pace, weather, and existing schedule—and why?"*

### The Real-World Problem It Solves
When traveling or exploring a city, plans are rarely static. A group encounters real-world friction:
- **Feasibility Failures**: Finding out a fort closed 30 minutes ago, or an experience requires a 2 km walk in 42°C heat with a toddler and a senior citizen.
- **Group Mismatch**: One person wants historical architecture, another wants artisan block-printing, and a child gets bored.
- **Cascading Disruptions**: It starts raining at 2:00 PM, or traffic causes a 45-minute delay. Modern maps show you traffic, but they don't dynamically adjust the rest of your afternoon plan.
- **Opaque Recommendations**: Algorithmic recommendations in legacy apps are black boxes driven by ad dollars rather than explainable factors.

### The Intuitive Analogy
Imagine having an ultra-resourceful local friend from Jaipur walking beside you:
1. **They check the rules first**: Before recommending a famous stepwell or textile workshop, they verify if it's open right now, fits your group's ages, accommodates wheelchair access if needed, fits your remaining ₹2,000 budget, and leaves enough travel time to reach your dinner reservation.
2. **They explain their thinking**: They don't just point at a map; they tell you, *"This hand-block printing workshop is 1.2 km away, run by a local community artisan, free for kids under 6, and fits perfectly in your 2-hour window before sunset."*
3. **They repair your day gracefully when things go wrong**: If it suddenly pours rain, your friend doesn't throw away your whole day. They keep your evening dinner reservation locked, skip the outdoor fort, and insert an indoor heritage tea tasting nearby that finishes at the exact right time.

---

## 2. Core Philosophy & Architectural Principles

The project was built under strict architectural principles defined in `docs/ideation/decisions.md` and `CLAUDE.md`:

```
  ┌──────────────────────────────────────────────────────────────────┐
  │                         USER / INTERFACE                         │
  │        React 19 + TypeScript + Vite + Leaflet Map Component       │
  └─────────────────────────────────┬────────────────────────────────┘
                                    │ HTTP / REST API
  ┌─────────────────────────────────▼────────────────────────────────┐
  │                       FASTAPI WEB SERVICES                       │
  │     (thin, stateless wrappers: /discover, /plan, /chat, etc.)    │
  └─────────────────┬───────────────────────────────┬────────────────┘
                    │                               │
  ┌─────────────────▼─────────────┐   ┌─────────────▼────────────────┐
  │       INTENT PARSER           │   │         SQLITE STORE         │
  │ Claude API (structured output)│   │ (users, sessions, listings,  │
  │  + Rule-based Offline Fallback│   │  pauses, bookings, demand)   │
  └─────────────────┬─────────────┘   └─────────────┬────────────────┘
                    │ TravelerState                 │ Seed Overlay
  ┌─────────────────▼───────────────────────────────▼────────────────┐
  │                        THE CORE ENGINE                           │
  │             (Pure Python, zero I/O, 100% deterministic)          │
  │                                                                  │
  │  1. Feasibility Filter  ──►  2. Scoring & Group Utility        │
  │  3. MMR Diversity Pass ──►  4. Explainability Factor Generator  │
  │  5. Gap-Aware Planner  ──►  6. Dynamic Adaptive Replanner       │
  └──────────────────────────────────────────────────────────────────┘
```

1. **The Engine is the Product** (`backend/app/engine/`):
   - Written in **pure Python** with **zero I/O** (no database calls, no network requests, no third-party APIs inside the engine).
   - Completely deterministic and covered by 115+ automated unit tests, re-checked by an independent mathematical validator.

2. **Feasibility Before Ranking**:
   - Hard constraints (opening hours, travel time by mode, price, age limits, accessibility, weather sensitivity) **eliminate** infeasible options *before* any ranking or utility scoring takes place. Hard constraints are never compromised by soft preferences.

3. **LLM as Parser Only, Never as Decision Maker**:
   - Claude (`claude-opus-5`) is strictly isolated in `intent.py` and `provider.py`. It extracts structured JSON (`TravelerState` or listing drafts) from natural text.
   - Claude **never ranks, filters, or builds itineraries**.
   - If the API key is missing or offline, a rule-based regex parser seamlessly handles intent extraction without dropping functionality.

4. **Group Fairness & Transparency**:
   - Group preference calculation uses a non-linear utility function: 
     $$\text{preference} = 0.7 \times \text{mean}(\text{member\_utility}) + 0.3 \times \text{min}(\text{member\_utility})$$
     This guarantees that an experience isn't selected if it makes even one group member miserable.
   - Data confidence is explicitly tracked. Low-confidence attributes are flagged with a prominent `⚠` indicator rather than hidden.

5. **Privacy First**:
   - Raw user location coordinates are never saved to disk. SQLite tables log only aggregate metrics (start hour, budget, group size) for local provider insights.

---

## 3. System Architecture & Codebase Map

### Directory Structure & File Map

```
HackCelestial_3.0/
├── backend/
│   ├── app/
│   │   ├── engine/                 # THE PURE ENGINE (Zero I/O)
│   │   │   ├── feasibility.py      # Hard constraints, travel time math, opening hours
│   │   │   ├── rank.py             # Multi-factor utility scoring & MMR diversity pass
│   │   │   ├── itinerary.py         # Time-gap detection, greedy filler, sequence validator
│   │   │   ├── adapt.py            # Dynamic replanning on disruptions (rain, delay, fatigue)
│   │   │   ├── trip.py             # Multi-day scoring & trip itinerary generation
│   │   │   ├── nearby.py           # Meal windows, quick stops, driver/guide suggestions
│   │   │   ├── confidence.py       # Data recency & source confidence tracking
│   │   │   └── learn.py            # Real-time feedback & session taste learning
│   │   ├── routes/                 # WEBSITE V2 API ENDPOINTS
│   │   │   ├── auth.py             # User registration, login, logout, session management
│   │   │   ├── me.py               # User profile, preferences, data export, account wipe
│   │   │   ├── admin.py            # Admin dashboard, user management, provider pauses
│   │   │   ├── trips.py            # Multi-day trip management & wizard backend
│   │   │   └── deps.py             # Auth dependencies (current_user, require_role)
│   │   ├── accounts.py             # User accounts, scrypt password hashing, session tokens
│   │   ├── intent.py               # Natural language parser (Claude + offline rules)
│   │   ├── main.py                 # FastAPI application & primary REST endpoints
│   │   ├── models.py               # Core Pydantic domain models (TravelerState, Experience, etc.)
│   │   ├── provider.py             # Provider listing creation & natural language draft parser
│   │   ├── schemas.py              # Website v2 request/response schemas
│   │   ├── seed.py                 # Seed data loader (50 Jaipur experiences, stays, places)
│   │   ├── store.py                # SQLite database persistence (listings, demand logs, reviews)
│   │   └── weather.py              # Open-Meteo live weather integration with cache
│   └── tests/                      # 116 automated pytest unit tests
├── frontend/
│   ├── src/
│   │   ├── pages/                  # REACT PAGES
│   │   │   ├── ExplorePage.tsx     # Single-day discovery & interactive chat interface
│   │   │   ├── TripWizard.tsx      # 4-step multi-day trip planner wizard
│   │   │   ├── TripItineraryPage.tsx# Interactive multi-day itinerary view with route map
│   │   │   ├── TripShortlist.tsx   # Shortlist selection page (In-person / AR / Skip)
│   │   │   ├── ProfilePage.tsx     # User preferences & accessibility editor
│   │   │   └── AdminPage.tsx       # System admin dashboard
│   │   ├── MapView.tsx             # Leaflet interactive map with custom pins & route lines
│   │   ├── GroupEditor.tsx         # Group travelers & accessibility editor component
│   │   ├── api.ts / v2api.ts       # Backend REST API client & mock data adapter
│   │   └── styles.css              # Custom CSS design system ("Sanganer block print" theme)
└── docs/                           # Architecture documentation, API spec & decision logs
```

---

## 4. Deep-Dive into Technical Engine Mechanics

### A. Feasibility Evaluator (`engine/feasibility.py`)
`check(exp, state, seed)` evaluates 9 strict feasibility conditions:
1. **Budget Check**: Total group cost $C \le B$ (where $C = \text{price} \times N$ for per-person or $\text{price}$ for per-group).
2. **Capacity Check**: Group size $N \le \text{exp.capacity}$.
3. **Minimum Age**: $\min(\text{member.age}) \ge \text{exp.min\_age}$.
4. **Accessibility Match**: All accessibility requirements of all members must be satisfied ($\text{needed} \subseteq \text{exp.accessibility}$).
5. **Indoor/Weather Requirement**: If `indoor_only` is true, outdoor experiences are dropped. If raining, non-indoor weather-sensitive experiences are dropped (`rained_out`).
6. **Max Distance Cutoff**: Proximity distance $d \le \text{max\_distance\_km}$.
7. **Spatial & Mode Travel Time**: Distance calculated via Haversine formula with street routing factor (1.3x):
   $$d_{\text{street}} = d_{\text{haversine}} \times 1.3$$
   $$t_{\text{travel}} = \lceil \frac{d_{\text{street}}}{V_{\text{mode}}} \times 60 \rceil + T_{\text{buffer}} + T_{\text{wait}}$$
   *Speeds ($V_{\text{mode}}$): Walk (4.5 km/h), Auto (18 km/h), Bus (14 km/h), Car (22 km/h).*
8. **Opening Windows & Slot Matching**: `earliest_start()` finds the first slot or opening time on that calendar day after the group arrives.
9. **Window & Return Cutoff**: Experience finish time $t_{\text{end}} \le t_{\text{cutoff}}$. If `end_lat` is set (e.g. returning to hotel), $t_{\text{end}} + t_{\text{return}} \le t_{\text{cutoff}}$.

### B. Scoring & Ranking Engine (`engine/rank.py`)
Feasible experiences are evaluated across 9 weighted factors:

| Factor | Weight | Formula / Logic |
|---|---|---|
| **Preference** | 0.25 | $0.7 \times \text{mean}(\text{member\_utility}) + 0.3 \times \text{min}(\text{member\_utility})$ |
| **Intent Match** | 0.20 | Jaccard-like tag overlap between user intent and experience tags |
| **Spatial Proximity**| 0.10 | $\max(0, 1 - \frac{t_{\text{travel}}}{60})$ |
| **Budget Fit** | 0.10 | $1 - \frac{\text{Cost}}{\text{Budget}}$ |
| **Quality Rating** | 0.15 | Bayesian smoothed rating: $\frac{R \cdot N + 4.0 \cdot 20}{N + 20}$ scaled to $0..1$ |
| **Localness** | 0.10 | $0.5 \cdot \text{community\_led} + 0.3 \cdot \text{same\_neighbourhood} + 0.2 \cdot (1 - \text{tourist\_index})$ |
| **Context / Pace** | 0.10 | Crowd penalty + strenuous activity penalty in heat/fatigue |
| **Learned Taste** | 0.20 | Taste score learned from positive/negative feedback in session |
| **Novelty** | Variable | Tourist index multiplier based on iconic vs hidden gem intent |

#### Maximal Marginal Relevance (MMR) Diversification
To prevent recommending five similar temples or textile shops in a row, recommendations pass through an MMR selection loop ($\lambda = 0.8$):
$$\text{MMR\_Score}(e) = \lambda \cdot \text{Score}(e) - (1 - \lambda) \cdot \max_{p \in \text{Picked}} \text{Jaccard Similarity}(e.\text{tags}, p.\text{tags})$$

### C. Itinerary Intelligence & Gap Filler (`engine/itinerary.py`)
1. **Gap Finder**: Scans upcoming itinerary stops, accounts for travel times and pace slack (relaxed pace = +20 min break after each stop), and identifies unallocated time windows $\text{Gap}(t_{\text{start}}, t_{\text{end}}, \text{pos}_{\text{origin}}, \text{pos}_{\text{destination}})$.
2. **Greedy Gap Filler**: Scores and selects the highest-ranking candidate experience that fits completely inside the gap without violating sequence rules. Intentionally rotates intent tags so consecutive stops offer varied activities.
3. **Sequence Validator**: Re-evaluates the entire itinerary timeline from start to finish, checking travel feasibility between consecutive stops, duration accuracy, budget limits, and cutoff boundaries.

### D. Dynamic Adaptive Replanner (`engine/adapt.py`)
When a context event occurs (e.g., delay, rain storm, fatigue, budget reduction, or provider closure):
1. **Past Freeze**: Completed or active stops are frozen in time and cannot be altered.
2. **Impact Walk**: Upcoming stops are evaluated against the updated state. Any broken or affected stop is flagged.
3. **Minimal-Invasive Repair Strategy**:
   - *Attempt 1 (Retiming)*: Try rescheduling the exact same experience to a later available time slot.
   - *Attempt 2 (Intent-Preserving Replacement)*: Replace with an alternative experience nearby that shares the same intent tag.
   - *Attempt 3 (Drop)*: If no alternative fits, drop the stop and adjust travel timings to ensure remaining locked stops are preserved.

---

## 5. Technical Architecture & Specification for Google Calendar Integration

### Feature Vision & Objective
Connecting a user's **Google Calendar** directly into **Local & Experiences** creates a seamless 2-way bridge between their personal schedule and the local experience engine.

```
       GOOGLE CALENDAR API                              LOCAL & EXPERIENCES
  ┌───────────────────────────┐                     ┌───────────────────────────┐
  │                           │  1. Ingest Events   │                           │
  │  Flights, Work Meetings,  ├────────────────────►│  TravelerState &          │
  │  Hotel Check-ins, Dinners │ (Read-only Scopes)  │  Itinerary Engine         │
  │                           │                     │  (Locked Busy Slots)      │
  │                           │  2. Sync Schedule   │                           │
  │  Auto-scheduled Stops &   │◄────────────────────┤  Accepted Itinerary       │
  │  Local Discovery Events   │  (Read/Write Scope) │  (Stops + Directions)     │
  └─────────────┬─────────────┘                     └─────────────┬─────────────┘
                │                                                 │
                └────────────── 3. Webhook / Push Event ──────────┘
                              Real-Time Replanning Trigger
```

---

### Key Capabilities & User Experience Flows

#### A. Inbound Integration: Personal Schedule Understanding (Read)
- **Automatic Constraint Discovery**: When planning a trip or a day, the engine reads the user's primary Google Calendar for the selected date range.
- **External Busy Blocks as Locked Stops**: Events like `"Flight to Jaipur (10:00 - 12:30)"`, `"Client Zoom Call (15:00 - 16:00)"`, or `"Hotel Check-in at Rambagh Palace"` are automatically parsed as **Locked Stops** (`locked=True`) in the engine's `Itinerary`.
- **Gap-Aware Planning Around Personal Life**: The engine's `gaps()` function automatically calculates travel buffer times to and from calendar event locations and builds local recommendations exclusively within true free windows.

#### B. Outbound Integration: Auto-Scheduling Itinerary Events (Write)
- **One-Click Calendar Sync**: Once a traveler accepts a daily plan or multi-day trip itinerary, they can click **"Sync to Google Calendar"**.
- **Rich Calendar Event Creation**: Each itinerary stop creates a structured event on Google Calendar containing:
  - **Summary**: `[Local Experience] Artisan Hand-Block Printing at Studio Bagru`
  - **Location**: Exact address + Lat/Lon coordinates formatted for Google Maps navigation.
  - **Description**: 
    - Why recommended: *"Run by local community host • Fits your ₹1,500 budget"*
    - Travel advice: *"15 min by Auto from Amber Fort"*
    - Verification & Contact info (phone, guide info, sample booking reference `LE-X89F2A`).
  - **Reminders**: Default notifications set to 30 minutes before travel departure time.

#### C. User Control, Privacy & Access Management
Users maintain 100% authority over calendar access with 3 granular modes:
1. **Off (Default)**: Zero calendar interaction; plans created purely in-app.
2. **Read-Only ("Understand My Plan")**: App only reads busy time slots to avoid scheduling conflicts. Uses minimal scope `calendar.events.readonly`.
3. **Full Sync ("Read & Auto-Schedule")**: App reads busy times and writes confirmed itinerary events to a custom calendar (e.g. *"Jaipur Experiences"*) or primary calendar. Uses scope `calendar.events`.
- **Disconnect & Wipe**: Clicking "Disconnect Google Calendar" instantly removes tokens from the user's profile and revokes OAuth credentials.

#### D. Real-time Reactive Replanning via Webhooks / Push Notifications
- If a user's Google Calendar event moves during the day (e.g., a work call is delayed by 1 hour), Google Calendar sends a Webhook notification (`watch` API) to our backend endpoint `/api/webhooks/google-calendar`.
- The backend instantly triggers `adapt.replan()`, treating the moved call as a `ContextEvent`, repairing the afternoon itinerary in under 50ms, and updating both the web UI and calendar events automatically!

---

### Technical Implementation Details

#### 1. Database Schema Extension (`accounts.py`)
Add a dedicated SQLite table to securely store OAuth refresh and access tokens tied to user accounts:

```sql
CREATE TABLE IF NOT EXISTS user_oauth_tokens (
    user_id INTEGER PRIMARY KEY,
    provider TEXT NOT NULL,          -- 'google'
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_uri TEXT NOT NULL,
    scopes TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    calendar_id TEXT DEFAULT 'primary',
    sync_enabled INTEGER DEFAULT 1,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

#### 2. Engine Integration Layer (`backend/app/engine/calendar_sync.py`)
Create a dedicated pure-adapter module that converts Google Calendar API event payloads into engine domain objects (`Stop`, `Itinerary`):

```python
from datetime import datetime
from app.models import Stop, Itinerary, TravelerState

def google_event_to_locked_stop(g_event: dict) -> Stop:
    """Converts a Google Calendar API event into an unmovable locked engine stop."""
    start_dt = datetime.fromisoformat(g_event["start"].get("dateTime") or g_event["start"]["date"])
    end_dt = datetime.fromisoformat(g_event["end"].get("dateTime") or g_event["end"]["date"])
    
    # Extract location coordinates if available or fallback to city center
    lat, lon = parse_location_coords(g_event.get("location"))
    
    return Stop(
        title=f"📅 {g_event.get('summary', 'Busy')}",
        experience_id=None,  # External calendar event
        lat=lat,
        lon=lon,
        start=start_dt,
        end=end_dt,
        cost_inr=0,
        locked=True,         # Engine will never move or delete this!
        status="confirmed"
    )

def merge_calendar_into_itinerary(itinerary: Itinerary, g_events: list[dict]) -> Itinerary:
    """Inserts external Google Calendar events as locked stops into the engine itinerary."""
    merged = itinerary.model_copy(deep=True)
    for g_event in g_events:
        locked_stop = google_event_to_locked_stop(g_event)
        merged.stops.append(locked_stop)
    merged.stops.sort(key=lambda s: s.start)
    return merged
```

#### 3. New Backend API Endpoints (`backend/app/routes/calendar.py`)

| Endpoint | Method | Purpose |
|---|---|---|
| `/auth/google/login` | GET | Initiates OAuth 2.0 PKCE flow, redirects user to Google Consent Screen |
| `/auth/google/callback` | GET | Handles authorization code exchange, stores encrypted refresh token |
| `/me/calendar/status` | GET | Returns current connection status, scopes granted, and selected calendar ID |
| `/me/calendar/sync-inbound` | POST | Fetches events for date range and merges into active trip as locked stops |
| `/me/calendar/sync-outbound` | POST | Pushes confirmed itinerary stops from a trip directly onto Google Calendar |
| `/me/calendar/disconnect` | DELETE | Revokes Google OAuth tokens and deletes database record |
| `/webhooks/google-calendar` | POST | Ingress for Google Push Notifications to trigger real-time `adapt.replan()` |

#### 4. Frontend Integration (`TripItineraryPage.tsx` & `TripWizard.tsx`)
- **Calendar Toggle Component**: Rendered in step 1 of the Trip Wizard and on the Itinerary toolbar:
  - `"Connect Google Calendar"` button with official Google Branding.
  - Connection status pill: `🟢 Google Calendar Sync Active (Read & Write)`.
  - Conflict notification: *"Your itinerary was planned around 2 existing Google Calendar events today."*
- **One-Click Sync Action**: A prominent `"Push to Calendar"` action button with status feedback (e.g. *"5 events synced to Google Calendar"*).

---

## 6. Summary & Current Project Status

- **Repository Cloned**: Successfully pulled into `/home/sumitkumar/SIH 2026/HackCelestial_3.0`.
- **Engine Verification**: All milestones M0–M9 and Website v2 features built and operational.
- **Backend Quality**: 115 passing tests verified via `pytest`, adhering strictly to contract-first architecture.
- **Frontend Quality**: Responsive React 19 interface styled with the custom "Sanganer block print" design identity.
- **Calendar Roadmap**: Clear, modular, additive architectural specification ready for immediate implementation.
