# Local & Experiences

Context-aware local experience discovery + planning platform (hackathon). Conceptual baseline: `docs/ideation/Local_Experiences_Comprehensive_Ideation_Document.docx` (text copy: `docs/ideation/baseline-extracted.txt`). Build plan and scope: `docs/ideation/decisions.md`, `docs/ideation/mvp-scope.md`.

**Start every session by reading `CONTEXT.md`** — it has current state and the next step.

## Rules
- **Every change ships a context file.** Add `docs/context/YYYY-MM-DD-NN-slug.md` (sections: What changed · Why · Files touched · Current state · Known gaps · How to proceed next) and overwrite `CONTEXT.md` with the latest state + next steps. CI fails on code changes without one.
- Architecture: one pure-Python engine (`backend/app/engine`) does feasibility, ranking, itinerary, replanning. UI/chat/API are thin consumers. LLM only parses text → `TravelerState` and phrases explanations from engine factors; it never decides. Rule-based fallback must work with no API key.
- Feasibility before ranking; hard constraints ≠ soft preferences; low-confidence is flagged, never silently hidden.
- Minimal code: stdlib first, no ORM, no routing API, no unrequested abstractions. Mark deliberate shortcuts with a `ponytail:` comment.
- Git: `main` is not protected (team choice); work on `feat/*` `fix/*` `docs/*`; conventional commits; PR + squash merge, or fast-forward `main` when the user asks. Never push or create remotes without the user's go-ahead.
- LLM: `claude-opus-5` via `intent.claude_parse()` (shared by traveler intents and provider drafts; anthropic SDK 1.x uses `httpx2`). Always pair it with a rule fallback through `intent.llm_or_rules()`. Tests never hit the network (`INTENT_PARSER=rules`).
- Website v2 (accounts, profile, admin, and trips from P3) is **contract-first and additive**: models in `backend/app/schemas.py`, routers in `backend/app/routes/` mounted at the end of `main.py` (don't move the existing endpoints). After any API change, run `backend/.venv/Scripts/python scripts/openapi_snapshot.py` (`tests/test_contract.py` enforces it) and update `frontend/src/types.ts` and the mock in `frontend/src/mocks/`.
- Auth: `accounts.py` (scrypt, session tokens stored as sha256) plus `routes/deps.py` (`current_user`, `require_role`, `csrf`). Never log passwords, tokens or profile fields. Admins never see profile data.
- Runtime data (provider listings, pauses, demand log) lives in SQLite via `backend/app/store.py`, overlaid onto the read-only JSON seed by `store.current_seed()`. Tests get a temp DB (`tests/conftest.py`). Never log location or free text.

## Commands
- Everything at once: `python scripts/dev.py [--reset]` (installs on first run; API :8000 + web :5173). Demo script: `docs/demo.md`
- Backend setup: `cd backend && python -m venv .venv && .venv/Scripts/python -m pip install -e ".[dev]"` (use `.venv/bin/` on macOS/Linux)
- Backend tests: `cd backend && .venv/Scripts/python -m pytest`
- Backend lint: `cd backend && .venv/Scripts/ruff check .`
- Backend run: `cd backend && .venv/Scripts/python -m uvicorn app.main:app --reload` (schema at `/docs`, contract in `docs/api.md`)
- Frontend: `cd frontend && npm install && npm run dev` (Vite on :5173, proxies `/api` → :8000); type-check + build: `npm run build`
- Context check: `python scripts/check_context.py <base-ref>`
- API contract snapshot: `backend/.venv/Scripts/python scripts/openapi_snapshot.py` (commit `docs/openapi.json` with the change)
- Frontend against a mock API: `cd frontend && VITE_API_MOCK=1 npm run dev`; against another backend: `API_TARGET=http://host:port PORT=5174 npm run dev`
- Admin sign-in: start the backend with `ADMIN_EMAIL` and `ADMIN_PASSWORD` (8+ chars) set
- Production build + single-port run: `python scripts/prod.py [--build-only | --no-build | --reset]` (serves `frontend/dist` + `/api/*` on `:8000`)
- AWS EC2 deployment & fast updates: `bash scripts/ec2_setup.sh` (one-time) and `./scripts/ec2_update.sh [--sync]` (guide: `docs/deploy-ec2.md`)
