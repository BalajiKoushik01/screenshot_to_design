"""Small standalone app for the indexed studio; no legacy AI, Redis or public exports."""
from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from app.api.studio import router

app = FastAPI(title="WeaveCore Indexed Studio", version="1.0.0")
app.include_router(router, prefix="/api/studio")


@app.get("/api/health")
def health():
    return {"status": "ok"}


dist = Path(__file__).resolve().parents[1] / "frontend" / "dist"
if (dist / "index.html").is_file():
    app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/favicon.svg")
    def favicon():
        return FileResponse(dist / "favicon.svg")

    @app.get("/")
    def index():
        return FileResponse(dist / "index.html")
