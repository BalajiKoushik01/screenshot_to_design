"""
Celery worker — WeaveCore Pattern Extraction Engine v3 full pipeline.

Stages:
  0   Sharpness check + conditional Real-ESRGAN restoration
  0.5 OpenCV inpainting repair (if freehand mask provided)
  0.6 Perspective deskew (existing 4-point pin)
  1   Region segmentation (MobileSAM zero-shot + position heuristics)
  2   Repeat / lattice detection (classical autocorrelation)
  3   Pattern completion (symmetry tile-fill + InpaintingService fallback)
  4   Colour quantization in Lab space (K-Means)
  5   Boundary vectorization (contour-based cleanup)
  6   Loom hook rescale (nearest-neighbour)
  7   Export: 8-bit indexed BMP (unchanged) + layered TIFF + manifest JSON

The task updates Celery state with stage name + progress so the frontend
can show real-time progress via the status endpoint.
"""
import os
import tempfile
import json
from pathlib import Path
from typing import Any, Dict, List

import cv2
import numpy as np
from celery import Celery

# ---------------------------------------------------------------------------
# Celery configuration
# ---------------------------------------------------------------------------
BROKER_URL    = os.getenv("REDIS_URL",     "redis://localhost:6379/0")
RESULT_BACKEND = os.getenv("REDIS_BACKEND", "redis://localhost:6379/0")

celery_app = Celery("loom_worker", broker=BROKER_URL, backend=RESULT_BACKEND)
celery_app.conf.update(
    task_serializer   = "json",
    result_serializer = "json",
    accept_content    = ["json"],
    timezone          = "UTC",
    enable_utc        = True,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_image(path: str) -> np.ndarray:
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise FileNotFoundError(f"Image not found: {path}")
    return img


def _repair_image(image_path: str, mask_path: str) -> np.ndarray:
    """OpenCV Navier-Stokes inpainting (existing behaviour, unchanged)."""
    image = _load_image(image_path)
    mask  = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
    if mask is None:
        raise FileNotFoundError(f"Mask not found: {mask_path}")
    if mask.shape[:2] != image.shape[:2]:
        raise ValueError("Mask size does not match image size")
    return cv2.inpaint(image, mask, inpaintRadius=3, flags=cv2.INPAINT_NS)


def _progress(task_self: Any, stage: str, pct: int, log: List[str]) -> None:
    """Update Celery task state with current pipeline stage + log."""
    log.append(f"[{pct:3d}%] {stage}")
    try:
        task_self.update_state(
            state="STARTED",
            meta={"stage": stage, "progress": pct, "log": log[-20:]},
        )
    except Exception:
        pass  # Redis may not be available in unit tests


# ---------------------------------------------------------------------------
# Main Celery task
# ---------------------------------------------------------------------------

@celery_app.task(name="process_textile_design_task", bind=True)
def process_textile_design_task(
    self,
    image_path:  str,
    mask_path:   str,
    coordinates: List[List[int]],
    colors:      int,
    width:       int,
) -> Dict[str, Any]:
    """Orchestrate the full WPEE v3 pipeline end-to-end.

    Parameters
    ----------
    image_path  : Uploaded source image path.
    mask_path   : Freehand mask path (empty string if none).
    coordinates : Four corner [x, y] points for perspective deskew.
    colors      : K-Means colour count (2–256).
    width       : Target loom hook width (pixels).

    Returns
    -------
    dict with keys:
        file_url, tiff_url, manifest_url — static download URLs
        regions, repeat                  — analysis data for the frontend
        sharpness, restoration_applied   — Stage 0 metadata
        pipeline_log                     — ordered stage log
    """
    from app.services.cv_engine    import LoomPreprocessor
    from app.services.restoration  import compute_sharpness, restore
    from app.services.segmentation import segment_regions
    from app.services.lattice      import detect_repeat
    from app.services.completion   import complete_regions
    from app.services.vectorization import vectorize_boundaries
    from app.services.export_extra  import export_layered_tiff, export_manifest

    log: List[str] = []

    project_root = Path(__file__).resolve().parents[2]
    export_dir   = project_root / "static" / "exports"
    export_dir.mkdir(parents=True, exist_ok=True)
    source_stem  = Path(image_path).stem
    tmp_dir      = Path(image_path).parent

    # ── Stage 0: Sharpness check + conditional restoration ────────────────
    _progress(self, "restoration: sharpness check", 5, log)
    raw = _load_image(image_path)
    sharpness            = compute_sharpness(raw)
    raw, restoration_applied = restore(raw)
    _progress(self, f"restoration: done (sharpness={sharpness:.1f}, restored={restoration_applied})", 15, log)

    # ── Stage 0.5: OpenCV inpainting repair (if mask provided) ────────────
    if os.path.isfile(mask_path):
        _progress(self, "repair: OpenCV inpainting", 18, log)
        raw = _repair_image(image_path, mask_path)
        # Apply restoration again on repaired image if needed
        if not restoration_applied:
            raw, restoration_applied = restore(raw)
        _progress(self, "repair: done", 20, log)

    # ── Stage 0.6: Perspective deskew ─────────────────────────────────────
    _progress(self, "deskew: perspective correction", 22, log)
    tmp_png = tempfile.NamedTemporaryFile(
        delete=False, suffix=".png", dir=tmp_dir
    )
    cv2.imwrite(tmp_png.name, raw)
    warped = LoomPreprocessor.apply_perspective_correction(
        image_path=tmp_png.name, coordinates=coordinates
    )

    warped_mask = None
    if os.path.isfile(mask_path):
        try:
            warped_mask_raw = LoomPreprocessor.apply_perspective_correction(
                image_path=mask_path, coordinates=coordinates
            )
            if len(warped_mask_raw.shape) == 3:
                warped_mask = cv2.cvtColor(warped_mask_raw, cv2.COLOR_BGR2GRAY)
            else:
                warped_mask = warped_mask_raw
        except Exception as exc:
            log.append(f"  ⚠ mask deskew error ({exc})")
            warped_mask = None
    _progress(self, "deskew: done", 25, log)

    # ── Stage 1: Region segmentation ──────────────────────────────────────
    _progress(self, "segmentation: MobileSAM + heuristics", 27, log)
    try:
        regions = segment_regions(warped)
    except Exception as exc:
        log.append(f"  ⚠ segmentation failed ({exc}), using empty list")
        regions = []
    regions_dict = [r.to_dict() for r in regions]
    _progress(self, f"segmentation: {len(regions)} regions found", 45, log)

    # ── Stage 2: Repeat / lattice detection ───────────────────────────────
    _progress(self, "lattice: autocorrelation repeat detection", 47, log)
    try:
        repeat = detect_repeat(warped)
    except Exception as exc:
        log.append(f"  ⚠ lattice detection failed ({exc})")
        from app.services.lattice import RepeatResult
        repeat = RepeatResult(0, 0, 0.0, "unknown", 0.0, 0.0)
    repeat_dict = repeat.to_dict()
    _progress(self, f"lattice: repeat={repeat.vector_x}×{repeat.vector_y}px, conf={repeat.confidence:.2f}", 55, log)

    # ── Stage 3: Pattern completion ───────────────────────────────────────
    _progress(self, "completion: symmetry-tile + inpainting routing", 57, log)
    try:
        completed, completion_report = complete_regions(warped, regions, repeat, tmp_dir, defect_mask=warped_mask)
    except Exception as exc:
        log.append(f"  ⚠ completion failed ({exc}), using deskewed image")
        completed        = warped
        completion_report = {"tiled": [], "inpainted": [], "skipped": []}
    _progress(self, "completion: done", 65, log)

    # ── Stage 4: Colour quantization in Lab space ─────────────────────────
    _progress(self, "quantization: K-Means in Lab space", 67, log)
    try:
        smoothed = cv2.bilateralFilter(completed, d=7, sigmaColor=35, sigmaSpace=35)
        lab = cv2.cvtColor(smoothed, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = cv2.cvtColor(cv2.merge([clahe.apply(l), a, b]), cv2.COLOR_LAB2BGR)
    except Exception:
        enhanced = completed

    quantized = LoomPreprocessor.quantize_colors(
        image_matrix=enhanced, color_count=colors
    )
    _progress(self, "quantization: done", 75, log)

    # ── Stage 5: Boundary vectorization ───────────────────────────────────
    _progress(self, "vectorization: contour boundary cleanup", 77, log)
    try:
        vectorized = vectorize_boundaries(quantized)
    except Exception as exc:
        log.append(f"  ⚠ vectorization failed ({exc}), using quantized image")
        vectorized = quantized
    _progress(self, "vectorization: done", 83, log)

    # ── Stage 6 + 7a: Loom rescale + BMP export (UNCHANGED FORMAT) ────────
    _progress(self, "export: indexed BMP", 85, log)
    bmp_name = f"{source_stem}_w{width}_c{colors}.bmp"
    bmp_path = str(export_dir / bmp_name)
    LoomPreprocessor.export_jacquard_bmp(
        quantized_matrix=vectorized, target_width=width, output_path=bmp_path
    )
    _progress(self, "export: BMP done", 88, log)

    # ── Stage 7b: Layered TIFF ─────────────────────────────────────────────
    _progress(self, "export: layered TIFF", 90, log)
    tiff_name = f"{source_stem}_w{width}_c{colors}.tiff"
    tiff_path = str(export_dir / tiff_name)
    try:
        export_layered_tiff(vectorized, tiff_path)
    except Exception as exc:
        log.append(f"  ⚠ TIFF export failed ({exc})")
        tiff_path = ""
    _progress(self, "export: TIFF done", 94, log)

    # ── Stage 7c: Manifest JSON ────────────────────────────────────────────
    _progress(self, "export: manifest JSON", 96, log)
    manifest_name = f"{source_stem}_w{width}_c{colors}_manifest.json"
    manifest_path = str(export_dir / manifest_name)
    try:
        export_manifest(
            sharpness           = sharpness,
            restoration_applied = restoration_applied,
            regions             = regions_dict,
            repeat              = repeat_dict,
            completion_report   = completion_report,
            pipeline_log        = log[:],
            output_path         = manifest_path,
        )
    except Exception as exc:
        log.append(f"  ⚠ manifest export failed ({exc})")
        manifest_path = ""
    _progress(self, "pipeline: complete", 100, log)

    # ── High-res PNG Preview for browser rendering ───────────────────────
    preview_name = f"{source_stem}_w{width}_c{colors}_preview.png"
    preview_path = str(export_dir / preview_name)
    try:
        cv2.imwrite(preview_path, vectorized)
    except Exception:
        preview_name = ""

    # ── Extract Palette from vectorized image ─────────────────────────────
    flat = vectorized.reshape(-1, 3)
    unique_colors, counts = np.unique(flat, axis=0, return_counts=True)
    total_pixels = max(len(flat), 1)
    palette_list = []
    for col, cnt in sorted(zip(unique_colors, counts), key=lambda x: x[1], reverse=True):
        b, g, r = int(col[0]), int(col[1]), int(col[2])
        palette_list.append({
            "hex": f"#{r:02x}{g:02x}{b:02x}",
            "rgb": [r, g, b],
            "percentage": round((float(cnt) / total_pixels) * 100, 1),
            "pixels": int(cnt),
        })

    # ── Stage 8: Pure 2D Textile Design Synthesis ─────────────────────────
    _progress(self, "synthesis: pure 2D Jacquard pattern (human & room free)", 98, log)
    from app.services.textile_assembler import extract_and_assemble_2d_design
    try:
        synth_res = extract_and_assemble_2d_design(
            image=completed,
            regions=regions,
            target_width=width,
            color_count=colors,
            export_dir=export_dir,
            source_stem=source_stem,
            repeat=repeat,
        )
    except Exception as exc:
        log.append(f"  ⚠ 2D synthesis failed ({exc})")
        synth_res = {}
    _progress(self, "pipeline: complete", 100, log)

    # ── Return extended result dict ────────────────────────────────────────
    result: Dict[str, Any] = {
        # Primary exports
        "file_url":              synth_res.get("master_2d_bmp_url") or f"/static/exports/{bmp_name}",
        "raw_quant_bmp_url":     f"/static/exports/{bmp_name}",
        "tiff_url":              synth_res.get("master_2d_tiff_url") or (f"/static/exports/{tiff_name}" if tiff_path else ""),
        "manifest_url":          f"/static/exports/{manifest_name}" if manifest_path else "",
        "preview_url":           synth_res.get("master_2d_preview_url") or (f"/static/exports/{preview_name}" if preview_name else f"/static/exports/{bmp_name}"),
        "raw_quant_preview_url": f"/static/exports/{preview_name}" if preview_name else "",
        "palette":               synth_res.get("palette_2d") or palette_list,
        "palette_2d":            synth_res.get("palette_2d") or palette_list,
        "production_specs":      synth_res.get("production_specs", {}),
        # 2D Textile Design Elements
        "master_2d_bmp_url":              synth_res.get("master_2d_bmp_url", ""),
        "master_2d_tiff_url":             synth_res.get("master_2d_tiff_url", ""),
        "master_2d_preview_url":          synth_res.get("master_2d_preview_url", ""),
        "master_2d_redwhite_preview_url": synth_res.get("master_2d_redwhite_preview_url", ""),
        "master_2d_redwhite_bmp_url":     synth_res.get("master_2d_redwhite_bmp_url", ""),
        "master_2d_blue_preview_url":     synth_res.get("master_2d_blue_preview_url", ""),
        "master_2d_blue_bmp_url":         synth_res.get("master_2d_blue_bmp_url", ""),
        "saree_panel_preview_url":          synth_res.get("saree_panel_preview_url", ""),
        "saree_panel_bmp_url":              synth_res.get("saree_panel_bmp_url", ""),
        "saree_panel_authentic_preview_url": synth_res.get("saree_panel_authentic_preview_url", ""),
        "saree_panel_authentic_bmp_url":     synth_res.get("saree_panel_authentic_bmp_url", ""),
        "saree_panel_blue_preview_url":     synth_res.get("saree_panel_blue_preview_url", ""),
        "saree_panel_blue_bmp_url":         synth_res.get("saree_panel_blue_bmp_url", ""),
        "saree_panel_redwhite_preview_url": synth_res.get("saree_panel_redwhite_preview_url", ""),
        "saree_panel_redwhite_bmp_url":     synth_res.get("saree_panel_redwhite_bmp_url", ""),
        "motif_bmp_url":                  synth_res.get("motif_bmp_url", ""),
        "motif_preview_url":              synth_res.get("motif_preview_url", ""),
        "border_bmp_url":                 synth_res.get("border_bmp_url", ""),
        "border_preview_url":             synth_res.get("border_preview_url", ""),
        "jasc_pal_url":                   synth_res.get("jasc_pal_url", ""),
        "psp_bundle_zip_url":             synth_res.get("psp_bundle_zip_url", ""),
        "ground_color":                   synth_res.get("ground_color", ""),
        "psp_specs":                      synth_res.get("psp_specs", {}),
        "ai_analysis":                    synth_res.get("ai_analysis", {}),
        # Analysis data
        "regions":               regions_dict,
        "repeat":                repeat_dict,
        # Stage 0 metadata
        "sharpness":             round(sharpness, 3),
        "restoration_applied":   restoration_applied,
        # Full log
        "pipeline_log":          log,
    }
    # Merge all dynamic synthesis elements (jeri, ani, body, pallu, infill_metadata, etc.)
    if isinstance(synth_res, dict):
        for k, v in synth_res.items():
            if k not in result or not result[k]:
                result[k] = v

    return result
