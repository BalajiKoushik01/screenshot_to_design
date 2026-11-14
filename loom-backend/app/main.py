import os
import logging
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from uuid import uuid4

from app.api.studio import router as studio_router
from app.core.config import Settings
from app.api.v1.endpoints import router as v1_router

# Load configuration
settings = Settings()

# Create FastAPI app instance
app = FastAPI(
    title=settings.app_name,
    debug=settings.debug,
    version=settings.version,
    description=settings.description,
)

# Explicit browser origins only. Cross-origin requests are not authenticated here.
allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip() and origin.strip() != "*"
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)

# -------------------------------------------------
# Global exception handler for unexpected errors
# -------------------------------------------------
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Log internal errors without disclosing paths, credentials or traces to clients."""
    error_id = uuid4().hex
    logging.getLogger("weavecore.api").exception(
        "Request failed error_id=%s path=%s", error_id, request.url.path
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "error_id": error_id},
    )

# -------------------------------------------------
# Include API routes under the /api/v1 prefix
# -------------------------------------------------
app.include_router(studio_router, prefix="/api/studio", tags=["indexed-studio"])
app.include_router(v1_router, prefix="/api/v1", tags=["v1"])

# -------------------------------------------------
# Serve compiled bitmaps (or any exported assets) as static files
# -------------------------------------------------
# Dynamically locate static exports dir (repo root, app dir, or env var)
env_exports = os.environ.get("STATIC_EXPORTS_DIR")
if env_exports:
    exports_dir = Path(env_exports)
else:
    candidates = [
        Path(__file__).resolve().parents[2] / "static" / "exports",  # Repo root / static / exports
        Path(__file__).resolve().parents[1] / "static" / "exports",  # Container /app/static/exports
        Path(__file__).resolve().parents[0] / "static" / "exports",
    ]
    exports_dir = next((d for d in candidates if d.parent.exists()), candidates[0])

exports_dir.mkdir(parents=True, exist_ok=True)
app.mount(
    "/static/exports",
    StaticFiles(directory=str(exports_dir), check_dir=False),
    name="exports",
)

# -------------------------------------------------
# Serve compiled React production frontend (SPA)
# -------------------------------------------------
candidate_dist_dirs = [
    Path(__file__).resolve().parents[1] / "frontend" / "dist",  # Local build: loom-backend/frontend/dist
    Path(__file__).resolve().parents[1] / "static" / "dist",    # Container: /app/static/dist
    Path(__file__).resolve().parents[2] / "static" / "dist",    # Root static/dist
]
dist_dir = next((d for d in candidate_dist_dirs if d.is_dir() and (d / "index.html").exists()), None)

if dist_dir:
    assets_dir = dist_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="frontend-assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Do not hijack API or static routes
        if full_path.startswith("api/") or full_path.startswith("static/"):
            return JSONResponse(status_code=404, content={"detail": "Not Found"})
        file_path = (dist_dir / full_path).resolve()
        if file_path.is_relative_to(dist_dir.resolve()) and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(dist_dir / "index.html")

# The ``app`` object is what ASGI servers (uvicorn, hypercorn, etc.) import.

