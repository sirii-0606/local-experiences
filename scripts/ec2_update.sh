#!/usr/bin/env bash
# Fast update script for active development on AWS EC2.
#
# Usage:
#   1. Directly on the EC2 instance (pulls from git, rebuilds changed layers, restarts):
#        ./scripts/ec2_update.sh [branch] [--full]
#
#   2. From your laptop via Git (SSHes into EC2 and runs git pull + build + restart):
#        EC2_HOST=ubuntu@<ec2-ip> [EC2_KEY=~/.ssh/key.pem] ./scripts/ec2_update.sh [branch]
#
#   3. From your laptop via Live Rsync (pushes uncommitted local edits directly to EC2 in ~2s):
#        EC2_HOST=ubuntu@<ec2-ip> [EC2_KEY=~/.ssh/key.pem] ./scripts/ec2_update.sh --sync
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EC2_PATH="${EC2_PATH:-~/local-experiences}"

# ---------------------------------------------------------------- Remote mode (run from laptop)
if [ -n "${EC2_HOST:-}" ]; then
  SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
  if [ -n "${EC2_KEY:-}" ]; then
    SSH_OPTS+=(-i "${EC2_KEY}")
  fi

  if [[ " $* " == *" --sync "* ]]; then
    echo "==> Syncing local working tree to ${EC2_HOST}:${EC2_PATH}..."
    rsync -az --delete \
      --exclude '.git/' \
      --exclude '.venv/' \
      --exclude 'node_modules/' \
      --exclude 'dist/' \
      --exclude '__pycache__/' \
      --exclude '*.pyc' \
      --exclude '*.db' \
      --exclude '*.db-*' \
      --exclude '.pytest_cache/' \
      --exclude '.ruff_cache/' \
      -e "ssh ${SSH_OPTS[*]}" \
      "${ROOT}/" "${EC2_HOST}:${EC2_PATH}/"
    echo "==> Building and restarting on ${EC2_HOST}..."
    ssh "${SSH_OPTS[@]}" "${EC2_HOST}" "cd ${EC2_PATH} && ./scripts/ec2_update.sh --no-git"
    exit 0
  else
    echo "==> Triggering git update on ${EC2_HOST}:${EC2_PATH}..."
    ssh "${SSH_OPTS[@]}" "${EC2_HOST}" "cd ${EC2_PATH} && ./scripts/ec2_update.sh $*"
    exit 0
  fi
fi

# ---------------------------------------------------------------- On-EC2 mode
cd "${ROOT}"
BRANCH=""
FULL=0
NO_GIT=0
for arg in "$@"; do
  case "${arg}" in
    --full) FULL=1 ;;
    --no-git) NO_GIT=1 ;;
    --sync) ;;
    *) BRANCH="${arg}" ;;
  esac
done

OLD_HEAD="$(git rev-parse HEAD 2>/dev/null || echo none)"

if [ "${NO_GIT}" -eq 0 ]; then
  if [ -z "${BRANCH}" ]; then
    BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  fi
  echo "==> Pulling latest code from origin/${BRANCH}..."
  git fetch origin "${BRANCH}"
  git checkout "${BRANCH}"
  git reset --hard "origin/${BRANCH}"
fi

NEW_HEAD="$(git rev-parse HEAD 2>/dev/null || echo sync)"

# Only reinstall Python packages if pyproject.toml changed or --full was passed
if [ "${FULL}" -eq 1 ] || [ ! -x backend/.venv/bin/python ] || \
   [ "${OLD_HEAD}" = "none" ] || [ "${NO_GIT}" -eq 1 ] || \
   ! git diff --quiet "${OLD_HEAD}" "${NEW_HEAD}" -- backend/pyproject.toml; then
  echo "==> Updating backend Python dependencies..."
  backend/.venv/bin/python -m pip install -q -e "backend[dev]"
fi

# Only run npm ci if package-lock.json changed or node_modules is missing
if [ "${FULL}" -eq 1 ] || [ ! -d frontend/node_modules ] || \
   ( [ "${OLD_HEAD}" != "none" ] && [ "${NO_GIT}" -eq 0 ] && \
     ! git diff --quiet "${OLD_HEAD}" "${NEW_HEAD}" -- frontend/package-lock.json frontend/package.json ); then
  echo "==> Installing frontend npm packages..."
  (cd frontend && npm ci)
fi

echo "==> Building frontend (Vite)..."
(cd frontend && npm run build)

# Backup SQLite database before restarting
DB_FILE="/var/lib/local-experiences/local.db"
if [ -f "${DB_FILE}" ]; then
  cp -f "${DB_FILE}" "${DB_FILE}.bak"
fi

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files | grep -q "^local-experiences\.service"; then
  echo "==> Restarting local-experiences systemd service..."
  sudo systemctl restart local-experiences
  for _ in {1..15}; do
    if curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1; then
      echo "  OK - Updated to ${NEW_HEAD:0:7}: $(curl -fsS http://127.0.0.1:8000/health)"
      exit 0
    fi
    sleep 1
  done
  echo "ERROR: Service failed health check after restart." >&2
  sudo journalctl -u local-experiences -n 30 --no-pager >&2
  exit 1
else
  echo "  OK - Build complete (${NEW_HEAD:0:7}). Start with: python scripts/prod.py --no-build"
fi
