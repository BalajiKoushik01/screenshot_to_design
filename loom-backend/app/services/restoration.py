"""
Stage 0: Sharpness check (Laplacian variance) + conditional Real-ESRGAN upscale/denoise.

The sharpness check always runs. Restoration only triggers below the threshold.
Real-ESRGAN ONNX weights are loaded lazily from app/services/weights/ if present.
Without weights, a classical NL-means denoising fallback is applied — still useful
for mild noise and JPEG compression artefacts typical in saree screenshots.

No custom training required — pretrained open-source weights only.
"""
import cv2
import numpy as np
from pathlib import Path
from typing import Tuple

# Laplacian variance below this is considered "blurry / low-quality"
SHARPNESS_THRESHOLD = 100.0

# Expected ONNX weight paths (download separately; not bundled)
_WEIGHTS_DIR = Path(__file__).parent / "weights"
_ESRGAN_ONNX = _WEIGHTS_DIR / "RealESRGAN_x4plus.onnx"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compute_sharpness(image: np.ndarray) -> float:
    """Return Laplacian variance (higher = sharper) for a BGR image."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def needs_restoration(image: np.ndarray, threshold: float = SHARPNESS_THRESHOLD) -> bool:
    """True if image quality is below threshold."""
    return compute_sharpness(image) < threshold


def restore(image: np.ndarray) -> Tuple[np.ndarray, bool]:
    """Conditionally restore an image.

    Returns:
        (image, was_restored) — was_restored is True when any denoising was applied.
    """
    if not needs_restoration(image):
        return image, False

    # Prefer ONNX Real-ESRGAN if weights are present
    if _ESRGAN_ONNX.exists():
        try:
            restored = _restore_esrgan_onnx(image)
            return restored, True
        except Exception:
            pass  # fall through to classical

    # Classical fallback: fast NL-means denoising (no upscaling)
    restored = cv2.fastNlMeansDenoisingColored(
        image, None, h=6, hColor=6, templateWindowSize=7, searchWindowSize=21
    )
    return restored, True


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _restore_esrgan_onnx(image: np.ndarray) -> np.ndarray:
    """Run Real-ESRGAN x4 upscale via ONNX Runtime (CPU or GPU)."""
    import onnxruntime as ort  # optional dependency

    img_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    inp = np.transpose(img_rgb, (2, 0, 1))[np.newaxis]  # NCHW

    providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
    session = ort.InferenceSession(str(_ESRGAN_ONNX), providers=providers)
    output = session.run(None, {session.get_inputs()[0].name: inp})[0]

    out = np.squeeze(output, 0)               # CHW
    out = np.transpose(out, (1, 2, 0))        # HWC
    out = np.clip(out * 255.0, 0, 255).astype(np.uint8)
    return cv2.cvtColor(out, cv2.COLOR_RGB2BGR)
