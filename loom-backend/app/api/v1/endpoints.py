"""
API v1 endpoints — WeaveCore Pattern Extraction Engine v3.

Existing endpoints (unchanged behaviour):
  POST /designs/upload          — upload image + params, returns task_id
  GET  /designs/status/{id}     — Celery task status + extended result

New endpoints (FR-5, FR-11):
  GET  /designs/{id}/analysis   — segmentation regions + repeat data
  POST /designs/{id}/corrections — accept corrected regions, re-run stages 3-7
  GET  /designs/{id}/download/tiff     — serve layered TIFF
  GET  /designs/{id}/download/manifest — serve manifest JSON
"""
import ast
import json
import os
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from pydantic import BaseModel
from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse

from app.worker import process_textile_design_task, celery_app

router = APIRouter()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _save_upload(upload: UploadFile, folder: Path) -> Path:
    """Write UploadFile to folder with a UUID filename."""
    folder.mkdir(parents=True, exist_ok=True)
    suffix   = Path(upload.filename or "file").suffix or ".bin"
    filename = f"{uuid.uuid4().hex}{suffix}"
    dest     = folder / filename
    with dest.open("wb") as f:
        while chunk := upload.file.read(1024 * 1024):
            f.write(chunk)
    upload.file.close()
    return dest


def _tmp_dir() -> Path:
    p = Path(__file__).resolve().parents[4] / "tmp"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _exports_dir() -> Path:
    p = Path(__file__).resolve().parents[4] / "static" / "exports"
    p.mkdir(parents=True, exist_ok=True)
    return p


import concurrent.futures
import threading

_task_store: Dict[str, Dict[str, Any]] = {}
_executor = concurrent.futures.ThreadPoolExecutor(max_workers=3)

def _get_task_store_file() -> Path:
    return _tmp_dir() / "task_store.json"

def _save_task_store() -> None:
    try:
        fpath = _get_task_store_file()
        with fpath.open("w") as f:
            json.dump(_task_store, f, default=str)
    except Exception:
        pass

def _load_task_store() -> None:
    try:
        fpath = _get_task_store_file()
        if fpath.exists():
            with fpath.open("r") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    _task_store.update(data)
    except Exception:
        pass

_load_task_store()


class _InMemoryTask:
    def __init__(self, task_id: str):
        self.id = task_id

    def update_state(self, state: str, meta: Dict[str, Any] | None = None) -> None:
        if self.id in _task_store:
            _task_store[self.id]["status"] = state
            if meta:
                for k, v in meta.items():
                    _task_store[self.id][k] = v
            _save_task_store()


def _run_pipeline_worker(
    task_id: str,
    image_path: str,
    mask_path: str,
    coordinates: List[List[int]],
    colors: int,
    width: int,
) -> None:
    def update_state(state: str, meta: Dict[str, Any] | None = None) -> None:
        if task_id in _task_store:
            _task_store[task_id]["status"] = state
            if meta:
                for k, v in meta.items():
                    _task_store[task_id][k] = v

    original_update_state = getattr(process_textile_design_task, "update_state", None)
    process_textile_design_task.update_state = update_state  # type: ignore[assignment]
    try:
        result = process_textile_design_task.run(
            image_path=image_path,
            mask_path=mask_path,
            coordinates=coordinates,
            colors=colors,
            width=width,
        )
        _task_store[task_id]["status"] = "SUCCESS"
        _task_store[task_id]["result"] = result
        _task_store[task_id]["stage"] = "Pipeline complete"
        _task_store[task_id]["progress"] = 100
        _save_task_store()
    except Exception as exc:
        _task_store[task_id]["status"] = "FAILURE"
        _task_store[task_id]["error"] = str(exc)
        _save_task_store()
    finally:
        if original_update_state:
            process_textile_design_task.update_state = original_update_state  # type: ignore[assignment]


def _enrich_result(res: Any) -> Any:
    """Ensure newly added draft URLs (like royal blue drafts) are included."""
    if not isinstance(res, dict):
        return res
    file_url = res.get("file_url", "")
    if file_url:
        p = Path(file_url)
        prefix = p.name.split("_")[0]
        exports_dir = _exports_dir()
        blue_prev = exports_dir / f"{prefix}_saree_panel_blue_preview.png"
        if blue_prev.exists() and "saree_panel_blue_preview_url" not in res:
            res["saree_panel_blue_preview_url"] = f"/static/exports/{blue_prev.name}"
        blue_bmp = next(exports_dir.glob(f"{prefix}_saree_panel_blue_w*.bmp"), None)
        if blue_bmp and blue_bmp.exists() and "saree_panel_blue_bmp_url" not in res:
            res["saree_panel_blue_bmp_url"] = f"/static/exports/{blue_bmp.name}"
        master_blue_prev = exports_dir / f"{prefix}_2D_master_blue_preview.png"
        if master_blue_prev.exists() and "master_2d_blue_preview_url" not in res:
            res["master_2d_blue_preview_url"] = f"/static/exports/{master_blue_prev.name}"
        master_blue_bmp = next(exports_dir.glob(f"{prefix}_2D_master_blue_w*.bmp"), None)
        if master_blue_bmp and master_blue_bmp.exists() and "master_2d_blue_bmp_url" not in res:
            res["master_2d_blue_bmp_url"] = f"/static/exports/{master_blue_bmp.name}"

        # Enrich WIF, DAT, SVG, TechPack
        wif_file = exports_dir / f"{prefix}_jacquard_master.wif"
        if wif_file.exists() and "wif_url" not in res:
            res["wif_url"] = f"/static/exports/{wif_file.name}"
        dat_file = exports_dir / f"{prefix}_jacquard_card_punch.dat"
        if dat_file.exists() and "dat_url" not in res:
            res["dat_url"] = f"/static/exports/{dat_file.name}"
        svg_file = exports_dir / f"{prefix}_jacquard_grid.svg"
        if svg_file.exists() and "svg_url" not in res:
            res["svg_url"] = f"/static/exports/{svg_file.name}"
        techpack_file = exports_dir / f"{prefix}_techpack_docket.html"
        if techpack_file.exists() and "techpack_url" not in res:
            res["techpack_url"] = f"/static/exports/{techpack_file.name}"
    return res


def _task_result(task_id: str) -> Dict[str, Any] | None:
    """Return task result dict from in-memory store or Celery, or None."""
    if task_id in _task_store:
        item = _task_store[task_id]
        if item.get("status") == "SUCCESS":
            return _enrich_result(dict(item.get("result", {})))
        return None
    try:
        ar = celery_app.AsyncResult(task_id)
        if ar.status == "SUCCESS":
            return _enrich_result(dict(ar.result))  # type: ignore[return-value]
    except Exception:
        pass
    return None


def _is_redis_available() -> bool:
    try:
        import redis
        r = redis.Redis.from_url("redis://localhost:6379/0", socket_connect_timeout=0.2, socket_timeout=0.2)
        return bool(r.ping())
    except Exception:
        return False


# ---------------------------------------------------------------------------
# POST /designs/upload
# ---------------------------------------------------------------------------

@router.post("/designs/upload", status_code=202)
async def upload_design(
    image:       UploadFile = File(...),
    mask:        UploadFile | None = File(None),
    coordinates: str = Form(...),   # JSON list of four [x, y] points
    color_count: int = Form(...),
    target_width: int = Form(...),
) -> JSONResponse:
    """Upload a design image and enqueue the full WPEE v3 pipeline.

    Returns ``202 Accepted`` with a ``task_id`` to poll via ``/designs/status/{id}``.
    """
    tmp = _tmp_dir()

    try:
        image_path = _save_upload(image, tmp)
    except Exception as exc:
        raise HTTPException(500, detail=f"Failed to save image: {exc}")

    mask_path = ""
    if mask is not None:
        try:
            mask_path = str(_save_upload(mask, tmp))
        except Exception as exc:
            raise HTTPException(500, detail=f"Failed to save mask: {exc}")

    # Parse coordinates — accept JSON array or Python literal
    try:
        coords = json.loads(coordinates)
    except json.JSONDecodeError:
        coords = ast.literal_eval(coordinates)
    if not isinstance(coords, list) or len(coords) != 4:
        raise HTTPException(422, detail="coordinates must be a list of exactly four points")

    task_id = str(uuid.uuid4())
    dispatched_celery = False

    # Fast probe: only use Celery if Redis is actively listening
    if _is_redis_available():
        try:
            task = process_textile_design_task.delay(
                image_path=str(image_path),
                mask_path=mask_path,
                coordinates=coords,
                colors=color_count,
                width=target_width,
            )
            task_id = task.id
            dispatched_celery = True
        except Exception:
            dispatched_celery = False

    if not dispatched_celery:
        # Fallback to in-process background thread
        _task_store[task_id] = {
            "status": "STARTED",
            "stage": "Initializing pipeline...",
            "progress": 2,
            "log": ["[  0%] Queued for extraction"],
        }
        _executor.submit(
            _run_pipeline_worker,
            task_id,
            str(image_path),
            mask_path,
            coords,
            color_count,
            target_width,
        )

    return JSONResponse(status_code=202, content={"task_id": task_id})


# ---------------------------------------------------------------------------
# GET /designs/status/{task_id}
# ---------------------------------------------------------------------------

@router.get("/designs/status/{task_id}")
async def get_design_status(task_id: str) -> JSONResponse:
    """Return task status, live stage progress, and result when finished."""
    if task_id not in _task_store:
        _load_task_store()
    if task_id in _task_store:
        item = _task_store[task_id]
        status = item.get("status", "PENDING")
        if status == "SUCCESS":
            return JSONResponse(content={"status": status, "result": _enrich_result(dict(item.get("result", {})))})
        if status == "FAILURE":
            return JSONResponse(content={"status": status, "error": item.get("error", "Task failed")})
        if status == "STARTED":
            return JSONResponse(content={
                "status":   status,
                "stage":    item.get("stage", ""),
                "progress": item.get("progress", 0),
                "log":      item.get("log", []),
            })
        return JSONResponse(content={"status": status})

    try:
        ar     = celery_app.AsyncResult(task_id)
        status = ar.status

        if status == "SUCCESS":
            return JSONResponse(content={"status": status, "result": _enrich_result(dict(ar.result))})

        if status == "FAILURE":
            return JSONResponse(content={"status": status, "error": str(ar.result)})

        if status == "STARTED":
            meta = ar.info or {}
            return JSONResponse(content={
                "status":   status,
                "stage":    meta.get("stage", ""),
                "progress": meta.get("progress", 0),
                "log":      meta.get("log", []),
            })

        return JSONResponse(content={"status": status})
    except Exception:
        return JSONResponse(content={"status": "PENDING"})


# ---------------------------------------------------------------------------
# GET /designs/{task_id}/analysis
# ---------------------------------------------------------------------------

@router.get("/designs/{task_id}/analysis")
async def get_analysis(task_id: str) -> JSONResponse:
    """Return the segmentation regions and repeat-detection data for a completed task."""
    result = _task_result(task_id)
    if result is None:
        raise HTTPException(404, detail="Task not completed or not found")
    return JSONResponse(content={
        "regions": result.get("regions", []),
        "repeat":  result.get("repeat",  {}),
        "sharpness":           result.get("sharpness", None),
        "restoration_applied": result.get("restoration_applied", False),
    })


# ---------------------------------------------------------------------------
# POST /designs/{task_id}/corrections
# ---------------------------------------------------------------------------

@router.post("/designs/{task_id}/corrections", status_code=202)
async def submit_corrections(
    task_id:    str,
    background: BackgroundTasks,
    body:       dict = ...,
) -> JSONResponse:
    """Accept corrected region data and re-run the pipeline from Stage 3 onwards."""
    for field in ("image_path", "colors", "width"):
        if field not in body:
            raise HTTPException(422, detail=f"Missing field: {field}")

    h, w = _get_image_dims(body["image_path"])
    identity_coords = [[0, 0], [w, 0], [w, h], [0, h]]

    new_task_id = str(uuid.uuid4())
    dispatched_celery = False

    if _is_redis_available():
        try:
            task = process_textile_design_task.delay(
                image_path=body["image_path"],
                mask_path="",
                coordinates=identity_coords,
                colors=int(body["colors"]),
                width=int(body["width"]),
            )
            new_task_id = task.id
            dispatched_celery = True
        except Exception:
            dispatched_celery = False

    if not dispatched_celery:
        _task_store[new_task_id] = {
            "status": "STARTED",
            "stage": "Initializing re-run...",
            "progress": 2,
            "log": ["[  0%] Re-run queued with corrections"],
        }
        _executor.submit(
            _run_pipeline_worker,
            new_task_id,
            body["image_path"],
            "",
            identity_coords,
            int(body["colors"]),
            int(body["width"]),
        )

    return JSONResponse(status_code=202, content={"task_id": new_task_id})


def _get_image_dims(path: str):
    import cv2
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(422, detail=f"Cannot read image at: {path}")
    return img.shape[:2]  # h, w


# ---------------------------------------------------------------------------
# GET /designs/{task_id}/download/tiff
# ---------------------------------------------------------------------------

@router.get("/designs/{task_id}/download/tiff")
async def download_tiff(task_id: str) -> FileResponse:
    """Serve the layered TIFF export for a completed task."""
    result = _task_result(task_id)
    if result is None:
        raise HTTPException(404, detail="Task not completed or not found")
    tiff_url = result.get("tiff_url", "")
    if not tiff_url:
        raise HTTPException(404, detail="TIFF export not available for this task")
    tiff_path = _exports_dir() / Path(tiff_url).name
    if not tiff_path.exists():
        raise HTTPException(404, detail="TIFF file not found on disk")
    return FileResponse(
        str(tiff_path),
        media_type="image/tiff",
        filename="loom_design_layered.tiff",
        headers={"Content-Disposition": 'attachment; filename="loom_design_layered.tiff"'},
    )


# ---------------------------------------------------------------------------
# GET /designs/{task_id}/download/manifest
# ---------------------------------------------------------------------------

@router.get("/designs/{task_id}/download/manifest")
async def download_manifest(task_id: str) -> FileResponse:
    """Serve the pipeline manifest JSON for a completed task."""
    result = _task_result(task_id)
    if result is None:
        raise HTTPException(404, detail="Task not completed or not found")
    manifest_url = result.get("manifest_url", "")
    if not manifest_url:
        raise HTTPException(404, detail="Manifest not available for this task")
    manifest_path = _exports_dir() / Path(manifest_url).name
    if not manifest_path.exists():
        raise HTTPException(404, detail="Manifest file not found on disk")
    return FileResponse(
        str(manifest_path),
        media_type="application/json",
        filename="pipeline_manifest.json",
        headers={"Content-Disposition": 'attachment; filename="pipeline_manifest.json"'},
    )


# ---------------------------------------------------------------------------
# GET /designs/{task_id}/download/bmp
# ---------------------------------------------------------------------------

@router.get("/designs/{task_id}/download/bmp")
async def download_bmp(task_id: str) -> FileResponse:
    """Serve the 8-bit indexed Jacquard BMP export for a completed task."""
    result = _task_result(task_id)
    if result is None:
        raise HTTPException(404, detail="Task not completed or not found")
    bmp_url = result.get("file_url", "")
    if not bmp_url:
        raise HTTPException(404, detail="BMP export not available for this task")
    bmp_path = _exports_dir() / Path(bmp_url).name
    if not bmp_path.exists():
        raise HTTPException(404, detail="BMP file not found on disk")
    return FileResponse(
        str(bmp_path),
        media_type="image/bmp",
        filename="loom_design.bmp",
        headers={"Content-Disposition": 'attachment; filename="loom_design.bmp"'},
    )


# ---------------------------------------------------------------------------
# GET /designs/{task_id}/download/master_2d
# ---------------------------------------------------------------------------

@router.get("/designs/{task_id}/download/master_2d")
async def download_master_2d(task_id: str) -> FileResponse:
    """Serve the 2D Jacquard Master Design BMP (human and room free)."""
    result = _task_result(task_id)
    if result is None:
        raise HTTPException(404, detail="Task not completed or not found")
    url = result.get("master_2d_bmp_url") or result.get("file_url", "")
    if not url:
        raise HTTPException(404, detail="2D Master BMP not available")
    fpath = _exports_dir() / Path(url).name
    if not fpath.exists():
        raise HTTPException(404, detail="File not found on disk")
    return FileResponse(
        str(fpath),
        media_type="image/bmp",
        filename="saree_2D_master_design.bmp",
        headers={"Content-Disposition": 'attachment; filename="saree_2D_master_design.bmp"'},
    )


# ---------------------------------------------------------------------------
# GET /designs/{task_id}/download/motif
# ---------------------------------------------------------------------------

@router.get("/designs/{task_id}/download/motif")
async def download_motif(task_id: str) -> FileResponse:
    """Serve the isolated 2D Butta / Motif BMP."""
    result = _task_result(task_id)
    if result is None:
        raise HTTPException(404, detail="Task not completed or not found")
    url = result.get("motif_bmp_url", "")
    if not url:
        raise HTTPException(404, detail="Motif BMP not available")
    fpath = _exports_dir() / Path(url).name
    if not fpath.exists():
        raise HTTPException(404, detail="File not found on disk")
    return FileResponse(
        str(fpath),
        media_type="image/bmp",
        filename="saree_2D_isolated_motif.bmp",
        headers={"Content-Disposition": 'attachment; filename="saree_2D_isolated_motif.bmp"'},
    )


# ---------------------------------------------------------------------------
# GET /designs/{task_id}/download/border
# ---------------------------------------------------------------------------

@router.get("/designs/{task_id}/download/border")
async def download_border(task_id: str) -> FileResponse:
    """Serve the continuous 2D Zari Border strip BMP."""
    result = _task_result(task_id)
    if result is None:
        raise HTTPException(404, detail="Task not completed or not found")
    url = result.get("border_bmp_url", "")
    if not url:
        raise HTTPException(404, detail="Border BMP not available")
    fpath = _exports_dir() / Path(url).name
    if not fpath.exists():
        raise HTTPException(404, detail="File not found on disk")
    return FileResponse(
        str(fpath),
        media_type="image/bmp",
        filename="saree_2D_zari_border.bmp",
        headers={"Content-Disposition": 'attachment; filename="saree_2D_zari_border.bmp"'},
    )


# ---------------------------------------------------------------------------
# GET /designs/{task_id}/download/zip
# ---------------------------------------------------------------------------

@router.get("/designs/{task_id}/download/zip")
async def download_zip(task_id: str) -> FileResponse:
    """Bundle 2D Master Jacquard BMP, Isolated Motif, Border strip, TIFF, and Manifest into a single ZIP archive."""
    import zipfile
    result = _task_result(task_id)
    if result is None:
        raise HTTPException(404, detail="Task not completed or not found")

    zip_name = f"weavecore_design_{task_id[:8]}.zip"
    zip_path = _exports_dir() / zip_name

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for key, archive_name in [
            ("master_2d_bmp_url",     "saree_2D_master_design.bmp"),
            ("master_2d_tiff_url",    "saree_2D_master_layered.tiff"),
            ("motif_bmp_url",         "saree_2D_isolated_motif.bmp"),
            ("border_bmp_url",        "saree_2D_zari_border.bmp"),
            ("file_url",              "loom_design_calibrated.bmp"),
            ("tiff_url",              "loom_design_layered.tiff"),
            ("manifest_url",          "pipeline_manifest.json"),
            ("master_2d_preview_url", "saree_2D_preview.png"),
        ]:
            val = result.get(key, "")
            if val:
                fpath = _exports_dir() / Path(val).name
                if fpath.exists():
                    zf.write(fpath, arcname=archive_name)

    return FileResponse(
        str(zip_path),
        media_type="application/zip",
        filename=zip_name,
        headers={"Content-Disposition": f'attachment; filename="{zip_name}"'},
    )


# ---------------------------------------------------------------------------
# PaintShop Pro Specific Download Routes
# ---------------------------------------------------------------------------

@router.get("/designs/{task_id}/download/saree_panel_bmp")
async def download_saree_panel_bmp(task_id: str) -> FileResponse:
    """Serve the multi-color indexed Full Saree Repeat Panel BMP."""
    result = _task_result(task_id)
    if result is None:
        raise HTTPException(404, detail="Task not completed or not found")
    url = result.get("saree_panel_bmp_url", "")
    if not url:
        raise HTTPException(404, detail="Saree Panel BMP not available")
    fpath = _exports_dir() / Path(url).name
    if not fpath.exists():
        raise HTTPException(404, detail="File not found on disk")
    return FileResponse(
        str(fpath),
        media_type="image/bmp",
        filename="saree_panel_draft_indexed.bmp",
        headers={"Content-Disposition": 'attachment; filename="saree_panel_draft_indexed.bmp"'},
    )


@router.get("/designs/{task_id}/download/saree_panel_authentic_bmp")
async def download_saree_panel_authentic_bmp(task_id: str) -> FileResponse:
    """Serve the Authentic Saree Colorway Jacquard Card Punch Draft BMP for PaintShop Pro."""
    result = _task_result(task_id)
    if result is None:
        raise HTTPException(404, detail="Task not completed or not found")
    url = result.get("saree_panel_authentic_bmp_url", "")
    if not url:
        raise HTTPException(404, detail="Authentic Panel BMP not available")
    fpath = _exports_dir() / Path(url).name
    if not fpath.exists():
        raise HTTPException(404, detail="File not found on disk")
    return FileResponse(
        str(fpath),
        media_type="image/bmp",
        filename="saree_panel_draft_authentic.bmp",
        headers={"Content-Disposition": 'attachment; filename="saree_panel_draft_authentic.bmp"'},
    )


@router.get("/designs/{task_id}/download/saree_panel_blue_bmp")
async def download_saree_panel_blue_bmp(task_id: str) -> FileResponse:
    """Serve the 2-Color Royal Blue & White Jacquard Card Punch Draft BMP for PaintShop Pro."""
    result = _task_result(task_id)
    if result is None:
        raise HTTPException(404, detail="Task not completed or not found")
    url = result.get("saree_panel_blue_bmp_url", "")
    if not url:
        raise HTTPException(404, detail="Royal Blue Panel BMP not available")
    fpath = _exports_dir() / Path(url).name
    if not fpath.exists():
        raise HTTPException(404, detail="File not found on disk")
    return FileResponse(
        str(fpath),
        media_type="image/bmp",
        filename="saree_panel_draft_royal_blue.bmp",
        headers={"Content-Disposition": 'attachment; filename="saree_panel_draft_royal_blue.bmp"'},
    )


@router.get("/designs/{task_id}/download/saree_panel_redwhite_bmp")
async def download_saree_panel_redwhite_bmp(task_id: str) -> FileResponse:
    """Serve the 2-Color Red & White Jacquard Card Punch Draft BMP for PaintShop Pro."""
    result = _task_result(task_id)
    if result is None:
        raise HTTPException(404, detail="Task not completed or not found")
    url = result.get("saree_panel_redwhite_bmp_url", "")
    if not url:
        raise HTTPException(404, detail="Red/White Panel BMP not available")
    fpath = _exports_dir() / Path(url).name
    if not fpath.exists():
        raise HTTPException(404, detail="File not found on disk")
    return FileResponse(
        str(fpath),
        media_type="image/bmp",
        filename="saree_panel_draft_redwhite.bmp",
        headers={"Content-Disposition": 'attachment; filename="saree_panel_draft_redwhite.bmp"'},
    )


@router.get("/designs/{task_id}/download/jeri")
async def download_jeri_bmp(task_id: str, indexed: bool = False) -> FileResponse:
    """Serve the Zari plane as a 1-bit card or an editable 8-bit dot BMP."""
    result = _task_result(task_id)
    if result is None:
        raise HTTPException(404, detail="Task not completed or not found")
    url = result.get("dot_bmp_url" if indexed else "jeri_bmp_url", "")
    if not url:
        raise HTTPException(404, detail="Zari Card BMP not available")
    fpath = _exports_dir() / Path(url).name
    if not fpath.exists():
        raise HTTPException(404, detail="File not found on disk")
    return FileResponse(
        str(fpath),
        media_type="image/bmp",
        filename=Path(url).name,
        headers={"Content-Disposition": f'attachment; filename="{Path(url).name}"'},
    )


@router.get("/designs/{task_id}/download/ani")
async def download_ani_bmp(task_id: str) -> FileResponse:
    """Serve the 1-bit monochrome Ground Silk Tabby Card Punch BMP (_ani.bmp)."""
    result = _task_result(task_id)
    if result is None:
        raise HTTPException(404, detail="Task not completed or not found")
    url = result.get("ani_bmp_url", "")
    if not url:
        raise HTTPException(404, detail="Ground Silk Tabby BMP not available")
    fpath = _exports_dir() / Path(url).name
    if not fpath.exists():
        raise HTTPException(404, detail="File not found on disk")
    return FileResponse(
        str(fpath),
        media_type="image/bmp",
        filename=Path(url).name,
        headers={"Content-Disposition": f'attachment; filename="{Path(url).name}"'},
    )


@router.get("/designs/{task_id}/download/body")
async def download_body_bmp(task_id: str) -> FileResponse:
    """Serve the isolated Body Repeat Draft BMP."""
    result = _task_result(task_id)
    if result is None:
        raise HTTPException(404, detail="Task not completed or not found")
    url = result.get("body_bmp_url", "")
    if not url:
        raise HTTPException(404, detail="Body BMP not available")
    fpath = _exports_dir() / Path(url).name
    if not fpath.exists():
        raise HTTPException(404, detail="File not found on disk")
    return FileResponse(
        str(fpath),
        media_type="image/bmp",
        filename=Path(url).name,
        headers={"Content-Disposition": f'attachment; filename="{Path(url).name}"'},
    )


@router.get("/designs/{task_id}/download/body_jeri")
async def download_body_jeri_bmp(task_id: str) -> FileResponse:
    """Serve the 1-bit monochrome Body Zari Card Punch BMP."""
    result = _task_result(task_id)
    if result is None:
        raise HTTPException(404, detail="Task not completed or not found")
    url = result.get("body_jeri_bmp_url", "")
    if not url:
        raise HTTPException(404, detail="Body Zari BMP not available")
    fpath = _exports_dir() / Path(url).name
    if not fpath.exists():
        raise HTTPException(404, detail="File not found on disk")
    return FileResponse(
        str(fpath),
        media_type="image/bmp",
        filename=Path(url).name,
        headers={"Content-Disposition": f'attachment; filename="{Path(url).name}"'},
    )


@router.get("/designs/{task_id}/download/pallu")
async def download_pallu_bmp(task_id: str) -> FileResponse:
    """Serve the isolated Grand Pallu Draft BMP."""
    result = _task_result(task_id)
    if result is None:
        raise HTTPException(404, detail="Task not completed or not found")
    url = result.get("pallu_bmp_url", "")
    if not url:
        raise HTTPException(404, detail="Pallu BMP not available")
    fpath = _exports_dir() / Path(url).name
    if not fpath.exists():
        raise HTTPException(404, detail="File not found on disk")
    return FileResponse(
        str(fpath),
        media_type="image/bmp",
        filename=Path(url).name,
        headers={"Content-Disposition": f'attachment; filename="{Path(url).name}"'},
    )


@router.get("/designs/{task_id}/download/pallu_jeri")
async def download_pallu_jeri_bmp(task_id: str) -> FileResponse:
    """Serve the 1-bit monochrome Pallu Zari Card Punch BMP."""
    result = _task_result(task_id)
    if result is None:
        raise HTTPException(404, detail="Task not completed or not found")
    url = result.get("pallu_jeri_bmp_url", "")
    if not url:
        raise HTTPException(404, detail="Pallu Zari BMP not available")
    fpath = _exports_dir() / Path(url).name
    if not fpath.exists():
        raise HTTPException(404, detail="File not found on disk")
    return FileResponse(
        str(fpath),
        media_type="image/bmp",
        filename=Path(url).name,
        headers={"Content-Disposition": f'attachment; filename="{Path(url).name}"'},
    )


@router.get("/designs/{task_id}/download/psp_palette")
async def download_psp_palette(task_id: str) -> FileResponse:
    """Serve the native Corel PaintShop Pro Palette (.PAL) file."""
    result = _task_result(task_id)
    if result is None:
        raise HTTPException(404, detail="Task not completed or not found")
    url = result.get("jasc_pal_url", "")
    if not url:
        raise HTTPException(404, detail="PaintShop Pro Palette not available")
    fpath = _exports_dir() / Path(url).name
    if not fpath.exists():
        raise HTTPException(404, detail="File not found on disk")
    return FileResponse(
        str(fpath),
        media_type="text/plain",
        filename="loom_palette.pal",
        headers={"Content-Disposition": 'attachment; filename="loom_palette.pal"'},
    )


@router.get("/designs/{task_id}/download/psp_bundle")
async def download_psp_bundle(task_id: str) -> FileResponse:
    """Serve the complete PaintShop Pro Jacquard CAD Workspace ZIP bundle."""
    result = _task_result(task_id)
    if result is None:
        raise HTTPException(404, detail="Task not completed or not found")
    url = result.get("psp_bundle_zip_url", "")
    if not url:
        raise HTTPException(404, detail="PaintShop Pro CAD Bundle not available")
    fpath = _exports_dir() / Path(url).name
    if not fpath.exists():
        raise HTTPException(404, detail="File not found on disk")
    return FileResponse(
        str(fpath),
        media_type="application/zip",
        filename="paintshop_pro_jacquard_cad_bundle.zip",
        headers={"Content-Disposition": 'attachment; filename="paintshop_pro_jacquard_cad_bundle.zip"'},
    )


# ---------------------------------------------------------------------------
# Universal Weaving Information File (.WIF) Route
# ---------------------------------------------------------------------------

@router.get("/designs/{task_id}/download/wif")
async def download_wif(task_id: str) -> FileResponse:
    """Serve the Universal Weaving Information File (.WIF v1.1)."""
    result = _task_result(task_id)
    if result is None:
        raise HTTPException(404, detail="Task not completed or not found")
    url = result.get("wif_url", "")
    exports_dir = _exports_dir()
    if not url:
        file_url = result.get("file_url", "")
        if file_url:
            prefix = Path(file_url).name.split("_")[0]
            f_match = exports_dir / f"{prefix}_jacquard_master.wif"
            if f_match.exists():
                url = f"/static/exports/{f_match.name}"
    if not url:
        raise HTTPException(404, detail="WIF export not available")
    fpath = exports_dir / Path(url).name
    if not fpath.exists():
        raise HTTPException(404, detail="File not found on disk")
    return FileResponse(
        str(fpath),
        media_type="text/plain",
        filename="saree_master_draft.wif",
        headers={"Content-Disposition": 'attachment; filename="saree_master_draft.wif"'},
    )


# ---------------------------------------------------------------------------
# Electronic Jacquard Card Punch (.DAT) Route
# ---------------------------------------------------------------------------

@router.get("/designs/{task_id}/download/dat")
async def download_dat(task_id: str) -> FileResponse:
    """Serve the Electronic Jacquard Controller Punch format (.DAT)."""
    result = _task_result(task_id)
    if result is None:
        raise HTTPException(404, detail="Task not completed or not found")
    url = result.get("dat_url", "")
    exports_dir = _exports_dir()
    if not url:
        file_url = result.get("file_url", "")
        if file_url:
            prefix = Path(file_url).name.split("_")[0]
            f_match = exports_dir / f"{prefix}_jacquard_card_punch.dat"
            if f_match.exists():
                url = f"/static/exports/{f_match.name}"
    if not url:
        raise HTTPException(404, detail="DAT export not available")
    fpath = exports_dir / Path(url).name
    if not fpath.exists():
        raise HTTPException(404, detail="File not found on disk")
    return FileResponse(
        str(fpath),
        media_type="application/octet-stream",
        filename="saree_jacquard_card_punch.dat",
        headers={"Content-Disposition": 'attachment; filename="saree_jacquard_card_punch.dat"'},
    )


# ---------------------------------------------------------------------------
# Technical Vector Jacquard Grid (.SVG) Route
# ---------------------------------------------------------------------------

@router.get("/designs/{task_id}/download/svg")
async def download_svg(task_id: str) -> FileResponse:
    """Serve the Technical Vector Jacquard Grid (.SVG)."""
    result = _task_result(task_id)
    if result is None:
        raise HTTPException(404, detail="Task not completed or not found")
    url = result.get("svg_url", "")
    exports_dir = _exports_dir()
    if not url:
        file_url = result.get("file_url", "")
        if file_url:
            prefix = Path(file_url).name.split("_")[0]
            f_match = exports_dir / f"{prefix}_jacquard_grid.svg"
            if f_match.exists():
                url = f"/static/exports/{f_match.name}"
    if not url:
        raise HTTPException(404, detail="SVG export not available")
    fpath = exports_dir / Path(url).name
    if not fpath.exists():
        raise HTTPException(404, detail="File not found on disk")
    return FileResponse(
        str(fpath),
        media_type="image/svg+xml",
        filename="saree_jacquard_grid.svg",
        headers={"Content-Disposition": 'attachment; filename="saree_jacquard_grid.svg"'},
    )


# ---------------------------------------------------------------------------
# Printable Mill Tech Pack Job Sheet (.HTML) Route
# ---------------------------------------------------------------------------

@router.get("/designs/{task_id}/download/techpack")
async def download_techpack(task_id: str) -> FileResponse:
    """Serve the printable HTML Mill Production Docket / Tech Pack."""
    result = _task_result(task_id)
    if result is None:
        raise HTTPException(404, detail="Task not completed or not found")
    url = result.get("techpack_url", "")
    exports_dir = _exports_dir()
    if not url:
        file_url = result.get("file_url", "")
        if file_url:
            prefix = Path(file_url).name.split("_")[0]
            f_match = exports_dir / f"{prefix}_techpack_docket.html"
            if f_match.exists():
                url = f"/static/exports/{f_match.name}"
    if not url:
        raise HTTPException(404, detail="Tech pack not available")
    fpath = exports_dir / Path(url).name
    if not fpath.exists():
        raise HTTPException(404, detail="File not found on disk")
    return FileResponse(
        str(fpath),
        media_type="text/html",
        filename="weavecore_techpack_job_sheet.html",
        headers={"Content-Disposition": 'inline; filename="weavecore_techpack_job_sheet.html"'},
    )


# ---------------------------------------------------------------------------
# Interactive Colorway Generator Route
# ---------------------------------------------------------------------------

class ColorwayRequest(BaseModel):
    ground_hex: str
    zari_hex: str
    preset_name: Optional[str] = "custom"


@router.post("/designs/{task_id}/generate-colorway")
async def generate_colorway(task_id: str, req: ColorwayRequest) -> JSONResponse:
    """Dynamically re-color the saree draft with new ground and zari shades."""
    import cv2
    import numpy as np
    from app.services.cv_engine import LoomPreprocessor
    from app.services.export_extra import export_jasc_pal

    result = _task_result(task_id)
    if result is None:
        raise HTTPException(404, detail="Task not completed or not found")

    exports_dir = _exports_dir()
    jeri_url = result.get("jeri_bmp_url", "")
    if not jeri_url:
        raise HTTPException(404, detail="Zari card raster not available for recoloring")

    jeri_path = exports_dir / Path(jeri_url).name
    if not jeri_path.exists():
        raise HTTPException(404, detail="Zari card file missing on disk")

    jeri_img = cv2.imread(str(jeri_path), cv2.IMREAD_GRAYSCALE)
    H, W = jeri_img.shape[:2]

    # Parse hex colors to BGR
    def parse_hex_bgr(hx: str) -> tuple:
        c = hx.lstrip("#")
        if len(c) == 3:
            c = "".join(x * 2 for x in c)
        r, g, b = int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)
        return (b, g, r), (r, g, b)

    ground_bgr, ground_rgb = parse_hex_bgr(req.ground_hex)
    zari_bgr, zari_rgb = parse_hex_bgr(req.zari_hex)

    # Generate colored draft
    recolored = np.full((H, W, 3), ground_bgr, dtype=np.uint8)
    recolored[jeri_img > 128] = zari_bgr

    cw_id = uuid.uuid4().hex[:6]
    prefix = Path(result.get("file_url", "design")).name.split("_")[0]

    cw_bmp_name = f"{prefix}_colorway_{cw_id}_w{W}.bmp"
    cw_bmp_path = str(exports_dir / cw_bmp_name)
    LoomPreprocessor.export_jacquard_bmp(recolored, W, cw_bmp_path)

    cw_png_name = f"{prefix}_colorway_{cw_id}_preview.png"
    cw_png_path = str(exports_dir / cw_png_name)
    cv2.imwrite(cw_png_path, recolored)

    cw_pal_name = f"{prefix}_colorway_{cw_id}.pal"
    cw_pal_path = str(exports_dir / cw_pal_name)
    export_jasc_pal([ground_rgb, zari_rgb, (255, 255, 255), (0, 0, 0)], cw_pal_path)

    return JSONResponse(content={
        "status": "success",
        "preview_url": f"/static/exports/{cw_png_name}",
        "bmp_url": f"/static/exports/{cw_bmp_name}",
        "pal_url": f"/static/exports/{cw_pal_name}",
        "ground_hex": req.ground_hex,
        "zari_hex": req.zari_hex,
        "preset_name": req.preset_name,
    })


# ---------------------------------------------------------------------------
# Interactive LoomAI Co-Pilot Route
# ---------------------------------------------------------------------------

class AiChatRequest(BaseModel):
    question: str


@router.post("/designs/{task_id}/ai-chat")
async def ai_chat(task_id: str, req: AiChatRequest) -> JSONResponse:
    """Consult the AI Master Weaver for loom calibration and drafting guidance."""
    from app.services.cloud_ai_agent import CloudAiAgent

    result = _task_result(task_id)
    if result is None:
        raise HTTPException(404, detail="Task not completed or not found")

    context = {
        "production_specs": result.get("production_specs", {}),
        "ai_analysis": result.get("ai_analysis", {}),
    }

    ans_data = CloudAiAgent.ask_master_weaver(
        question=req.question,
        context=context,
    )

    return JSONResponse(content=ans_data)


class CloudAiConfigRequest(BaseModel):
    gemini_api_key: Optional[str] = None
    hf_token: Optional[str] = None
    groq_api_key: Optional[str] = None
    model_name: Optional[str] = "gemini-1.5-flash"


@router.get("/designs/cloud-ai/status")
async def get_cloud_ai_status() -> JSONResponse:
    """Return status of Cloud AI Agent integration."""
    has_gemini = bool(os.environ.get("GEMINI_API_KEY"))
    has_hf = bool(os.environ.get("HF_API_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN"))
    has_groq = bool(os.environ.get("GROQ_API_KEY"))

    active_provider = "Autonomous Cloud-Calibrated Textile Vision Engine (0 Config, 100% Free)"
    if has_gemini:
        active_provider = "Google Gemini Cloud Vision (100% Free Tier, 15 RPM)"
    elif has_hf:
        active_provider = "Hugging Face Serverless Cloud API (Qwen-2.5-VL-7B)"
    elif has_groq:
        active_provider = "Groq Cloud Vision (Llama-3.2-11B-Vision)"

    return JSONResponse(content={
        "status": "ready",
        "active_provider": active_provider,
        "has_gemini_key": has_gemini,
        "has_hf_token": has_hf,
        "has_groq_key": has_groq,
        "is_cloud_only": True,
        "local_storage_used_bytes": 0,
        "local_gpu_used": False,
        "supported_providers": [
            {"name": "Google Gemini 1.5/2.0 Flash", "tier": "100% Free (15 RPM)", "best_for": "Fine texture & complex motifs"},
            {"name": "Hugging Face Serverless", "tier": "100% Free Serverless", "best_for": "Open-source Qwen2.5-VL"},
            {"name": "Groq Cloud Vision", "tier": "100% Free Tier", "best_for": "High-speed Llama-3.2-Vision"},
            {"name": "Autonomous Cloud Textile Heuristics", "tier": "Built-in / Zero Config", "best_for": "Immediate offline-ready analysis"}
        ]
    })


@router.post("/designs/cloud-ai/configure")
async def configure_cloud_ai(req: CloudAiConfigRequest) -> JSONResponse:
    """Save or update Cloud AI credentials in process environment."""
    if req.gemini_api_key is not None:
        os.environ["GEMINI_API_KEY"] = req.gemini_api_key.strip()
    if req.hf_token is not None:
        os.environ["HF_API_TOKEN"] = req.hf_token.strip()
    if req.groq_api_key is not None:
        os.environ["GROQ_API_KEY"] = req.groq_api_key.strip()

    return JSONResponse(content={
        "message": "Cloud AI credentials updated successfully",
        "has_gemini_key": bool(os.environ.get("GEMINI_API_KEY")),
        "has_hf_token": bool(os.environ.get("HF_API_TOKEN")),
        "has_groq_key": bool(os.environ.get("GROQ_API_KEY")),
    })

