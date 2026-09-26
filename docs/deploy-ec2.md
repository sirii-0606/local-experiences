# Deploying to AWS EC2 (With Fast Development Updates)

This guide covers how to deploy **Local & Experiences** on an AWS EC2 instance and push frequent code updates in ~2 seconds while the project is in active development.

---

## Architecture in Production

```
Browser (Port 80 / 443)
   │
   ▼
Nginx Reverse Proxy (/etc/nginx/conf.d/local-experiences.conf)
   ├── /assets/*        ──► Served directly from frontend/dist/assets (gzip + 30d cache)
   ├── /api/*, /health  ──► Proxied to FastAPI (127.0.0.1:8000) with X-Forwarded-* headers
   └── /* (SPA routes)  ──► Serves frontend/dist/index.html (React Router fallback)
                               │
                               ▼
systemd: local-experiences.service (uvicorn app.main:app on 127.0.0.1:8000)
   ├── Env file:  /etc/local-experiences.env
   └── Database:  /var/lib/local-experiences/local.db (SQLite WAL mode, outside git repo)
```

- **Why `/var/lib/local-experiences/local.db`?** Storing the SQLite database outside the Git directory ensures that `git reset --hard`, branch switches, or `rsync --delete` never wipe user accounts, trips, bookings, or provider listings.
- **Single-server fallback:** FastAPI also strips `/api` prefixes and serves `STATIC_DIR` (`frontend/dist`) directly, so you can run the entire production build on a single port locally (`python scripts/prod.py`) or in Docker (`docker compose up -d --build`).

---

## 1. Launch the AWS EC2 Instance

1. **AMI:** Ubuntu Server 24.04 LTS (recommended) or Amazon Linux 2023.
2. **Instance Type:** `t3.small` or `t3.micro` (2 vCPU, 1–2 GB RAM).
3. **Security Group Inbound Rules:**
   - `SSH` (TCP `22`) — Your IP (or `0.0.0.0/0` if using GitHub Actions auto-deploy)
   - `HTTP` (TCP `80`) — `0.0.0.0/0`, `::/0`
   - `HTTPS` (TCP `443`) — `0.0.0.0/0`, `::/0` (for optional SSL later)
4. **Storage:** 16+ GB gp3 root volume.

---

## 2. One-Time EC2 Setup

SSH into your EC2 instance, clone the repository into `~/local-experiences`, and run the setup script:

```bash
ssh -i ~/.ssh/your-key.pem ubuntu@<EC2_PUBLIC_IP>

git clone <YOUR_GIT_REPO_URL> ~/local-experiences
cd ~/local-experiences
bash scripts/ec2_setup.sh
```

`scripts/ec2_setup.sh` automatically:
1. Installs Python 3.12, Node.js 22, Nginx, and SQLite.
2. Creates `/var/lib/local-experiences/` and `/etc/local-experiences.env`.
3. Builds `backend/.venv` and `frontend/dist`.
4. Configures and starts `local-experiences.service` (systemd) + Nginx on port 80.

Open `http://<EC2_PUBLIC_IP>` in your browser — the app is live!

### Configure Admin Credentials & Claude API Key (Optional)
Edit `/etc/local-experiences.env` on the EC2 instance:

```bash
sudo nano /etc/local-experiences.env
```
```ini
DB_PATH=/var/lib/local-experiences/local.db
STATIC_DIR=/home/ubuntu/local-experiences/frontend/dist
WEBSITE_V2=1
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your-strong-password
ANTHROPIC_API_KEY=sk-ant-...
```
Then restart the backend:
```bash
sudo systemctl restart local-experiences
```

---

## 3. Updating Code Frequently During Development

You have **three ways** to push updates to EC2 depending on how you are working:

### Option A: Instant Live Sync from Your Laptop (~2 seconds, no commit needed)
When iterating rapidly on your laptop and you want to test uncommitted changes on EC2 immediately:

```bash
EC2_HOST=ubuntu@<EC2_PUBLIC_IP> EC2_KEY=~/.ssh/your-key.pem ./scripts/ec2_update.sh --sync
```
- Uses `rsync` over SSH to copy only changed source files (skipping `.venv`, `node_modules`, and `.db`), runs `npm run build` (~350ms), and restarts `local-experiences.service`.

### Option B: One-Command Git Update (from your laptop or on EC2)
After pushing commits to GitHub (`git push`):

```bash
# Run from your laptop:
EC2_HOST=ubuntu@<EC2_PUBLIC_IP> EC2_KEY=~/.ssh/your-key.pem ./scripts/ec2_update.sh

# Or deploy a specific feature branch (e.g. feat/website-p4):
EC2_HOST=ubuntu@<EC2_PUBLIC_IP> EC2_KEY=~/.ssh/your-key.pem ./scripts/ec2_update.sh feat/website-p4

# Or run directly inside an EC2 SSH session:
cd ~/local-experiences && ./scripts/ec2_update.sh
```
- Smart dependency caching: `pip install` and `npm ci` are skipped unless `pyproject.toml` or `package-lock.json` changed (pass `--full` to force reinstall).
- Automatically backs up `/var/lib/local-experiences/local.db` to `local.db.bak` before restarting.

### Option C: Automatic GitHub Actions Deploy on `git push`
`.github/workflows/deploy-ec2.yml` is pre-configured. Add these Repository Secrets in **GitHub → Settings → Secrets and variables → Actions**:
- `EC2_HOST`: Your EC2 public IP or DNS (e.g. `13.232.x.x`)
- `EC2_SSH_KEY`: Contents of your `.pem` private key
- `EC2_USER` *(optional)*: Defaults to `ubuntu` (`ec2-user` on Amazon Linux)

Every push to `main` (or clicking **Run workflow** on any branch in the GitHub Actions tab) will automatically update the EC2 instance.

---

## 4. Useful Operations on EC2

| Task | Command |
|---|---|
| Check backend status | `sudo systemctl status local-experiences` |
| Follow live backend logs | `sudo journalctl -u local-experiences -f` |
| Restart backend | `sudo systemctl restart local-experiences` |
| Check health endpoint | `curl http://127.0.0.1:8000/health` |
| Reset runtime DB on EC2 | `rm -f /var/lib/local-experiences/local.db && sudo systemctl restart local-experiences` |
| Run with Docker instead | `docker compose up -d --build` |
