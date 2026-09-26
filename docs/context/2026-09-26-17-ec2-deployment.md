# 2026-09-26-17 · Production build and AWS EC2 deployment with fast update workflow

## What changed
Prepared the project for production deployment on AWS EC2 and rapid code updates during active development:

- **Backend production routing & proxy support** (`backend/app/main.py`, `backend/app/routes/{deps,auth}.py`, `backend/app/{store,accounts}.py`):
  - `_prod_routing` HTTP middleware strips `/api` prefixes so the compiled frontend works directly against FastAPI without Vite's dev proxy, and serves `STATIC_DIR` (`frontend/dist`) with SPA `index.html` fallback when `STATIC_DIR` is set. OpenAPI paths (`docs/openapi.json`) remain unchanged.
  - `deps.set_session_cookie` checks `X-Forwarded-Proto: https` so session cookies work over both plain HTTP (initial EC2 IP) and reverse-proxied HTTPS.
  - `auth._ip` reads `X-Forwarded-For` so login throttling isolates clients behind Nginx rather than throttling `127.0.0.1`.
  - SQLite connections in `store.py` and `accounts.py` auto-create parent directories for `DB_PATH`, use `timeout=10`, and enable `journal_mode=wal` for concurrent EC2 requests.
- **Production build & EC2 scripts** (`scripts/prod.py`, `scripts/ec2_setup.sh`, `scripts/ec2_update.sh`):
  - `scripts/prod.py`: builds `frontend/dist` and runs single-port production `uvicorn` on `:8000` (supports `--build-only`, `--no-build`, `--reset`).
  - `scripts/ec2_setup.sh`: one-time provisioner for Ubuntu 22.04/24.04 or Amazon Linux 2023 (installs Python 3.12, Node 22, Nginx, SQLite; sets up `/var/lib/local-experiences/local.db` and `/etc/local-experiences.env`; configures `local-experiences.service` and Nginx reverse proxy on port 80).
  - `scripts/ec2_update.sh`: fast update script supporting 3 modes: on-EC2 git pull (`./scripts/ec2_update.sh`), remote SSH git pull (`EC2_HOST=ubuntu@<ip> ./scripts/ec2_update.sh`), and instant live `rsync` for uncommitted local edits (`EC2_HOST=ubuntu@<ip> ./scripts/ec2_update.sh --sync`). Skips `pip install` and `npm ci` when dependency manifests haven't changed and backs up `local.db` before restarting.
- **CI/CD & containers** (`.github/workflows/deploy-ec2.yml`, `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `docs/deploy-ec2.md`):
  - GitHub Actions workflow auto-deploys to EC2 on push to `main` or manual `workflow_dispatch` when `EC2_HOST` and `EC2_SSH_KEY` secrets are set (no-op otherwise).
  - Multi-stage `Dockerfile` and `docker-compose.yml` for optional container deployment.
  - Step-by-step guide in `docs/deploy-ec2.md`.

## Why
The user asked to build the project properly for deployment on an AWS EC2 instance while supporting frequent code updates as development continues.

## Files touched
`backend/app/{main,store,accounts}.py`, `backend/app/routes/{deps,auth}.py`, `backend/tests/test_m9_backend.py`, `scripts/{prod.py,ec2_setup.sh,ec2_update.sh}`, `.github/workflows/deploy-ec2.yml`, `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `docs/deploy-ec2.md`, `CLAUDE.md`, `README.md`, `CONTEXT.md`

## Current state
- Backend: **110 pass**, 1 skipped (live LLM). `ruff check .` is clean. `test_contract.py` passes with `docs/openapi.json` unchanged.
- Frontend: `npm run build` (`tsc --noEmit && vite build`) succeeds and outputs `frontend/dist/`.
- Production runner (`python scripts/prod.py --build-only`) and SPA + `/api/*` routing verified.

## Known gaps
- HTTPS on EC2 requires a domain name pointing to the instance's Elastic IP before running Certbot (`sudo certbot --nginx`); until then, HTTP on port 80 works out of the box (session cookies adapt automatically via `X-Forwarded-Proto`).
- Login failure throttling in `accounts.py` remains in-memory per worker process (`ponytail:` comment).

## How to proceed next
1. Deploy to EC2 using `bash scripts/ec2_setup.sh` and push frequent updates via `./scripts/ec2_update.sh` or `EC2_HOST=ubuntu@<ip> ./scripts/ec2_update.sh --sync` (see [`docs/deploy-ec2.md`](../deploy-ec2.md)).
2. Continue Website v2 roadmap: **P4** (multi-day scoring, shortlist, and `stays.json`) or **P2** (onboarding and rich profile preferences).
