# System Enhancement Architecture: Multi-Source Live APIs & Multilingual YouTube AI Discovery Pipeline

---

## Executive Summary

To scale **Local & Experiences** beyond static seed data, two major architectural enhancements are proposed:

1. **Multi-Source Dynamic Data Ingestion Architecture**:
   - Decouple data providers (opening hours, live traffic/routing, weather, real-time pricing) into modular, asynchronous connectors.
   - Feed real-time external data into the pure-Python engine *without* introducing network latency or breaking 100% offline testability.

2. **Multilingual YouTube AI Pipeline for Local Hidden Gem Discovery**:
   - Automatically discover authentic, off-the-beaten-path local experiences documented in regional travel vlogs (Hindi, Marwari, Rajasthani, English).
   - Use Speech-to-Text (OpenAI Whisper / SeamlessM4T) and LLM Entity Extraction to convert spoken vlog recommendations into verified engine candidate listings.

---

## 1. Multi-Source Dynamic Data Ingestion Architecture

### The Problem
Relying on a static dataset limits scale. Places change operating hours, traffic fluctuates by time of day, weather changes dynamically, and ticket prices update.

### The Decoupled Adapter Architecture
To preserve the core engine rule (**Pure Python, Zero I/O, fast & deterministic**), external API fetching is isolated in an **Asynchronous Data Ingestion & Enrichment Layer** that runs in the FastAPI request context before calling the engine:

```
  ┌────────────────────────────────────────────────────────────────────────┐
  │                           EXTERNAL LIVE APIs                           │
  │                                                                        │
  │  ┌──────────────────┐ ┌───────────────────┐ ┌────────────────────────┐  │
  │  │  Google Places / │ │  OSRM / Mapbox /  │ │  Open-Meteo Live       │  │
  │  │  OpenStreetMap   │ │  Google Directions│ │  Weather Forecast      │  │
  │  │  (Hours & Info)  │ │  (Traffic & Travel│ │  (Rain, Temperature)   │  │
  │  └────────┬─────────┘ └─────────┬─────────┘ └───────────┬────────────┘  │
  └───────────┼─────────────────────┼───────────────────────┼──────────────┘
              │                     │                       │
              ▼                     ▼                       ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │                 DATA INGESTION & ENRICHMENT BUS                        │
  │           (Async FastAPI Service + Redis / SQLite Cache)               │
  │                                                                        │
  │  1. Queries live APIs or fetches cached data (TTL: 1 to 24 hours)     │
  │  2. Annotates each attribute with an Evidence score (recency/source)   │
  │  3. Constructs an enriched `Seed` instance dynamically                 │
  └─────────────────────────────────┬──────────────────────────────────────┘
                                    │ Enriched Seed Object
                                    ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │                           THE CORE ENGINE                              │
  │               (Pure Python, Zero I/O, 100% Offline)                   │
  │                                                                        │
  │  `check(exp, state, enriched_seed)` ──► `discover()` ──► `plan()`     │
  └────────────────────────────────────────────────────────────────────────┘
```

---

### Key Modular API Connectors

#### A. Opening & Closing Hours Connector (`app/connectors/hours.py`)
- **Sources**: Google Places API (`places.details`), OpenStreetMap Overpass API.
- **Function**: Converts raw Google Places `opening_hours.periods` into structured engine `AvailabilityWindow` objects:
  ```python
  def parse_google_periods(periods: list[dict]) -> list[AvailabilityWindow]:
      windows = []
      for p in periods:
          day_idx = p["open"]["day"] # 0 = Sunday, 1 = Monday...
          start_time = time.fromisoformat(p["open"]["time"])
          end_time = time.fromisoformat(p["close"]["time"])
          windows.append(AvailabilityWindow(days=[day_idx], start=start_time, end=end_time))
      return windows
  ```
- **Evidence Tracking**: Updates confidence automatically:
  ```python
  exp.evidence["availability"] = Evidence(
      source="google_places_api",
      updated_at=date.today(),
      confidence=0.95
  )
  ```

#### B. Map & Real-Time Traffic Routing Connector (`app/connectors/routing.py`)
- **Sources**: OSRM (Open Source Routing Machine), Mapbox Matrix API, or Google Distance Matrix.
- **Function**: Replaces the straight-line distance heuristic ($d \times 1.3$) with exact road network distances and time-of-day traffic durations by mode (walking, auto-rickshaw, car, bus).
- **Fallback**: If the routing API is unreachable or offline, automatically falls back to the internal `feasibility.py` Haversine formula.

#### C. Live Weather Connector (`app/weather.py`)
- Integrated via Open-Meteo API (free, no API key required).
- Fetches hourly rain probability, temperature, and sun exposure for Jaipur.
- Enables the engine to automatically swap outdoor walking tours for indoor museums when rain probability exceeds 70%.

---

## 2. Multilingual YouTube AI Discovery Pipeline for Local Gems

### The Problem
The best street food, hidden stepwells, artisan ateliers, and local experiences are rarely listed on standard commercial travel sites. They exist in regional YouTube travel vlogs in local languages (Hindi, Marwari, Rajasthani).

### The AI Discovery & Extraction Pipeline

```
  ┌────────────────────────────────────────────────────────────────────────┐
  │                    1. MULTILINGUAL VLOG SEARCH                         │
  │  YouTube Data API v3 with queries in Hindi, Marwari, English:          │
  │  - "जयपुर की प्रसिद्ध कचौरी और स्ट्रीट फूड"                           │
  │  - "Jaipur hidden stepwell travel vlog 2026"                           │
  └─────────────────────────────────┬──────────────────────────────────────┘
                                    │ Video URLs & Audio Streams
  ┌─────────────────────────────────▼──────────────────────────────────────┐
  │                 2. AUDIO EXTRACTION & SPEECH-TO-TEXT                   │
  │  yt-dlp (extracts audio stream) ──► OpenAI Whisper (large-v3)          │
  │  - Language Detection: Hindi (hi), Rajasthani (ra), English (en)       │
  │  - Automatic Translation to English Transcript with Timestamps         │
  └─────────────────────────────────┬──────────────────────────────────────┘
                                    │ Translated Transcript + Timestamps
  ┌─────────────────────────────────▼──────────────────────────────────────┐
  │                 3. LLM GEOGRAPHIC & ENTITY PARSER                      │
  │  Claude / Gemini structured extraction:                                │
  │  - Place Name & Category (e.g., "Sanjay Omelette", "Panna Meena Kund")  │
  │  - Approximate Area (e.g., "Amer", "Pink City")                        │
  │  - Best time to visit & recommended dishes / activities               │
  │  - Vlogger quotes for sentiment summary                                │
  └─────────────────────────────────┬──────────────────────────────────────┘
                                    │ Structured Candidate Object
  ┌─────────────────────────────────▼──────────────────────────────────────┐
  │                4. GEOCODING & EVIDENCE ONBOARDING                      │
  │  - Geocoded via Nominatim / Google Maps API to resolve (lat, lon)     │
  │  - Marked: `source="youtube_vlog:ChannelName"`, `confidence=0.65`       │
  │  - Saved to SQLite Store for instant engine discovery                  │
  └────────────────────────────────────────────────────────────────────────┘
```

---

### Step-by-Step Technical Design

#### Step 1: Multilingual Scraping & Audio Processing (`scripts/youtube_discovery.py`)

```python
import subprocess
import whisper
from googleapiclient.discovery import build

def search_youtube_vlogs(query: str, max_results: int = 10) -> list[str]:
    """Finds top travel vlogs for regional queries."""
    youtube = build("youtube", "v3", developerKey=os.environ["YOUTUBE_API_KEY"])
    response = youtube.search().list(
        q=query, part="snippet", type="video", maxResults=max_results, videoCaption="any"
    ).execute()
    return [f"https://www.youtube.com/watch?v={item['id']['videoId']}" for item in response["items"]]

def extract_and_transcribe_audio(video_url: str) -> dict:
    """Extracts audio using yt-dlp and transcribes/translates via Whisper."""
    audio_path = f"/tmp/audio_{hash(video_url)}.m4a"
    subprocess.run(["yt-dlp", "-x", "--audio-format", "m4a", "-o", audio_path, video_url], check=True)
    
    # Run Whisper with automatic translation to English
    model = whisper.load_model("large-v3")
    result = model.transcribe(audio_path, task="translate")
    return {"transcript": result["text"], "language": result["language"]}
```

#### Step 2: Structured Candidate Extraction via LLM

The transcribed text is passed to Claude/Gemini with a strict Pydantic extraction schema:

```python
from pydantic import BaseModel, Field

class ExtractedLocalGem(BaseModel):
    place_name: str = Field(description="Name of the food stall, shop, or attraction")
    category: str = Field(description="heritage, local-food, craft, viewpoint, hidden-gem")
    neighbourhood_or_area: str = Field(description="Area in Jaipur, e.g. Johri Bazaar, Amer")
    recommended_items: list[str] = Field(description="Must-try items or activities mentioned")
    best_time_of_day: str | None = Field(description="e.g. Early Morning, Sunset, Late Night")
    estimated_price_inr: int | None = Field(description="Approximate cost mentioned in vlog")
    vlog_quote: str = Field(description="Exact quote describing why it is special")
```

#### Step 3: Candidate Verification & Engine Ingestion
1. **Geocoding**: `geopy.geocoders.Nominatim` or Google Geocoding API converts `place_name + neighbourhood_or_area + "Jaipur"` into exact latitude/longitude coordinates.
2. **Confidence Flagging**: The candidate experience is stored in the database with:
   - `confidence = 0.65` (Low confidence flag `⚠ Discovered via Local Vlog`).
   - `review_count = 1`, `rating = 4.8` (Derived from vlog sentiment).
3. **UI Rendering**: The Experience card in Explore displays a badge: **"🎥 Discovered via Hindi Travel Vlog"** with a direct link to the timestamped YouTube video!

---

## 3. Combined Architecture Workflow

```
                                SYSTEM WORKFLOW
                                
 ┌────────────────────────┐   ┌────────────────────────┐   ┌────────────────────────┐
 │   1. MULTI-SOURCE APIs │   │ 2. YOUTUBE DISCOVERY   │   │  3. GOOGLE CALENDAR    │
 │ OpenStreetMap / Places │   │ Multilingual Audio STT │   │ Read busy events /     │
 │ Mapbox Traffic / Weather│   │ Extracted Local Gems   │   │ Auto-schedule itinerary│
 └───────────┬────────────┘   └───────────┬────────────┘   └───────────┬────────────┘
             │                            │                            │
             └────────────────────────────┼────────────────────────────┘
                                          ▼
                      ┌───────────────────────────────────────┐
                      │    DYNAMIC DATA ENRICHMENT LAYER      │
                      │  Annotates recency, confidence,       │
                      │  and constructs unified Seed state    │
                      └───────────────────┬───────────────────┘
                                          │
                                          ▼
                      ┌───────────────────────────────────────┐
                      │          THE CORE ENGINE              │
                      │ 100% Deterministic Python Engine      │
                      │  - Feasibility Filter                 │
                      │  - Multi-Factor Utility + MMR Rank    │
                      │  - Gap-Aware Itinerary Builder        │
                      │  - Localized Adaptive Replanner       │
                      └───────────────────────────────────────┘
```

---

## 4. Architectural Advantages

1. **Modularity**: Integrations can be added or swapped without touching a single line of engine scoring or itinerary code.
2. **Speed & Reliability**: If any external API fails or times out, fallback mock/cached data ensures the app never crashes.
3. **Unmatched Local Authenticity**: Multilingual YouTube audio extraction captures hyper-local food stalls and hidden spots months before commercial travel guides list them.
4. **Transparent Trust**: Every auto-discovered spot retains clear provenance metadata (`source`, `confidence`, timestamped audio link).
