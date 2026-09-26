# Roadmap

M2→M3→M4 is the critical path, because the engine is the product. Everything else runs in parallel once M1 is merged. Tick a milestone in the same PR that finishes it.

| # | Status | Stage | Done when |
|---|---|---|---|
| M0 | ✅ | Repo bootstrap + ideation gaps (`decisions.md`, `mvp-scope.md`) | Repo, templates, CI, context convention |
| M1 | ✅ | Domain models (`backend/app/models.py`) + Jaipur seed (50 experiences, 23 providers) + backend CI | Seed validates; loader tests pass |
| M2 | ✅ | Feasibility filter + ranking + explanations (`backend/app/engine`) | Persona tests pass; every result passes the independent feasibility validator |
| M3 | ✅ | Itinerary engine: gaps, sequence feasibility, lock/flexible | A 90-min gap between fixed stops returns only sequence-feasible fills |
| M4 | ✅ | Adaptation: closure, rain, delay, budget, tired → local replan with diff | Only the affected segment changes; locked stops untouched |
| M5 | ✅ | FastAPI endpoints + LLM intent parser + rule fallback | Scenarios A and B work via `/chat` with and without an API key |
| M6 | ✅ | Traveler UI: chat, map, itinerary, badges, disruption panel + frontend CI | Scenarios A and B run in the browser |
| M7 | ✅ | Provider UI: onboarding, availability, demand insights | Scenario C: a new provider shows up in traveler results |
| M8 | ✅ | Feedback loop, group mode, README polish, demo script + one-command start (team: rehearse, screenshots) | A stranger can run it; 5-min demo rehearsed |
| M9 | 🟡 | **Stretch, only after M8**, in order: ✅ live weather → ✅ post-visit ratings → ⬜ Hindi UI → ⬜ 360° previews → ✅ provider ownership + edits (⬜ location picker) → ✅ booking stub | Each item demoable without breaking the core |

Scenarios A, B and C are defined in `docs/ideation/mvp-scope.md`.

## Team split (5 people, after M1 merges)
| Owner | Track | Start with | Unblocked by |
|---|---|---|---|
| 1 | Engine | M2 → M3 → M4 in `backend/app/engine/` | Nothing; this is the critical path |
| 2 | API + LLM | Write `docs/api.md` (request/response shapes) **first**, then M5 with a stubbed engine and the rule-based parser | Models (done) |
| 3 | Traveler UI | M6 against mock JSON that follows `docs/api.md` | `docs/api.md` |
| 4 | Provider side | M7: onboarding (free text → `Experience`), SQLite store, demand insights | Models (done), `docs/api.md` |
| 5 | Data + demo | 10 labelled personas for the relevance metric (`backend/tests/personas.json`), seed enrichment, demo script, then M9 | Models (done) |

Each person works on their own `feat/*` branch, and every PR adds its own `docs/context/` file. If two people work on the same day, use different `NN` numbers or add your initials to the slug to avoid clashes.
