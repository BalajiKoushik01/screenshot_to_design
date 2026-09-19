"""
Stage 1: Region segmentation — MobileSAM (pretrained, zero-shot) + position heuristics.

Segments the deskewed saree image into four semantic regions:
  BORDER  — decorative border strips around all four edges
  PALLU   — ornate end-piece (right ~25 % of a landscape saree)
  BODY    — central field / ground
  MOTIF   — individual motif instances detected within body/border

Primary path: MobileSAM ONNX (encoder + decoder). Falls back to pure
position-heuristic segmentation when weights are absent or inference fails.
No custom training required.
"""
import cv2
import numpy as np
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import List, Tuple

_WEIGHTS_DIR   = Path(__file__).parent / "weights"
_SAM_ENCODER   = _WEIGHTS_DIR / "mobile_sam_encoder.onnx"
_SAM_DECODER   = _WEIGHTS_DIR / "mobile_sam_decoder.onnx"

_SAM_LONG_SIDE = 1024


class RegionLabel(str, Enum):
    BORDER = "border"
    BODY   = "body"
    PALLU  = "pallu"
    MOTIF  = "motif"


@dataclass
class SegmentationRegion:
    label:      RegionLabel
    mask:       np.ndarray                   # Binary H×W uint8 (255 = inside)
    bbox:       Tuple[int, int, int, int]    # x, y, w, h (image pixel coords)
    confidence: float
    metadata:   dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        x, y, w, h = self.bbox
        return {
            "label":      self.label.value,
            "bbox":       {"x": x, "y": y, "w": w, "h": h},
            "confidence": round(self.confidence, 3),
            "area_px":    int(self.mask.sum() // 255),
            "metadata":   self.metadata,
        }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def segment_regions(image: np.ndarray) -> List[SegmentationRegion]:
    """Segment a deskewed saree image into labelled regions.

    Tries MobileSAM ONNX first; falls back to position heuristics.
    """
    if _SAM_ENCODER.exists() and _SAM_DECODER.exists():
        try:
            return _mobilesam_segment(image)
        except Exception:
            pass
    return _heuristic_segment(image)


# ---------------------------------------------------------------------------
# Heuristic segmentation
# ---------------------------------------------------------------------------

def _heuristic_segment(image: np.ndarray) -> List[SegmentationRegion]:
    """Position-based segmentation for a typical landscape saree photo.

    Layout assumptions (landscape orientation):
        Border : 12 % of width/height as an inset frame
        Pallu  : rightmost 25 % of the body area
        Body   : remaining centre
    """
    h, w = image.shape[:2]
    bw = max(4, int(w * 0.12))   # border width
    bh = max(4, int(h * 0.12))   # border height
    px = int(w * 0.75)           # pallu start x

    regions: List[SegmentationRegion] = []

    # ── Border ───────────────────────────────────────────────
    bm = np.zeros((h, w), dtype=np.uint8)
    bm[:bh,    :]  = 255
    bm[h-bh:,  :]  = 255
    bm[:,  :bw]    = 255
    bm[:,  w-bw:]  = 255
    regions.append(SegmentationRegion(
        label=RegionLabel.BORDER, mask=bm,
        bbox=(0, 0, w, h), confidence=0.75,
        metadata={"method": "heuristic"},
    ))

    # ── Pallu ─────────────────────────────────────────────────
    pm = np.zeros((h, w), dtype=np.uint8)
    pm[bh:h-bh, px:w-bw] = 255
    regions.append(SegmentationRegion(
        label=RegionLabel.PALLU, mask=pm,
        bbox=(px, bh, w-px-bw, h-2*bh), confidence=0.65,
        metadata={"method": "heuristic"},
    ))

    # ── Body ──────────────────────────────────────────────────
    bodym = np.zeros((h, w), dtype=np.uint8)
    bodym[bh:h-bh, bw:px] = 255
    regions.append(SegmentationRegion(
        label=RegionLabel.BODY, mask=bodym,
        bbox=(bw, bh, px-bw, h-2*bh), confidence=0.80,
        metadata={"method": "heuristic"},
    ))

    # ── Motif instances (simple blob detection inside body) ───
    motifs = _detect_motifs(image, bodym)
    regions.extend(motifs)

    return regions


def _detect_motifs(image: np.ndarray, body_mask: np.ndarray) -> List[SegmentationRegion]:
    """Detect repeating motif blobs inside the body region using simple thresholding."""
    motifs: List[SegmentationRegion] = []
    h, w = image.shape[:2]

    # Work on gray body-masked region
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    masked_gray = cv2.bitwise_and(gray, gray, mask=body_mask)

    # Adaptive threshold to find high-contrast blobs (motifs stand out from ground)
    thresh = cv2.adaptiveThreshold(
        masked_gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, -5,
    )
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN,
                              cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))

    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    min_area = (h * w) * 0.001  # at least 0.1 % of image
    max_area = (h * w) * 0.10   # at most 10 %

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if not (min_area < area < max_area):
            continue
        x, y, cw, ch = cv2.boundingRect(cnt)
        mot_mask = np.zeros((h, w), dtype=np.uint8)
        cv2.drawContours(mot_mask, [cnt], -1, 255, cv2.FILLED)
        motifs.append(SegmentationRegion(
            label=RegionLabel.MOTIF, mask=mot_mask,
            bbox=(x, y, cw, ch), confidence=0.55,
            metadata={"method": "blob_detect", "area_px": int(area)},
        ))

    return motifs[:20]  # cap at 20 motif instances for MVP


# ---------------------------------------------------------------------------
# MobileSAM segmentation
# ---------------------------------------------------------------------------

def _mobilesam_segment(image: np.ndarray) -> List[SegmentationRegion]:
    """MobileSAM zero-shot segmentation, refined with position heuristics."""
    import onnxruntime as ort

    h, w = image.shape[:2]
    scale = _SAM_LONG_SIDE / max(h, w)
    new_h, new_w = int(h * scale), int(w * scale)
    resized = cv2.resize(image, (new_w, new_h))

    # Normalise to ImageNet stats (BGR→RGB)
    mean = np.array([123.675, 116.28, 103.53])
    std  = np.array([58.395,  57.12,  57.375])
    inp  = (resized[..., ::-1].astype(np.float32) - mean) / std
    inp  = np.transpose(inp, (2, 0, 1))[np.newaxis]
    pad_h = _SAM_LONG_SIDE - new_h
    pad_w = _SAM_LONG_SIDE - new_w
    inp   = np.pad(inp, ((0,0),(0,0),(0,pad_h),(0,pad_w)))

    providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
    encoder   = ort.InferenceSession(str(_SAM_ENCODER), providers=providers)
    embedding = encoder.run(None, {encoder.get_inputs()[0].name: inp})[0]

    decoder   = ort.InferenceSession(str(_SAM_DECODER), providers=providers)

    # Three prompt points: left-third (body), centre-right (pallu), top-edge (border)
    prompt_pts = np.array([
        [new_w * 0.35, new_h * 0.5],
        [new_w * 0.80, new_h * 0.5],
        [new_w * 0.5,  new_h * 0.05],
    ], dtype=np.float32)[np.newaxis]
    prompt_labels = np.ones((1, 3), dtype=np.float32)

    masks_out, scores, _ = decoder.run(None, {
        "image_embeddings":  embedding,
        "point_coords":      prompt_pts,
        "point_labels":      prompt_labels,
        "orig_im_size":      np.array([new_h, new_w], dtype=np.float32)[np.newaxis],
        "mask_input":        np.zeros((1, 1, 256, 256), dtype=np.float32),
        "has_mask_input":    np.array([0], dtype=np.float32),
    })

    best_idx = int(np.argmax(scores[0]))
    raw_mask = (masks_out[0, best_idx] > 0).astype(np.uint8) * 255
    raw_mask = cv2.resize(raw_mask, (w, h), interpolation=cv2.INTER_NEAREST)

    # Refine heuristic regions with SAM mask
    regions = _heuristic_segment(image)
    for region in regions:
        overlap = cv2.bitwise_and(region.mask, raw_mask)
        if overlap.sum() / (region.mask.sum() + 1) > 0.35:
            region.mask       = overlap
            region.confidence = min(region.confidence + 0.15, 0.95)
            region.metadata["method"] = "mobilesam+heuristic"
    return regions
