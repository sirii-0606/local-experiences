# Local & Experiences

Context-aware local experience discovery + planning platform (hackathon). Conceptual baseline: `docs/ideation/Local_Experiences_Comprehensive_Ideation_Document.docx` (text copy: `docs/ideation/baseline-extracted.txt`). Build plan and scope: `docs/ideation/decisions.md`, `docs/ideation/mvp-scope.md`.

**Start every session by reading `CONTEXT.md`** — it has current state and the next step.

## Rules
- **Every change ships a context file.** Add `docs/context/YYYY-MM-DD-NN-slug.md` (sections: What changed · Why · Files touched · Current state · Known gaps · How to proceed next) and overwrite `CONTEXT.md` with the latest state + next steps. CI fails on code changes without one.
- Architecture: one pure-Python engine (`backend/app/engine`) does feasibility, ranking, itinerary, replanning. UI/chat/API are thin consumers. LLM only parses text → `TravelerState` and phrases explanations from engine factors; it never decides. Rule-based fallback must work with no API key.
- Feasibility before ranking; hard constraints ≠ soft preferences; low-confidence is flagged, never silently hidden.
- Minimal code: stdlib first, no ORM, no routing API, no unrequested abstractions. Mark deliberate shortcuts with a `ponytail:` comment.
- Git: `main` protected; work on `feat/*` `fix/*` `docs/*`; conventional commits; PR + squash merge. Never push or create remotes without the user's go-ahead.

## Commands
- Backend tests: `cd backend && python -m pytest`
- Backend lint: `cd backend && ruff check .`
- Backend run (from M5): `cd backend && uvicorn app.main:app --reload`
- Frontend (from M6): `cd frontend && npm run dev`
- Context check: `python scripts/check_context.py <base-ref>`
