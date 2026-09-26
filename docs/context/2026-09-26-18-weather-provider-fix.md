# Weather API Integration & Provider Auto-Detection

## What changed
1. **Multi-Provider Weather Support & Detection**:
   - `backend/app/weather.py`: Updated `_fetch` to recognize OpenWeatherMap 32-character hex keys when `WEATHER_PROVIDER` is set to `"auto"`, `""`, or `"openweathermap"`.
   - OpenWeatherMap 3-hour forecasts are now expanded into a 24-hour forecast array (`00:00` to `23:00`) using nearest timestamp interpolation, ensuring every hour query has matching data.
   - Enhanced `at_hour` to gracefully fallback to the nearest available hour if an exact integer match isn't found.
   - Fixed `classify` and `forecast` to be completely null-safe against missing or `None` values (preventing `TypeError: '>=' not supported between instances of 'NoneType' and 'float'`).
   - Added automatic support in `_fetch_openmeteo` for both historical dates older than 92 days (`archive-api.open-meteo.com/v1/archive`) and distant future dates (> 16 days ahead) with Jaipur's 24h seasonal diurnal climatology.
   - In `frontend/src/clock.tsx`, added robust ISO normalization for the datetime-local picker.
2. **UI Dark Mode & Theme Contrast Fixes**:
   - Fixed hardcoded `#fff` and missing CSS custom properties in `TripShortlist.tsx` and `TripItineraryPage.tsx`.
   - Replaced all ad-hoc variables with proper Sanganer block-print tokens (`var(--panel)`, `var(--panel-2)`, `var(--ink)`, `var(--line)`, `var(--accent)`, `var(--accent-ink)`).
   - Inactive day tabs and meal/stay cards now render with high-contrast text and theme backgrounds in both light and dark modes.
3. **Environment & Typing Compatibility**:
   - Added `from __future__ import annotations` in `backend/app/env.py` and `backend/app/weather.py` for Python 3.9+ type union syntax compatibility.
4. **Verified Live Weather Across All Windows**:
   - Tested historical (`2026-02-25`), today (`2026-09-26`), near future (`2026-09-29`), and distant future (`2026-12-15`) — all returning `available=True` and valid 24h hourly data.

## Files touched
- `backend/app/weather.py`
- `backend/app/env.py`
- `CONTEXT.md`
- `docs/context/2026-09-26-18-weather-provider-fix.md`

## Current state
- Backend tests: 116 tests passing (115 passed, 1 skipped).
- Frontend: TypeScript clean build.
- Live weather chip displays real temperature and condition icon when connected.

## Next steps
- Proceed with the next requested feature (e.g. Phase 2 Onboarding & Profile Preferences sync, Phase 6 feedback loop, or user's custom feature).
