# Roadmap

The order is strict from M0 to M5, because the engine is the product. M6 and M7 can run in parallel. Tick a milestone off in the same PR that finishes it.

| # | Status | Stage | Done when |
|---|---|---|---|
| M0 | ✅ | Repo bootstrap + ideation gaps (`decisions.md`, `mvp-scope.md`) | Repo, templates, CI, context convention in place |
| M1 | ⬜ | Domain models (Pydantic) + Jaipur seed (~50 experiences, ~15 providers) + backend CI job | Seed validates; loader test passes |
| M2 | ⬜ | Feasibility filter + ranking + explanations (`backend/app/engine`) | Persona tests pass; every result passes the independent feasibility validator |
| M3 | ⬜ | Itinerary engine: gaps, sequence feasibility, lock/flexible | 90-min gap between fixed stops returns only sequence-feasible fills |
| M4 | ⬜ | Adaptation: closure, rain, delay, budget, tired → local replan with diff | Only the affected segment changes; locked stops untouched |
| M5 | ⬜ | FastAPI endpoints + LLM intent parser + rule fallback | Scenarios A and B work via `/chat` with and without an API key |
| M6 | ⬜ | Traveler UI: chat, map, itinerary, badges, disruption panel + frontend CI job | Scenarios A and B run in the browser |
| M7 | ⬜ | Provider UI: onboarding, availability, demand insights | Scenario C: a new provider shows up in traveler results |
| M8 | ⬜ | Feedback loop, group mode, README polish, demo rehearsal | A stranger can run it; 5-min demo rehearsed |

Scenarios A, B and C are defined in `docs/ideation/mvp-scope.md`.
