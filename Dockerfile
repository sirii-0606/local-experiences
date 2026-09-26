# Stage 1: Build the React + Vite frontend
FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: FastAPI backend + built SPA served on a single port
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    STATIC_DIR=/app/frontend/dist \
    DB_PATH=/data/local.db \
    WEBSITE_V2=1

COPY backend/ /app/backend/
RUN pip install --no-cache-dir -e "/app/backend"
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

RUN mkdir -p /data
VOLUME ["/data"]
WORKDIR /app/backend
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
