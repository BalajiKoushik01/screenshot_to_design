"""Editable dot draft from visible contrast inside a calibrated photo crop."""
import cv2
import numpy as np


def trace_photo_dots(crop: np.ndarray, width: int) -> np.ndarray:
    """Trace darker details relative to local lighting, without adding motifs."""
    h, w = crop.shape[:2]
    height = max(1, round(h * width / w))
    if width < 1 or width > 16_384 or height > 16_384 or width * height > 8_000_000:
        raise ValueError("Photo trace exceeds the Dot Studio size limit")

    lightness = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB)[:, :, 0].astype(np.float32)
    detail = cv2.GaussianBlur(lightness, (0, 0), sigmaX=0.8)
    lighting_scale = max(2.0, min(h, w) / 14)
    background = cv2.GaussianBlur(detail, (0, 0), sigmaX=lighting_scale)
    response = np.clip(background - detail, 0, 255).astype(np.uint8)
    threshold, _ = cv2.threshold(response, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    dots = np.where(response > max(3, threshold), 255, 0).astype(np.uint8)
    return cv2.resize(dots, (width, height), interpolation=cv2.INTER_NEAREST)
