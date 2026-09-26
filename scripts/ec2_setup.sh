#!/usr/bin/env bash
# One-time setup for a fresh AWS EC2 instance (Ubuntu 22.04/24.04 LTS or Amazon Linux 2023).
# Run from the repository root on EC2:
#     bash scripts/ec2_setup.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_USER="${SUDO_USER:-$USER}"
DATA_DIR="/var/lib/local-experiences"
ENV_FILE="/etc/local-experiences.env"

echo "==> [1/6] Installing system packages (Python 3.12, Node.js 22, Nginx, SQLite)..."
if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y curl git nginx sqlite3 software-properties-common
  if ! command -v python3.12 >/dev/null 2>&1; then
    sudo add-apt-repository -y ppa:deadsnakes/ppa
    sudo apt-get update -y
    sudo apt-get install -y python3.12 python3.12-venv python3.12-dev
  else
    sudo apt-get install -y python3-venv python3.12-venv || true
  fi
  if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y git nginx sqlite python3.12 python3.12-pip
  if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
    sudo dnf install -y nodejs
  fi
else
  echo "Unsupported OS package manager. Install Python 3.12+, Node 22+, and Nginx manually." >&2
  exit 1
fi

PY_BIN="$(command -v python3.12 || command -v python3)"

echo "==> [2/6] Preparing persistent data directory (${DATA_DIR}) and ${ENV_FILE}..."
sudo mkdir -p "${DATA_DIR}"
sudo chown -R "${APP_USER}:${APP_USER}" "${DATA_DIR}"
chmod o+x "${HOME}" || true

if [ ! -f "${ENV_FILE}" ]; then
  sudo tee "${ENV_FILE}" >/dev/null <<EOF
# Local & Experiences production configuration
DB_PATH=${DATA_DIR}/local.db
STATIC_DIR=${ROOT}/frontend/dist
WEBSITE_V2=1
# Uncomment and set to bootstrap an admin account on sign-in (password 8+ chars):
# ADMIN_EMAIL=admin@example.com
# ADMIN_PASSWORD=change-this-password
# Uncomment to use Claude for intent/draft parsing (offline rules used if unset):
# ANTHROPIC_API_KEY=sk-ant-...
EOF
  sudo chmod 600 "${ENV_FILE}"
  sudo chown "${APP_USER}:${APP_USER}" "${ENV_FILE}"
  echo "    Created ${ENV_FILE}"
else
  echo "    Keeping existing ${ENV_FILE}"
fi

echo "==> [3/6] Setting up Python backend virtualenv..."
if [ ! -x "${ROOT}/backend/.venv/bin/python" ]; then
  "${PY_BIN}" -m venv "${ROOT}/backend/.venv"
fi
"${ROOT}/backend/.venv/bin/python" -m pip install --upgrade pip -q
"${ROOT}/backend/.venv/bin/python" -m pip install -q -e "${ROOT}/backend[dev]"

echo "==> [4/6] Building React frontend (frontend/dist)..."
(cd "${ROOT}/frontend" && npm ci && npm run build)

echo "==> [5/6] Configuring systemd service (local-experiences.service)..."
sudo tee /etc/systemd/system/local-experiences.service >/dev/null <<EOF
[Unit]
Description=Local & Experiences FastAPI Backend
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${ROOT}/backend
EnvironmentFile=${ENV_FILE}
ExecStart=${ROOT}/backend/.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips=127.0.0.1
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable local-experiences
sudo systemctl restart local-experiences

echo "==> [6/6] Configuring Nginx reverse proxy on port 80..."
sudo rm -f /etc/nginx/sites-enabled/default
sudo tee /etc/nginx/conf.d/local-experiences.conf >/dev/null <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    root ${ROOT}/frontend/dist;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript image/svg+xml;
    gzip_min_length 1024;

    # Hashed Vite assets can be cached long-term
    location /assets/ {
        try_files \$uri @backend;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # API & OpenAPI endpoints -> FastAPI on 127.0.0.1:8000
    location ~ ^/(api|docs|redoc|openapi\.json|health)(/|$) {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    # SPA routes (/trips, /login, /provider, etc.)
    location / {
        try_files \$uri \$uri/ /index.html @backend;
    }

    location @backend {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx

echo "==> Waiting for backend health check..."
for _ in {1..20}; do
  if curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1; then
    echo ""
    echo "  OK - Local & Experiences is deployed and live!"
    echo "  Health: $(curl -fsS http://127.0.0.1:8000/health)"
    echo "  Config: ${ENV_FILE}"
    echo "  Update anytime with: ./scripts/ec2_update.sh"
    exit 0
  fi
  sleep 1
done

echo "ERROR: Service did not pass health check. Check logs with: sudo journalctl -u local-experiences -n 50" >&2
exit 1
