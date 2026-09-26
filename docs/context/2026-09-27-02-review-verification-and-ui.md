# Review verification engine, remaining UI, honest data

## What changed
- **Merged the teammate's `origin/main`** (social signals, digital twin, repo-wide `ruff format`) into the any-city work and pushed `main` (`a5373c0`). The LLM parser no longer receives weather advice (the LLM only extracts; the engine applies live weather at the traveler's place).
- **Review verification engine** (`backend/app/engine/reviews.py`, `routes/reviews.py`), built from the user's "how to spot the bot" brief: machine-written style, no specifics, bursts, near-copies, repeated claims, extreme ratings weighted down, booking-verified visits. Only trusted reviews become rating evidence. `POST /reviews`, `GET /reviews/{id}`, `POST /reviews/check`.
- **Weather summary** uses real humidity/wind from Open-Meteo, is location-aware, and says "unavailable" instead of inventing values.
- **UI** (current design kept):
  - `/` is a product landing page (no city named); Explore moved to `/explore` and accepts `?q=`.
  - `/onboarding` renders the backend's questions, a few per step, and ends with a past-trip import. Sign-up lands there.
  - Profile shows preferences and **"What we've learned about you"** (summary, per-tag weights with source, forget one or all, import a trip).
  - Explore: a context strip (where, weather, traffic, places checked, profile used, closed now with next opening, assumptions), "📍 use my location" in chat, **Add to calendar** (.ics download + per-stop Google links), **Reviews** dialog per card (trust report + write a review with optional booking code), area catalog so non-Jaipur results render.
  - `/verify` checks any pasted reviews (with labelled made-up examples).
  - Host form: pin or area when no landmark fits, and "We'll match it with" segments.
- **Honesty fixes found while wiring it up:** Explore invented recommendations/plan stops when the engine found nothing, defaulted to 4.9★, fell back to "32°C clear"; the budget slider's default silently replaced the engine's picks with the whole catalog (closed places included); a Hawa Mahal photo was the fallback for any place; three photo URLs were dead; the header weather chip was always Jaipur; the social feed looked live (now labelled sample data); the first chat message was read against the demo family instead of the traveler's profile; transport buttons didn't change the mode.
- **Bugs found in the backend:** geocoding ignored the India filter (`country_code` vs `countryCode`; "versova" resolved to Greece); "at home in versova" lost the place; rule drafts titled "I'm Kavita with Kavita".
- **Security:** map popups escaped user-submitted titles/reports (XSS).

## Why
The user asked to push, then build the remaining UI, and gave the fake-review brief. They also asked for nothing hallucinated, so every value the UI shows now comes from the engine or a real source.

## Files touched
Backend: `engine/reviews.py`, `routes/reviews.py` (new); `store.py`, `main.py`, `weather.py`, `opendata.py`, `intent.py`, `provider.py`; tests `test_reviews.py` (new), `test_anywhere.py`. Frontend: `pages/{LandingPage,OnboardingPage,VerifyPage}.tsx`, `ReviewsPanel.tsx` (new); `App.tsx`, `Layout.tsx`, `MapView.tsx`, `ProviderView.tsx`, `api.ts`, `auth.tsx`, `photos.ts`, `styles.css`, `pages/{ExplorePage,ProfilePage,AuthPages,TripsPage}.tsx`. Docs: `api.md`, `decisions.md`, `openapi.json`, `CONTEXT.md`.

## Current state
- Backend 144 passed, 1 skipped; ruff clean. Frontend `npm run build` clean.
- Walked through in the browser against the real backend: sign-up → onboarding (76, heritage/history/museum, no nature, companion, car, Pune, Hampi trip) → Explore "I'm with my family, it's 6 pm in pune" → context strip with Kelkar Museum closed until Mon 10:00, 5 open heritage picks, 2-stop plan → calendar dialog (18:15 → 12:45Z, leave-by reminders) → review posted and counted → `/verify` bot-burst example (12 of 14 set aside, 3.5★ vs 4.8★) → profile context → host draft for Versova, Mumbai. Test account and review removed afterwards.

## Known gaps
- The demo clock resets on a full page load (existing behavior).
- Modals close by the ✕ or clicking outside, not Escape.
- Explore's left filters (group, time window) still set demo groups; the chat is the primary way to describe the traveler.
- Review checks are heuristics; no author accounts on reviews yet (anyone can post; only booking codes verify).
- The social feed is sample data; the digital twin is Jaipur-only.

## How to proceed next
1. Push this branch to `main` when the user says so.
2. Optional: Escape-to-close for modals; make the filters edit the chat state instead of demo groups.
3. Google Calendar OAuth sync; `/trips` for any city; tie reviews to signed-in users.
