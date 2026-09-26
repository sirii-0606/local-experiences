# Decisions Log

Resolves the baseline doc's §16 open questions for the prototype. **Status: proposed defaults, needs team review.** Change a line here, not in code comments.

## Stack (confirmed 2026-09-26)
| Decision | Choice | Why |
|---|---|---|
| Backend | Python 3.12 + FastAPI + Pydantic | Engine logic is easy to test in Python |
| Frontend | React + Vite + TypeScript + Leaflet (OSM tiles) | Free map, no key |
| Storage | JSON seed in memory; stdlib `sqlite3` for provider edits + feedback | No ORM for ~50 records |
| AI | Claude API parses NL → `TravelerState`, phrases explanations from engine factors. Rule-based fallback. | Doc §7.5: explanations come from the same factors the engine used |
| Travel time | Haversine × mode speed (walk 4.5, auto 18, car 22 km/h) + 10 min buffer | No routing API. `ponytail:` upgrade to OSRM if accuracy matters |
| Weather/traffic | Mock context events triggered from a demo panel | Real feeds are out of MVP scope |
| City | Jaipur (seed data only, swappable) | Dense mix of food, craft, heritage, informal providers |

## §16 open questions → prototype answers
| Question | Answer |
|---|---|
| Minimum traveler state | location, available window (start/end), budget (₹ total), group (adults, children, seniors), intent tags. Everything else optional. |
| Hard vs soft constraints | **Hard (always):** fits time window incl. travel, open/available at that time, total price ≤ budget, group size ≤ capacity, required accessibility met, min age met. **User-toggleable hard:** indoor-only, max distance. **Soft:** interests, crowd preference, localness, pace, outdoor preference. |
| Localness definition | `localness = 0.5·community_led + 0.3·(provider based in same neighbourhood) + 0.2·(1 − tourist_index)`, each 0..1 in seed. |
| Evidence for "verified/available/accessible" | Each attribute carries `{value, source: provider/traveler/verified, updated_at}`. Confidence = source weight (verified 1.0, traveler-reported 0.7, provider 0.6) × recency decay (half-life 30 days). |
| Uncertainty in ranking | Multiply quality term by confidence; show a "low confidence" badge below 0.5. **Never hide.** Exception: a *hard* accessibility requirement needs confidence ≥ 0.5 to pass. |
| Relevance vs novelty | `novelty_weight` slider (default 0.15); boosted when the user says "hidden / less touristy / local". Popularity is positive when they ask for "iconic / must-see". |
| Group disagreement | Hard constraints = union of everyone's. Soft score = `0.7·mean + 0.3·min` of members' fit (penalizes leaving one person miserable). |
| User-locked itinerary | Confirmed bookings and user-locked stops are never touched. Completed stops are frozen. Only `flexible` stops and gaps are replanned. |
| Explicit vs inferred feedback | Explicit: accept, reject (with reason chip), rating. Inferred: skip/abandon. Inferred signals get weight 0.3 of explicit. |
| Provider structured vs free-form | Structured (required): title, category, duration, price model, location, hours/slots, capacity, accessibility flags. Free-form: description, story (LLM extracts tags from this). |
| Good alternative during replanning | Shares ≥1 intent tag with the original, fits the remaining window before the next locked stop, price ≤ original +20% or within remaining budget, and is closest in utility. Prefer fewest changed stops. |
| Where immersive adds value | Out of MVP. Roadmap: 360° previews for accessibility/atmosphere checks before booking. |

## Utility weights (initial, tuned in M2; will live in `backend/app/engine/weights.py`)
preference 0.25 · intent 0.20 · spatial 0.10 · budget 0.10 · quality×confidence 0.15 · localness 0.10 · context 0.10, then MMR diversity re-rank (λ = 0.7).
