# Local & Experiences

Context-aware local experience discovery + planning platform (hackathon). Conceptual baseline: `docs/ideation/Local_Experiences_Comprehensive_Ideation_Document.docx` (text copy: `docs/ideation/baseline-extracted.txt`). Build plan and scope: `docs/ideation/decisions.md`, `docs/ideation/mvp-scope.md`.

**Start every session by reading `CONTEXT.md`** — it has current state and the next step.

## Rules
- **Every change ships a context file.** Add `docs/context/YYYY-MM-DD-NN-slug.md` (sections: What changed · Why · Files touched · Current state · Known gaps · How to proceed next) and overwrite `CONTEXT.md` with the latest state + next steps. CI fails on code changes without one.
- Architecture: one pure-Python engine (`backend/app/engine`) does feasibility, ranking, itinerary, replanning. UI/chat/API are thin consumers. LLM only parses text → `TravelerState` and phrases explanations from engine factors; it never decides. Rule-based fallback must work with no API key.
- Feasibility before ranking; hard constraints ≠ soft preferences; low-confidence is flagged, never silently hidden.
- Minimal code: stdlib first, no ORM, no routing API, no unrequested abstractions. Mark deliberate shortcuts with a `ponytail:` comment.
- Git: `main` is not protected (team choice); work on `feat/*` `fix/*` `docs/*`; conventional commits; PR + squash merge, or fast-forward `main` when the user asks. Never push or create remotes without the user's go-ahead.
- LLM: `claude-opus-5` via `client.beta.messages.parse` in `backend/app/intent.py` (anthropic SDK 1.x uses `httpx2`). Tests never hit the network (`INTENT_PARSER=rules`).

## Commands
- Backend setup: `cd backend && python -m venv .venv && .venv/Scripts/python -m pip install -e ".[dev]"` (use `.venv/bin/` on macOS/Linux)
- Backend tests: `cd backend && .venv/Scripts/python -m pytest`
- Backend lint: `cd backend && .venv/Scripts/ruff check .`
- Backend run: `cd backend && .venv/Scripts/python -m uvicorn app.main:app --reload` (schema at `/docs`, contract in `docs/api.md`)
- Frontend (from M6): `cd frontend && npm run dev`
- Context check: `python scripts/check_context.py <base-ref>`
