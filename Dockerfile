# Default container runs only the stateless indexed studio.
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY loom-backend/frontend/package*.json ./
RUN npm ci
COPY loom-backend/frontend/ ./
RUN npm run build

FROM python:3.11-slim AS runner
WORKDIR /app
COPY loom-backend/requirements-studio.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY loom-backend/app/ ./app/
COPY --from=frontend-builder /app/frontend/dist/ ./frontend/dist/
RUN useradd --create-home studio
USER studio
ENV PORT=8000 PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["sh", "-c", "exec python -m uvicorn app.studio_main:app --host 0.0.0.0 --port ${PORT}"]
