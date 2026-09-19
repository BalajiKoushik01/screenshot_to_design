"""
Stage 2: Classical autocorrelation-based lattice / repeat detection.

Finds the dominant repeat vectors (period_x, period_y, basis_v1, basis_v2) and infers
the most likely wallpaper symmetry group using 2D FFT autocorrelation on the
Laplacian-enhanced grayscale image with 2D peak non-maximum suppression, sub-pixel
refinement, and primitive lattice basis reduction.

Supports:
  - straight_grid
  - half_drop (horizontal stagger)
  - brick (vertical stagger)
  - diamond_ogival (diagonal jaal lattices)
  - running_stripe
  - all_over_jaal

No model or training required — pure classical CV (OpenCV + NumPy).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np


@dataclass
class RepeatResult:
    """Detected repeat vector, lattice geometry, and symmetry metadata."""
    vector_x:          int    # Horizontal repeat period (pixels in original image)
    vector_y:          int    # Vertical repeat period (pixels in original image)
    confidence:        float  # [0, 1] — clarity of the detected repeat
    symmetry_group:    str    # Wallpaper group (p1, p2, pm, pg, cm, pmm, pmg, pgg, p4, p4m)
    freq_x:            float  # Dominant horizontal frequency (cycles / pixel)
    freq_y:            float  # Dominant vertical frequency (cycles / pixel)
    arrangement:       str = "straight_grid"  # "half_drop" | "brick" | "diamond_ogival" | "straight_grid" | "running_stripe" | "all_over_jaal"
    half_drop_shift_x: int = 0  # Horizontal shift per vertical period in half-drop lattices
    brick_shift_y:     int = 0  # Vertical shift per horizontal period in brick lattices
    basis_v1:          Tuple[int, int] = (0, 0)  # Primitive lattice basis vector 1 (dx, dy)
    basis_v2:          Tuple[int, int] = (0, 0)  # Primitive lattice basis vector 2 (dx, dy)
    subpixel_period_x: float = 0.0
    subpixel_period_y: float = 0.0

    def to_dict(self) -> dict:
        return {
            "vector_x":          self.vector_x,
            "vector_y":          self.vector_y,
            "confidence":        round(self.confidence, 3),
            "symmetry_group":    self.symmetry_group,
            "arrangement":       self.arrangement,
            "half_drop_shift_x": self.half_drop_shift_x,
            "brick_shift_y":     self.brick_shift_y,
            "basis_v1":          list(self.basis_v1),
            "basis_v2":          list(self.basis_v2),
            "freq_x":            round(self.freq_x, 6),
            "freq_y":            round(self.freq_y, 6),
            "subpixel_period_x": round(self.subpixel_period_x, 2),
            "subpixel_period_y": round(self.subpixel_period_y, 2),
        }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def detect_repeat(image: np.ndarray, max_side: int = 512) -> RepeatResult:
    """Detect repeat vector, primitive lattice basis, arrangement, and symmetry via 2D autocorrelation.

    Args:
        image:    BGR image (full or region crop).
        max_side: Resize to at most this dimension for FFT performance.

    Returns:
        RepeatResult with periods, confidence, basis vectors, arrangement, and wallpaper symmetry.
    """
    gray, scale = _preprocess(image, max_side)
    h_orig, w_orig = image.shape[:2]

    # Compute normalized 2D autocorrelation
    acorr = _autocorrelation_2d(gray)
    h, w = acorr.shape
    ch, cw = h // 2, w // 2

    # 1. 1D Crosshair analysis for fundamental orthogonal axes
    period_x_1d, conf_x = _dominant_period(acorr[ch, :])
    period_y_1d, conf_y = _dominant_period(acorr[:, cw])

    # 2. Extract 2D local maxima peaks with sub-pixel refinement
    peaks_2d = _detect_2d_peaks(acorr, ch, cw)

    # 3. Analyze 2D peak distribution to deduce primitive lattice basis & arrangement
    basis_v1, basis_v2, arrangement, shift_x, shift_y, conf_2d, p_x_scaled, p_y_scaled = (
        _analyze_lattice_geometry(peaks_2d, period_x_1d, period_y_1d, conf_x, conf_y, ch, cw)
    )

    # Sub-pixel interpolation for refined periods
    sub_px = p_x_scaled / scale if p_x_scaled > 0 else 0.0
    sub_py = p_y_scaled / scale if p_y_scaled > 0 else 0.0

    # Scale periods back to original image space
    period_x = int(round(sub_px)) if sub_px > 0 else 0
    period_y = int(round(sub_py)) if sub_py > 0 else 0

    # Scale basis vectors back to original image space
    v1_orig = (int(round(basis_v1[0] / scale)), int(round(basis_v1[1] / scale)))
    v2_orig = (int(round(basis_v2[0] / scale)), int(round(basis_v2[1] / scale)))

    half_drop_shift = int(round(shift_x / scale)) if shift_x != 0 else 0
    brick_shift = int(round(shift_y / scale)) if shift_y != 0 else 0

    # Overall confidence combining 1D and 2D signals
    conf_candidates = [c for c in (conf_x, conf_y, conf_2d) if c > 0]
    overall_confidence = float(np.clip(np.mean(conf_candidates) if conf_candidates else 0.0, 0.0, 1.0))
    if conf_2d > 0.35:
        overall_confidence = max(overall_confidence, float(np.clip(conf_2d, 0.0, 1.0)))

    # Wallpaper symmetry group classification
    symmetry_group = _infer_wallpaper_symmetry(period_x, period_y, arrangement, acorr)

    freq_x = 1.0 / period_x if period_x > 0 else 0.0
    freq_y = 1.0 / period_y if period_y > 0 else 0.0

    return RepeatResult(
        vector_x=period_x,
        vector_y=period_y,
        confidence=overall_confidence,
        symmetry_group=symmetry_group,
        freq_x=freq_x,
        freq_y=freq_y,
        arrangement=arrangement,
        half_drop_shift_x=half_drop_shift,
        brick_shift_y=brick_shift,
        basis_v1=v1_orig,
        basis_v2=v2_orig,
        subpixel_period_x=sub_px,
        subpixel_period_y=sub_py,
    )


# ---------------------------------------------------------------------------
# Preprocessing & 2D Autocorrelation
# ---------------------------------------------------------------------------

def _preprocess(image: np.ndarray, max_side: int) -> Tuple[np.ndarray, float]:
    """Grayscale + multi-scale edge enhancement + optional downscale."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image.copy()
    h, w = gray.shape

    scale = max_side / max(h, w) if max(h, w) > max_side else 1.0
    if scale < 1.0:
        new_w = max(16, int(round(w * scale)))
        new_h = max(16, int(round(h * scale)))
        gray = cv2.resize(gray, (new_w, new_h), interpolation=cv2.INTER_AREA)

    # Enhance periodic structures using combined Laplacian + Sobel gradient magnitude
    float_g = gray.astype(np.float32)
    lap = np.abs(cv2.Laplacian(float_g, cv2.CV_32F))
    sobelx = np.abs(cv2.Sobel(float_g, cv2.CV_32F, 1, 0, ksize=3))
    sobely = np.abs(cv2.Sobel(float_g, cv2.CV_32F, 0, 1, ksize=3))

    grad = lap * 0.5 + (sobelx + sobely) * 0.25
    grad = cv2.GaussianBlur(grad, (3, 3), 0)
    norm_grad = cv2.normalize(grad, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)

    # Local CLAHE contrast boost
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(4, 4))
    enhanced = clahe.apply(norm_grad)

    return enhanced, scale


def _autocorrelation_2d(gray: np.ndarray) -> np.ndarray:
    """Normalized 2D autocorrelation surface via 2D FFT."""
    h, w = gray.shape
    # Pad to next power of 2 for fast FFT
    pad_h = cv2.getOptimalDFTSize(h)
    pad_w = cv2.getOptimalDFTSize(w)

    padded = np.zeros((pad_h, pad_w), dtype=np.float32)
    # Subtract mean to remove zero-frequency DC offset
    padded[:h, :w] = gray.astype(np.float32) - float(np.mean(gray))

    # Apply Hann window to eliminate periodic boundary edge artifacts
    hann_y = np.hanning(h).reshape(h, 1)
    hann_x = np.hanning(w).reshape(1, w)
    padded[:h, :w] *= (hann_y * hann_x)

    f = np.fft.fft2(padded)
    power = np.abs(f) ** 2
    acorr_padded = np.fft.ifft2(power).real
    acorr_shifted = np.fft.fftshift(acorr_padded)

    # Crop back to central (h, w)
    cy_p, cx_p = pad_h // 2, pad_w // 2
    acorr = acorr_shifted[cy_p - h // 2:cy_p + (h + 1) // 2, cx_p - w // 2:cx_p + (w + 1) // 2]

    # Normalize max to 1.0
    ac_max = float(acorr.max())
    if ac_max > 1e-8:
        acorr /= ac_max
    else:
        acorr = np.zeros_like(acorr)

    return acorr


# ---------------------------------------------------------------------------
# Peak Detection & Sub-Pixel Refinement
# ---------------------------------------------------------------------------

@dataclass
class Peak2D:
    dx: float       # Horizontal offset from center (pixels)
    dy: float       # Vertical offset from center (pixels)
    prominence: float
    raw_x: int
    raw_y: int


def _detect_2d_peaks(acorr: np.ndarray, ch: int, cw: int) -> List[Peak2D]:
    """Detect local 2D autocorrelation maxima with non-maximum suppression and sub-pixel fitting."""
    h, w = acorr.shape
    acorr_masked = acorr.copy()

    # Dynamic DC peak mask radius
    dc_radius = max(8, min(h, w) // 28)
    y_grid, x_grid = np.ogrid[:h, :w]
    dist_dc = np.sqrt((x_grid - cw) ** 2 + (y_grid - ch) ** 2)
    acorr_masked[dist_dc <= dc_radius] = 0.0

    # Non-maximum suppression via morphological dilation
    k_size = max(5, min(9, min(h, w) // 30))
    if k_size % 2 == 0:
        k_size += 1
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (k_size, k_size))
    dilated = cv2.dilate(acorr_masked, kernel)

    # Peak condition: local maximum and above adaptive noise floor
    threshold = max(0.10, float(np.percentile(acorr_masked[dist_dc > dc_radius], 85)))
    peaks_mask = (acorr_masked == dilated) & (acorr_masked >= threshold)
    py_coords, px_coords = np.where(peaks_mask)

    peaks: List[Peak2D] = []
    for py, px in zip(py_coords, px_coords):
        dx_int = int(px - cw)
        dy_int = int(py - ch)

        # Retain canonical half-plane (dx > 0 or (dx == 0 and dy > 0)) due to inversion symmetry R(r) = R(-r)
        if dx_int > 0 or (dx_int == 0 and dy_int > 0):
            # Sub-pixel quadratic interpolation around (py, px)
            sub_dx, sub_dy, peak_val = _subpixel_refinement(acorr, px, py, cw, ch)
            prom = float(np.clip(peak_val, 0.0, 1.0))
            peaks.append(Peak2D(dx=sub_dx, dy=sub_dy, prominence=prom, raw_x=px, raw_y=py))

    # Sort peaks by descending prominence
    peaks.sort(key=lambda p: -p.prominence)
    return peaks


def _subpixel_refinement(acorr: np.ndarray, px: int, py: int, cw: int, ch: int) -> Tuple[float, float, float]:
    """Fit a 2D quadratic patch to extract sub-pixel peak position and amplitude."""
    h, w = acorr.shape
    if 1 <= py < h - 1 and 1 <= px < w - 1:
        # Sample 3x3 patch
        patch = acorr[py - 1:py + 2, px - 1:px + 2]
        # Partial derivatives
        dx = (patch[1, 2] - patch[1, 0]) / 2.0
        dy = (patch[2, 1] - patch[0, 1]) / 2.0
        dxx = patch[1, 2] - 2 * patch[1, 1] + patch[1, 0]
        dyy = patch[2, 1] - 2 * patch[1, 1] + patch[0, 1]
        dxy = (patch[2, 2] - patch[2, 0] - patch[0, 2] + patch[0, 0]) / 4.0

        det = dxx * dyy - dxy * dxy
        if abs(det) > 1e-6:
            shift_x = -(dyy * dx - dxy * dy) / det
            shift_y = -(dxx * dy - dxy * dx) / det
            if abs(shift_x) < 1.0 and abs(shift_y) < 1.0:
                refined_dx = (px - cw) + shift_x
                refined_dy = (py - ch) + shift_y
                refined_val = patch[1, 1] + 0.5 * (dx * shift_x + dy * shift_y)
                return float(refined_dx), float(refined_dy), float(refined_val)

    return float(px - cw), float(py - ch), float(acorr[py, px])


# ---------------------------------------------------------------------------
# Lattice Geometry & Basis Vector Deduction
# ---------------------------------------------------------------------------

def _dominant_period(signal: np.ndarray, min_period: int = 8) -> Tuple[float, float]:
    """Find the dominant period in a 1D autocorrelation slice with sub-pixel interpolation."""
    n = len(signal)
    centre = n // 2
    half = signal[centre + min_period:]

    if len(half) < min_period:
        return 0.0, 0.0

    peaks = []
    for i in range(1, len(half) - 1):
        if half[i] > half[i - 1] and half[i] > half[i + 1] and half[i] > 0.12:
            # 1D parabolic interpolation
            denom = half[i - 1] - 2 * half[i] + half[i + 1]
            shift = 0.0
            if abs(denom) > 1e-6:
                shift = (half[i - 1] - half[i + 1]) / (2.0 * denom)
            lag = (i + min_period) + shift
            prom = float(half[i] - 0.25 * (half[i - 1] - half[i + 1]) * shift)
            peaks.append((lag, prom))

    if not peaks:
        return 0.0, 0.0

    return _select_fundamental_lag(peaks)


def _select_fundamental_lag(peaks: List[Tuple[float, float]]) -> Tuple[float, float]:
    """Select the fundamental period, avoiding harmonic frequency doubling (2*T, 3*T)."""
    sorted_by_prom = sorted(peaks, key=lambda p: -p[1])
    best_lag, best_prom = sorted_by_prom[0]

    for lag, prom in sorted(peaks, key=lambda p: p[0]):
        if lag < best_lag * 0.75 and lag >= 8:
            ratio = best_lag / lag
            nearest_int = round(ratio)
            if nearest_int in (2, 3) and abs(ratio - nearest_int) <= 0.18:
                if prom >= best_prom * 0.45:
                    return float(lag), float(np.clip(prom, 0.0, 1.0))

    return float(best_lag), float(np.clip(best_prom, 0.0, 1.0))


def _select_fundamental_peak_1d(peaks: List[Peak2D], axis: str = "x") -> Optional[Peak2D]:
    """Select fundamental orthogonal peak, avoiding harmonic multiples."""
    if not peaks:
        return None
    sorted_by_prom = sorted(peaks, key=lambda p: -p.prominence)
    best_p = sorted_by_prom[0]
    best_val = best_p.dx if axis == "x" else abs(best_p.dy)

    for p in sorted(peaks, key=lambda p: (p.dx if axis == "x" else abs(p.dy))):
        val = p.dx if axis == "x" else abs(p.dy)
        if val < best_val * 0.75 and val >= 8:
            ratio = best_val / val
            nearest_int = round(ratio)
            if nearest_int in (2, 3) and abs(ratio - nearest_int) <= 0.18:
                if p.prominence >= best_p.prominence * 0.45:
                    return p
    return best_p


def _select_fundamental_peak_diag(peaks: List[Peak2D]) -> Optional[Peak2D]:
    """Select fundamental diagonal peak, avoiding harmonic multiples."""
    if not peaks:
        return None
    sorted_by_prom = sorted(peaks, key=lambda p: -p.prominence)
    best_p = sorted_by_prom[0]
    best_dist = math.hypot(best_p.dx, best_p.dy)

    for p in sorted(peaks, key=lambda p: math.hypot(p.dx, p.dy)):
        dist = math.hypot(p.dx, p.dy)
        if dist < best_dist * 0.75 and dist >= 10:
            ratio = best_dist / dist
            nearest_int = round(ratio)
            if nearest_int in (2, 3) and abs(ratio - nearest_int) <= 0.18:
                if p.prominence >= best_p.prominence * 0.45:
                    return p
    return best_p


def _analyze_lattice_geometry(
    peaks: List[Peak2D],
    p_x_1d: float,
    p_y_1d: float,
    conf_x: float,
    conf_y: float,
    ch: int,
    cw: int,
) -> Tuple[Tuple[int, int], Tuple[int, int], str, int, int, float, float, float]:
    """Deduce primitive lattice basis vectors and classify repeat arrangement.

    Returns:
        (basis_v1, basis_v2, arrangement, half_drop_shift_x, brick_shift_y, confidence_2d, period_x, period_y)
    """
    if not peaks:
        px = int(round(p_x_1d))
        py = int(round(p_y_1d))
        arr = "straight_grid"
        if px > 0 and py == 0:
            arr = "running_stripe"
        return (px, 0), (0, py), arr, 0, 0, float(np.clip((conf_x + conf_y) / 2.0, 0.0, 1.0)), p_x_1d, p_y_1d

    # Separate orthogonal peaks (|dy| < 8 or |dx| < 8) from diagonal peaks
    ortho_h_candidates = [p for p in peaks if abs(p.dy) <= 6 and p.dx >= 10]
    ortho_v_candidates = [p for p in peaks if abs(p.dx) <= 6 and abs(p.dy) >= 10]
    diagonal_candidates = [p for p in peaks if p.dx >= 10 and abs(p.dy) >= 10]

    ortho_h_fund = _select_fundamental_peak_1d(ortho_h_candidates, axis="x")
    ortho_v_fund = _select_fundamental_peak_1d(ortho_v_candidates, axis="y")
    diag_fund = _select_fundamental_peak_diag(diagonal_candidates)

    best_px = p_x_1d
    best_py = p_y_1d
    if ortho_h_fund and (p_x_1d == 0 or ortho_h_fund.prominence > conf_x * 0.85):
        best_px = ortho_h_fund.dx
        conf_x = max(conf_x, ortho_h_fund.prominence)
    if ortho_v_fund and (p_y_1d == 0 or ortho_v_fund.prominence > conf_y * 0.85):
        best_py = abs(ortho_v_fund.dy)
        conf_y = max(conf_y, ortho_v_fund.prominence)

    top_peak = peaks[0]
    conf_2d = top_peak.prominence

    # Case 1: Dominant Diagonal Peak (Half-Drop, Brick, or Diamond Ogival)
    if diag_fund:
        diag = diag_fund
        dx_d = diag.dx
        dy_d = abs(diag.dy)

        has_pure_h = (ortho_h_fund is not None and ortho_h_fund.prominence >= 0.35)
        has_pure_v = (ortho_v_fund is not None and ortho_v_fund.prominence >= 0.35)

        # 1. Half-Drop: pure horizontal repeat (Tx, 0) exists with strong prominence, staggered by dx_d ≈ Tx / 2
        is_half_drop = (
            (has_pure_h and abs(dx_d - best_px / 2.0) <= max(4.0, best_px * 0.18)) or
            (best_px == 0 and best_py > 0 and abs(dy_d - best_py) <= max(4.0, best_py * 0.18))
        )
        # 2. Brick: pure vertical repeat (0, Ty) exists with strong prominence, staggered by dy_d ≈ Ty / 2
        is_brick = (
            (has_pure_v and abs(dy_d - best_py / 2.0) <= max(4.0, best_py * 0.18)) or
            (best_py == 0 and best_px > 0 and abs(dx_d - best_px) <= max(4.0, best_px * 0.18))
        )

        if is_half_drop and not (is_brick and conf_y > conf_x * 1.3):
            arrangement = "half_drop"
            shift_x = int(round(dx_d))
            py_final = dy_d if (best_py > 0 and abs(best_py - dy_d * 2.0) <= max(4.0, dy_d * 0.18)) else (best_py if best_py > 0 else dy_d)
            v1 = (int(round(best_px)), 0)
            v2 = (shift_x, int(round(py_final)))
            return v1, v2, arrangement, shift_x, 0, conf_2d, best_px, py_final

        elif is_brick:
            arrangement = "brick"
            shift_y = int(round(dy_d))
            px_final = dx_d if (best_px == 0 or abs(best_px - dx_d * 2.0) <= max(4.0, dx_d * 0.18)) else best_px
            v1 = (int(round(px_final)), shift_y)
            v2 = (0, int(round(best_py)))
            return v1, v2, arrangement, 0, shift_y, conf_2d, px_final, best_py

        # If the diagonal peak matches (best_px, best_py), it is the Cartesian diagonal of a straight grid!
        is_straight_grid_diagonal = (
            best_px > 0 and best_py > 0 and
            abs(dx_d - best_px) <= max(4.0, best_px * 0.18) and
            abs(dy_d - best_py) <= max(4.0, best_py * 0.18)
        )
        if is_straight_grid_diagonal:
            arrangement = "straight_grid"
            v1 = (int(round(best_px)), 0)
            v2 = (0, int(round(best_py)))
            return v1, v2, arrangement, 0, 0, max(conf_x, conf_y), best_px, best_py

        # Check C: Diamond / Ogival Jaal (Diagonal basis vectors v1 = (dx, dy), v2 = (-dx, dy))
        # Condition: Top peak is diagonal with symmetric partner, AND it is NOT an orthogonal harmonic
        has_symmetric_partner = any(
            abs(p.dx - dx_d) <= 4 and abs(abs(p.dy) - dy_d) <= 4 and np.sign(p.dy) != np.sign(diag.dy)
            for p in diagonal_candidates[1:5]
        )
        is_true_diamond = (best_px == 0 and best_py == 0) or (dx_d < best_px * 0.75 and dy_d < best_py * 0.75)
        if (has_symmetric_partner and is_true_diamond) or (diag.prominence >= 0.35 and best_px == 0 and best_py == 0):
            arrangement = "diamond_ogival"
            full_px = dx_d * 2.0
            full_py = dy_d * 2.0
            v1 = (int(round(dx_d)), int(round(diag.dy)))
            v2 = (int(round(-dx_d)), int(round(dy_d)))
            return v1, v2, arrangement, int(round(dx_d)), int(round(dy_d)), conf_2d, full_px, full_py

    # Case 2: Orthogonal / Straight Grid
    if best_px >= 10 and best_py >= 10:
        arrangement = "straight_grid"
        v1 = (int(round(best_px)), 0)
        v2 = (0, int(round(best_py)))
        return v1, v2, arrangement, 0, 0, max(conf_x, conf_y), best_px, best_py

    # Case 3: Running Stripe (1D periodic)
    if best_px >= 10 and best_py == 0:
        return (int(round(best_px)), 0), (0, 0), "running_stripe", 0, 0, conf_x, best_px, 0.0

    if best_py >= 10 and best_px == 0:
        return (0, 0), (0, int(round(best_py))), "running_stripe", 0, 0, conf_y, 0.0, best_py

    # Case 4: Dense all-over jaal fallback
    arrangement = "all_over_jaal" if len(peaks) >= 4 else "straight_grid"
    v1 = (int(round(top_peak.dx)), int(round(top_peak.dy)))
    v2 = (int(round(peaks[1].dx)), int(round(peaks[1].dy))) if len(peaks) > 1 else (0, 0)
    return v1, v2, arrangement, 0, 0, conf_2d, max(16.0, top_peak.dx), max(16.0, abs(top_peak.dy))


# ---------------------------------------------------------------------------
# Wallpaper Symmetry Group Classification
# ---------------------------------------------------------------------------

def _infer_wallpaper_symmetry(px: int, py: int, arrangement: str, acorr: np.ndarray) -> str:
    """Classify 2D pattern into one of the 17 crystallographic plane wallpaper groups.

    Common textile groups:
      - p1: Translation only (asymmetric floral, paisley)
      - p2: 180-degree rotational symmetry
      - pm: Reflection along 1 axis
      - pg: Glide reflection along 1 axis
      - cm: Reflection with alternating staggered centers (classic half-drop)
      - pmm: Perpendicular 2-axis reflection
      - pmg: Reflection along 1 axis, glide along perpendicular axis
      - pgg: Perpendicular glide reflections
      - p4: 4-fold rotation (square medallions)
      - p4m: 4-fold rotation + diagonal & axial reflections (royal Kanchipuram chakra coins)
    """
    if px == 0 and py == 0:
        return "p1"

    h, w = acorr.shape
    ch, cw = h // 2, w // 2

    # Horizontal reflection score (x -> -x)
    sub_w = min(cw, 128)
    sub_h = min(ch, 128)
    patch_right = acorr[ch - sub_h:ch + sub_h, cw:cw + sub_w]
    patch_left_flipped = np.fliplr(acorr[ch - sub_h:ch + sub_h, cw - sub_w:cw])
    score_mirror_h = _normalized_similarity(patch_right, patch_left_flipped)

    # Vertical reflection score (y -> -y)
    patch_bottom = acorr[ch:ch + sub_h, cw - sub_w:cw + sub_w]
    patch_top_flipped = np.flipud(acorr[ch - sub_h:ch, cw - sub_w:cw + sub_w])
    score_mirror_v = _normalized_similarity(patch_bottom, patch_top_flipped)

    # 4-fold rotation score (90 deg) if aspect ratio is close to square
    is_square_repeat = (0.85 <= (px / max(1, py)) <= 1.18) if (px > 0 and py > 0) else False
    score_rot4 = 0.0
    if is_square_repeat:
        dim = min(sub_h, sub_w)
        patch_sq = acorr[ch - dim:ch + dim, cw - dim:cw + dim]
        patch_rot90 = np.rot90(patch_sq)
        score_rot4 = _normalized_similarity(patch_sq, patch_rot90)

    # Diagonal reflection score (x <-> y)
    score_diag = 0.0
    if is_square_repeat:
        dim = min(sub_h, sub_w)
        patch_sq = acorr[ch - dim:ch + dim, cw - dim:cw + dim]
        patch_transpose = patch_sq.T
        score_diag = _normalized_similarity(patch_sq, patch_transpose)

    # Classification logic
    if score_rot4 > 0.72:
        if score_mirror_h > 0.65 or score_diag > 0.65:
            return "p4m"
        return "p4"

    if arrangement in ("half_drop", "brick", "diamond_ogival"):
        if score_mirror_h > 0.62 or score_mirror_v > 0.62:
            return "cm"
        return "p2"

    # Straight grid
    if score_mirror_h > 0.65 and score_mirror_v > 0.65:
        return "pmm"
    elif score_mirror_h > 0.65 or score_mirror_v > 0.65:
        return "pm"
    elif score_diag > 0.65:
        return "p2"

    return "p1"


def _normalized_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity / normalized cross correlation between two arrays."""
    if a.shape != b.shape or a.size == 0:
        return 0.0
    a_f = a.astype(np.float32)
    b_f = b.astype(np.float32)
    denom = (np.linalg.norm(a_f) * np.linalg.norm(b_f))
    if denom < 1e-8:
        return 0.0
    dot = float(np.sum(a_f * b_f))
    return float(np.clip(dot / denom, 0.0, 1.0))
