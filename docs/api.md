# API

The API is a thin, **stateless** wrapper over the engine. The server keeps no session. The client holds `state` (the traveler's situation) and `itinerary`, and sends them back on each call. The full JSON schema is live at **`http://localhost:8000/docs`** when the server is running. This page covers the shapes and the intended flow.

```bash
cd backend && .venv/Scripts/python -m uvicorn app.main:app --reload
```

**Frontend dev (M6/M7):** proxy the API through Vite instead of adding CORS. For example, `server.proxy: { "/api": { target: "http://localhost:8000", rewrite: p => p.replace(/^\/api/, "") } }`.

## Intent parser (`/chat`)
| `INTENT_PARSER` | Behaviour |
|---|---|
| `auto` (default) | Uses Claude if `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_PROFILE` is set, otherwise the rule parser |
| `llm` | Always tries Claude first (e.g. after `ant auth login`) |
| `rules` | Offline regex/keyword parser only. The tests use this. |

- **Claude settings:** model `claude-opus-5` with structured output (`ParsedRequest`), `effort: low`, and server-side refusal fallback (`fallbacks: "default"`).
- **Failure handling:** any failure (auth, network, refusal) silently falls back to the rule parser. The response's `parser` field tells you which one ran.
- **Claude only extracts.** Ranking, feasibility and explanations always come from the engine.

## Endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/health` | none | `{ok, experiences}` |
| GET | `/catalog` | none | `{places[], providers[], experiences[]}`, i.e. everything the map and provider views need |
| POST | `/chat` | `{text, state?, now?}` | `{parser, parsed, state, recommendations[], excluded{}, plan{itinerary, problems[]}}` |
| POST | `/discover` | `{state, k?=5}` | `{recommendations[], excluded{}}` |
| POST | `/plan` | `{state, itinerary?, max_new?=3}` | `{itinerary, problems[]}`. It fills gaps around existing stops; locked stops never move. |
| POST | `/events` | `{state, itinerary, event}` | `{itinerary, state, changes[], problems[]}` |

Unknown experience ids return `422`. An empty `problems` means the whole plan is feasible.

## Flow for the traveler UI
1. **First message.** Call `POST /chat {text, now?}`, then render `recommendations` (cards and map pins, using `lat`/`lon`), `plan.itinerary` (timeline) and, optionally, `excluded` (a "why not X?" panel). **Keep `state` and `plan.itinerary`.**
2. **Refinement.** Call `POST /chat {text: "actually, something less crowded", state}`. It merges into the previous state: anything the text doesn't mention stays as it was.
3. **User edits the plan** (lock, remove, or add a recommendation as a stop). Send the edited itinerary to `POST /plan` to fill the gaps again and re-check the plan.
4. **Something changes** (demo buttons: delay, rain, closure, tired, budget). Call `POST /events {state, itinerary, event}`, show `changes` as a diff, then **replace your `state` and `itinerary` with the response's.**

## Key shapes (abridged; the full schema is at `/docs`)
```jsonc
// TravelerState
{ "lat": 26.9239, "lon": 75.8267,
  "window_start": "2026-09-26T16:00:00", "window_end": "2026-09-26T18:00:00",  // naive IST
  "budget_inr": 1500,                                   // whole group
  "group": [{"name": "adult1", "age": 30, "interests": [], "accessibility": []}],
  "intents": ["local-food", "heritage"],                // closed Tag vocabulary, see models.py
  "mode": "auto", "pace": "normal", "indoor_only": false, "max_distance_km": null,
  "avoid_crowds": false, "novelty": 0.15, "weather": "clear",
  "end_lat": null, "end_lon": null }                    // where you must be by window_end

// Recommendation (a real /chat response, scenario A)
{ "experience_id": "ex-puppet-show", "title": "Kathputli puppet show", "score": 0.68,
  "lat": 26.897, "lon": 75.8107, "start": "2026-09-26T17:00:00", "end": "2026-09-26T17:45:00",
  "km": 3.4, "travel_min": 25, "cost_inr": 400, "confidence": 0.48, "low_confidence": true,
  "factors": {"preference": 0.6, "intent": 1.0, "...": 0},
  "reasons": ["3.4 km away, ~25 min by auto", "17:00–17:45, done before your 18:00 cutoff",
              "₹400 for 4, within your ₹1500 budget", "matches performance, kids",
              "run by a local community host", "⚠ price not independently confirmed"] }

// excluded
{ "ex-hawa-mahal": ["no time left to fit its 45 min after you arrive at 16:00 (open 09:00–16:30)"] }

// Stop (itinerary.stops[])
{ "title": "Kathputli puppet show", "experience_id": "ex-puppet-show", "lat": 26.897, "lon": 75.8107,
  "start": "...", "end": "...", "status": "proposed", "locked": false, "cost_inr": 400 }
// status: proposed | confirmed | active | completed | skipped | replaced (hide "replaced" in the UI)

// ContextEvent (POST /events)
{ "kind": "delay", "at": "2026-09-26T16:05:00", "delay_min": 40 }
{ "kind": "weather", "at": "...", "weather": "rain" }                 // rain | heat | clear
{ "kind": "closure", "at": "...", "experience_id": "ex-jantar-mantar" } // or provider_cancel
{ "kind": "fatigue", "at": "..." }
{ "kind": "budget_change", "at": "...", "budget_inr": 300 }            // left for unlocked plans ahead

// Change (events response changes[])
{ "action": "replaced", "stop": "Jantar Mantar observatory", "reason": "outdoors, and it's raining",
  "new_stop": "Hawa Mahal: Palace of Winds at 13:45", "why": ["0.4 km away, ~12 min by auto", "..."] }
// action: retimed | replaced | dropped | at_risk (a locked stop that broke; shown, not moved)
```

## Demo reproducibility
Pass `"now": "2026-09-26T15:30:00"` to `/chat` so the scenarios in `docs/ideation/mvp-scope.md` behave the same way every time. The seed's one-off events are on 2026-09-27 and 2026-10-03.
