import os
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

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

# -------------------------------------------------
# CORS – allow all origins during development
# -------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # noqa: W605 – wildcard for dev only
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------
# Global exception handler for unexpected errors
# -------------------------------------------------
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Return a consistent JSON payload for any uncaught exception.

    The response contains the HTTP 500 status code, a human‑readable
    ``detail`` message and the exception class name for easier debugging.
    """
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "type": exc.__class__.__name__},
    )

# -------------------------------------------------
# Include API routes under the /api/v1 prefix
# -------------------------------------------------
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
        file_path = dist_dir / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(dist_dir / "index.html")

# The ``app`` object is what ASGI servers (uvicorn, hypercorn, etc.) import.

