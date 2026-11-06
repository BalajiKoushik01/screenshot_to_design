# 100% Cloud-Only Deployment Manifest
# Builds both Vite React frontend and FastAPI backend into a single cloud-native container.
# Compatible with Google Cloud Run, Render, AWS ECS, Railway, and DigitalOcean.

# Stage 1: Build React Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY loom-backend/frontend/package*.json ./
RUN npm ci
COPY loom-backend/frontend/ ./
RUN npm run build

# Stage 2: Production Python Backend
FROM python:3.11-slim AS runner
WORKDIR /app

# Install system dependencies for OpenCV and image processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY loom-backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY loom-backend/app/ ./app/

# Copy built frontend assets to static serving
COPY --from=frontend-builder /app/frontend/dist/ ./static/dist/

# Cloud environment settings
ENV STATIC_EXPORTS_DIR=/static/exports
ENV PORT=8000
ENV HOST=0.0.0.0
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

# Start FastAPI application via Uvicorn
CMD ["sh", "-c", "python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
