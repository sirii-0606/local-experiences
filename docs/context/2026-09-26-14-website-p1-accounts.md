# 2026-09-26-14 · Website v2, P1: accounts, authorisation, admin, profile shell

## What changed
The user approved `docs/website-v2-plan.md`, a website skeleton covering user management, onboarding, a "Plan a trip" workflow, an interactive/printable itinerary and group splits. They added a condition: **the backend is still in development, so don't treat it as final.** P1 is built contract-first and purely additive.

**Backend** (existing endpoints untouched):
- `app/schemas.py` is the v2 contract: `RegisterRequest`, `LoginRequest`, `User`, `Profile` (interests, dislikes, accessibility, walking limit, rest breaks, diet, pace, budget style, transport, languages, companions), `Companion`, `PasswordChange`, `DeleteAccount`, `AdminUserRow` (account facts only), `AdminUserPatch`, `AdminStats`.
- `app/accounts.py` (stdlib):
  - scrypt password hashing; sessions stored as sha256 of random tokens, 7-day expiry.
  - Tables `users`, `sessions`, `profiles` in the same SQLite file.
  - Profile get/put, export, delete, stats; admin bootstrap from `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
  - An in-memory login throttle (`ponytail:` noted: per process).
- `app/routes/deps.py`: `current_user` (401), `require_role` (403), `csrf` (the `X-Requested-With: le` header on writes), and cookie helpers (HttpOnly, SameSite=Lax, Secure on https).
- `app/routes/auth.py`: `/auth/register|login|logout|me`.
- `app/routes/me.py`: `/me/profile` GET/PUT, `/me/password` (signs out other devices), `/me/export`, DELETE `/me` (password re-confirm; last-admin guard).
- `app/routes/admin.py`: `/admin/users`, PATCH `/admin/users/{id}` (role, disable which revokes sessions, temp password; last-admin and self-disable guards), `/admin/stats`.
- `main.py`: only an appended block that mounts the three routers behind **`WEBSITE_V2`** (default on).
- **Contract safety net:** `scripts/openapi_snapshot.py` writes `docs/openapi.json` (27 paths), and `tests/test_contract.py` fails when the live API differs, with instructions.
- ruff: FastAPI's `Depends`/`Header` idiom is whitelisted for B008 in `pyproject.toml`.

**Frontend:**
- `react-router` (the one new dependency). `App.tsx` is now the route table; `main.tsx` adds `BrowserRouter`, `AuthProvider` and `ClockProvider`.
- `Layout.tsx`: the header with nav (Explore, Plan a trip, Provider, Admin for admins), the demo clock, live weather, the user menu, and a "mock API" badge.
- `pages/ExplorePage.tsx`: the old traveler screen, moved by a scripted transformation with identical logic. `pages/ProviderPage.tsx` wraps `ProviderView`.
- New pages: `pages/AuthPages.tsx` (sign in, register, with `?next=` return), `pages/ProfilePage.tsx` (account facts, name and home city, password, download my data, delete account), `pages/AdminPage.tsx` (stats, users table with role, active/disabled, temp password), and `pages/TripsPage.tsx` (a signed-in placeholder until P3).
- `auth.tsx` (context plus a `RequireAuth role` guard), `clock.tsx` (demo clock and live weather shared by pages).
- `types.ts` mirrors `schemas.py`. `v2api.ts` is the real client, **or the in-memory mock with `VITE_API_MOCK=1`** (`mocks/v2.ts`, demo admin `admin@example.com`, same error messages).
- `api.ts`: `call` is exported, sends `X-Requested-With: le`, and handles 204.
- `vite.config.ts`: `API_TARGET` and `PORT` env overrides (point the UI at another or a teammate's backend), with `strictPort`.
- CSS for pages, forms, tables and nav links.

**Docs and tooling:**
- `docs/website-v2-plan.md`: the approved plan, in the repo.
- `docs/api.md`: the v2 section. `decisions.md`: a Website v2 table (auth, roles, sensitive data, contract-first, password reset). `CLAUDE.md`: rules and commands.
- `dev.py`: prints an admin-setup tip when `ADMIN_EMAIL` is unset.

## Why
User management is the base of the website plan (accounts own trips from P3 onward). Contract-first plus additive work lets the backend keep changing without blocking the frontend or breaking the existing app.

## Files touched
`backend/app/{schemas,accounts,main}.py`, `backend/app/routes/*`, `backend/tests/{test_accounts,test_contract}.py`, `backend/pyproject.toml`, `scripts/{openapi_snapshot,dev}.py`, `docs/{openapi.json,api.md,website-v2-plan.md}`, `docs/ideation/decisions.md`, `frontend/src/{App,main,Layout,auth,clock,types,v2api,api}.ts(x)`, `frontend/src/pages/*`, `frontend/src/mocks/v2.ts`, `frontend/src/styles.css`, `frontend/vite.config.ts`, `frontend/package.json` (+lock), `CLAUDE.md`, `CONTEXT.md`

## Current state
- Backend: **105 pass**, 1 skipped (live LLM). There are 14 new account tests:
  - hashing; register, me, cookie; duplicate and bad input; login, logout, wrong password; throttle 429; expired and forged sessions; CSRF.
  - profile round-trip and validation; password change signs out other devices; export has no secrets; delete wipes.
  - role guards; admins never see profile data; disable, promote, temp password; last-admin protection.
  - Plus 1 contract test.
- Ruff is clean. The frontend builds in both normal and mock mode.
- **Browser, against an isolated backend on :8001 and UI on :5174 with a scratch DB** (the user's running app on 8000/5173 was left alone):
  - `/trips` signed out redirects to `/login?next=/trips`; register returns to `/trips`.
  - Profile save and password change ("other devices signed out") work, and so does sign-out.
  - The env admin sign-in shows the Admin tab. Stats and users load; role → provider and disable ("signed out") work; self-disable is locked; no profile data leaks.
  - Explore (the family example, same 2-stop plan) and Provider work unchanged under the router.
  - The test DB and credentials were deleted afterwards.

## Known gaps
- **Your running `dev.py` backend is old code** until restarted. Its UI (hot-reloaded) shows "Sign in", but `/auth` returns 404 until then.
- There's no email verification or reset email (admin temp password instead). The login throttle is per process.
- The profile page edits only name and home city; full preferences are **P2 onboarding**.
- Listings aren't linked to accounts yet (edit tokens still work). Admin pause for curated experiences is still via `SEED_ADMIN_TOKEN`; switching it to the admin role changes an existing endpoint, so it's deferred to when the backend owners agree.

## How to proceed next
1. Restart `python scripts/dev.py` with `ADMIN_EMAIL` and `ADMIN_PASSWORD` set to try the accounts.
2. **P2, onboarding** (per the plan):
   - a 4-step `/onboarding` after register (About you → Likes & dislikes → Accessibility & pace → Travel style), reusing `PUT /me/profile`; a profile preferences editor and companions.
   - Explore pre-fill: profile interests and accessibility go to the group member, and dislikes seed `state.learned = -0.6`.
   - Update `types.ts` and the mock if the contract changes, and regenerate the snapshot.
3. Then P3: the trip model and wizard (`/trips/new`), with stubs first per the contract-first rule.
