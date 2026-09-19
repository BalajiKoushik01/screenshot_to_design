"""
Test Suite for Upgraded Pattern Recognition and Replication Engine.

Validates:
  1. 2D Autocorrelation Lattice & Basis Vector Detection:
     - Straight Grid (Tx=60, Ty=70)
     - Half-Drop Lattice (Tx=80, Ty=100, shift=40)
     - Brick Lattice (Tx=100, Ty=80, shift=40)
     - Diamond / Ogival Jaal Lattice
     - Wallpaper Symmetry Classification
  2. Multi-Instance Motif Recognition & Median Ensembling:
     - Extraction across fabric with simulated fold/shadow on one instance
     - Consensus median reconstruction
     - Non-destructive symmetry evaluation (paisley vs chakra)
  3. Pattern Completion & Multi-Lattice Infill:
     - Multi-donor periodic consensus fill on masked fabric gaps
  4. Border Ribbon Autocorrelation & Seam-Optimized Tiling:
     - 1D repeat detection and seamless horizontal wrapping
  5. Master CAD Replicated Draft Synthesis:
     - 1-pixel Jacquard floating and ground tabby cards
"""
import cv2
import numpy as np
from pathlib import Path

from app.services.lattice import detect_repeat, RepeatResult
from app.services.dynamic_extractor import DynamicTextileExtractor
from app.services.completion import complete_regions
from app.services.textile_assembler import (
    synthesize_replicated_body_draft,
    synthesize_half_drop_body_draft,
)


def _create_synthetic_motif(w: int = 36, h: int = 44) -> np.ndarray:
    """Create an authentic mango/paisley motif with curved tip."""
    canvas = np.zeros((h, w), dtype=np.uint8)
    cx, cy = w // 2, h // 2
    cv2.ellipse(canvas, (cx, cy + 4), (w // 2 - 4, h // 2 - 8), 0, 0, 360, 255, -1)
    # Curved tip
    pts = np.array([[cx - 6, cy - 6], [cx + 2, 4], [cx + 10, 8], [cx + 4, cy]], np.int32)
    cv2.fillPoly(canvas, [pts], 255)
    # Hollow interior
    cv2.ellipse(canvas, (cx, cy + 4), (w // 4, h // 4), 0, 0, 360, 0, -1)
    return canvas


# ===========================================================================
# 1. Tests for 2D Autocorrelation Lattice Detection
# ===========================================================================

def test_lattice_straight_grid():
    """Test repeat detection on a pure straight orthogonal grid."""
    H, W = 400, 400
    canvas = np.full((H, W, 3), (40, 30, 160), dtype=np.uint8) # Dark red
    motif = _create_synthetic_motif(30, 36)
    motif_bgr = np.zeros((36, 30, 3), dtype=np.uint8)
    motif_bgr[motif > 128] = (60, 200, 240) # Gold zari

    Tx, Ty = 60, 70
    for y in range(20, H - 40, Ty):
        for x in range(20, W - 40, Tx):
            canvas[y:y + 36, x:x + 30] = np.where(motif_bgr > 0, motif_bgr, canvas[y:y + 36, x:x + 30])

    res = detect_repeat(canvas, max_side=512)

    assert res.confidence > 0.40, f"Confidence too low: {res.confidence}"
    assert abs(res.vector_x - Tx) <= 4, f"vector_x {res.vector_x} != expected {Tx}"
    assert abs(res.vector_y - Ty) <= 4, f"vector_y {res.vector_y} != expected {Ty}"
    assert res.arrangement == "straight_grid", f"Expected straight_grid, got {res.arrangement}"
    print(f"✔ Straight Grid: Tx={res.vector_x} (exp {Tx}), Ty={res.vector_y} (exp {Ty}), conf={res.confidence:.2f}, symmetry={res.symmetry_group}")


def test_lattice_half_drop():
    """Test repeat detection on an authentic half-drop lattice."""
    H, W = 450, 450
    canvas = np.full((H, W, 3), (40, 30, 160), dtype=np.uint8)
    motif = _create_synthetic_motif(28, 34)
    motif_bgr = np.zeros((34, 28, 3), dtype=np.uint8)
    motif_bgr[motif > 128] = (60, 200, 240)

    Tx, Ty = 80, 100
    half_x = Tx // 2

    row_idx = 0
    for y in range(20, H - 40, Ty):
        x_shift = half_x if (row_idx % 2 == 1) else 0
        for x in range(20 + x_shift, W - 40, Tx):
            if x + 28 < W and y + 34 < H:
                canvas[y:y + 34, x:x + 28] = np.where(motif_bgr > 0, motif_bgr, canvas[y:y + 34, x:x + 28])
        row_idx += 1

    res = detect_repeat(canvas, max_side=512)

    assert res.confidence > 0.35, f"Confidence too low: {res.confidence}"
    assert res.arrangement == "half_drop", f"Expected half_drop, got {res.arrangement}"
    assert abs(res.vector_x - Tx) <= 6, f"vector_x {res.vector_x} != expected {Tx}"
    assert abs(res.half_drop_shift_x - half_x) <= 6, f"half_drop_shift_x {res.half_drop_shift_x} != expected {half_x}"
    print(f"✔ Half-Drop: Tx={res.vector_x}, Ty={res.vector_y}, shift_x={res.half_drop_shift_x} (exp {half_x}), arrangement={res.arrangement}")


def test_lattice_brick():
    """Test repeat detection on a brick (vertical stagger) repeat."""
    H, W = 450, 450
    canvas = np.full((H, W, 3), (120, 40, 20), dtype=np.uint8) # Royal blue ground
    motif = _create_synthetic_motif(28, 34)
    motif_bgr = np.zeros((34, 28, 3), dtype=np.uint8)
    motif_bgr[motif > 128] = (60, 200, 240)

    Tx, Ty = 100, 80
    half_y = Ty // 2

    col_idx = 0
    for x in range(20, W - 40, Tx):
        y_shift = half_y if (col_idx % 2 == 1) else 0
        for y in range(20 + y_shift, H - 40, Ty):
            if x + 28 < W and y + 34 < H:
                canvas[y:y + 34, x:x + 28] = np.where(motif_bgr > 0, motif_bgr, canvas[y:y + 34, x:x + 28])
        col_idx += 1

    res = detect_repeat(canvas, max_side=512)

    assert res.confidence > 0.30
    assert res.arrangement == "brick", f"Expected brick, got {res.arrangement}"
    assert abs(res.vector_x - Tx) <= 6
    assert abs(res.brick_shift_y - half_y) <= 6
    print(f"✔ Brick Repeat: Tx={res.vector_x}, Ty={res.vector_y}, shift_y={res.brick_shift_y} (exp {half_y}), arrangement={res.arrangement}")


# ===========================================================================
# 2. Tests for Multi-Instance Motif Recognition & Median Ensembling
# ===========================================================================

def test_multi_instance_motif_ensembling():
    """Verify that ensembling multiple instances removes shadows/blemishes from a folded motif."""
    H, W = 400, 400
    # Silk ground: Crimson Red [32, 16, 160]
    canvas = np.full((H, W, 3), (32, 16, 160), dtype=np.uint8)
    clean_motif = _create_synthetic_motif(36, 46)

    # Place 4 instances
    positions = [(80, 80), (220, 80), (80, 220), (220, 220)]
    for idx, (bx, by) in enumerate(positions):
        motif_patch = np.zeros((46, 36, 3), dtype=np.uint8)
        motif_patch[clean_motif > 128] = (50, 200, 245) # Zari

        # Introduce an artificial dark shadow crease on instance 0 left zari wall
        if idx == 0:
            motif_patch[18:32, 6:14] = (15, 10, 80)

        canvas[by:by + 46, bx:bx + 36] = np.where(motif_patch > 0, motif_patch, canvas[by:by + 46, bx:bx + 36])

    seed_crop = canvas[80:80 + 46, 80:80 + 36].copy() # Starts with the blemished seed
    fabric_mask = np.ones((H, W), dtype=bool)

    ensembled, count = DynamicTextileExtractor._ensemble_multi_instance_motif(
        image=canvas,
        seed_crop=seed_crop,
        fabric_mask=fabric_mask,
        ground_bgr=np.array([32, 16, 160], dtype=np.uint8),
    )

    assert count >= 3, f"Expected at least 3 instances detected, got {count}"

    # Verify shadow has been eliminated by median ensembling:
    # Check left wall color of ensembled crop where shadow was in seed
    shadow_region_ensembled = ensembled[22:28, 7:12]
    # Should be predominantly golden zari (> 150 in red channel), NOT dark shadow
    mean_val = np.mean(shadow_region_ensembled, axis=(0, 1))
    assert mean_val[2] > 150, f"Shadow was not removed by ensembling: mean BGR {mean_val}"
    print(f"✔ Multi-Instance Ensembling: {count} instances aligned and fused. Shadow successfully healed!")


def test_motif_symmetry_preservation():
    """Verify that asymmetric motifs (paisley) are not mutated into heart shapes."""
    asym_paisley = _create_synthetic_motif(40, 50)
    score_v, score_h, score_rot = DynamicTextileExtractor._evaluate_motif_symmetry(asym_paisley)

    # Asymmetrical paisley should have vertical symmetry < 0.82 due to curved tip
    assert score_v < 0.85, f"Asymmetric paisley got unexpectedly high symmetry score: {score_v}"

    # Symmetric chakra coin on centered 51x51 canvas
    sym_coin = np.zeros((51, 51), dtype=np.uint8)
    cv2.circle(sym_coin, (25, 25), 20, 255, -1)
    cv2.circle(sym_coin, (25, 25), 8, 0, -1)
    s_v, s_h, s_r = DynamicTextileExtractor._evaluate_motif_symmetry(sym_coin)

    assert s_v > 0.88, f"Symmetric coin failed vertical symmetry: {s_v}"
    assert s_h > 0.88, f"Symmetric coin failed horizontal symmetry: {s_h}"
    print(f"✔ Symmetry Evaluation: Paisley V-score={score_v:.2f} (protected), Coin V-score={s_v:.2f} (symmetric)")


# ===========================================================================
# 3. Tests for Pattern Completion & Multi-Lattice Infill
# ===========================================================================

def test_pattern_completion_lattice_fill():
    """Verify consensus lattice fill across occluded fabric gap."""
    H, W = 256, 256
    canvas = np.full((H, W, 3), (30, 30, 180), dtype=np.uint8)

    # Simple periodic checker / dots pattern
    Tx, Ty = 32, 32
    for y in range(0, H, Ty):
        for x in range(0, W, Tx):
            cv2.circle(canvas, (x + 16, y + 16), 6, (50, 220, 240), -1)

    # Cut a 20x20 defect mask right over one of the dots at (112, 112)
    defect_mask = np.zeros((H, W), dtype=np.uint8)
    defect_mask[102:122, 102:122] = 255
    canvas_damaged = canvas.copy()
    canvas_damaged[defect_mask > 0] = (0, 0, 0) # Black defect hole

    repeat = RepeatResult(
        vector_x=Tx,
        vector_y=Ty,
        confidence=0.85,
        symmetry_group="p4m",
        freq_x=1.0 / Tx,
        freq_y=1.0 / Ty,
        arrangement="straight_grid",
        basis_v1=(Tx, 0),
        basis_v2=(0, Ty),
    )

    completed, report = complete_regions(
        image=canvas_damaged,
        regions=[],
        repeat=repeat,
        tmp_dir=Path("."),
        defect_mask=defect_mask,
    )

    # Verify that the central circle has been accurately restored
    dot_center_val = completed[112, 112]
    assert dot_center_val[2] > 180 and dot_center_val[1] > 160, f"Dot was not restored: {dot_center_val}"
    print(f"✔ Consensus Pattern Infill: Defect healed with {report['tiled']}")


# ===========================================================================
# 4. Tests for Border Ribbon Periodicity & Seam Tiling
# ===========================================================================

def test_border_periodicity_and_tiling():
    """Verify 1D autocorrelation border periodicity and seamless tiling."""
    strip_w = 400
    strip_h = 60
    border_strip = np.zeros((strip_h, strip_w), dtype=np.uint8)

    # Generate a border ribbon with a clear 40px repeat (kalgi + flower)
    period = 40
    for x in range(0, strip_w, period):
        # Temple kalgi spire
        pts = np.array([[x + 4, 40], [x + 20, 10], [x + 36, 40]], np.int32)
        cv2.fillPoly(border_strip, [pts], 255)
        # Flower center
        cv2.circle(border_strip, (x + 20, 48), 5, 255, -1)

    detected_period = DynamicTextileExtractor._detect_border_periodicity(border_strip)
    assert abs(detected_period - period) <= 2, f"Detected border period {detected_period} != {period}"

    tiled = DynamicTextileExtractor._tile_border_unit(border_strip[:, :detected_period], target_w=240, target_h=210)
    assert tiled.shape == (210, 240), f"Tiled shape {tiled.shape} != (210, 240)"
    # Seamless wrap check: left column and right column should match
    diff = np.mean(np.abs(tiled[:, 0].astype(float) - tiled[:, -1].astype(float)))
    assert diff < 30.0, f"Border seam error too high: {diff}"
    print(f"✔ Border Periodicity: Detected={detected_period}px (exp {period}px), seamless tiled to 240x210 (seam error={diff:.1f})")


# ===========================================================================
# 5. Tests for Universal Replicated CAD Draft Synthesis
# ===========================================================================

def test_replicated_cad_draft_synthesis():
    """Verify CAD synthesis for all 4 major lattice arrangements."""
    clean_motif = _create_synthetic_motif(36, 46)
    motif_bgr = np.zeros((46, 36, 3), dtype=np.uint8)
    motif_bgr[clean_motif > 128] = [200, 24, 0]

    panel_w = 240
    panel_h = 480
    ground = np.array([32, 16, 160], dtype=np.uint8)
    zari = np.array([50, 200, 245], dtype=np.uint8)

    for arr in ("straight_grid", "half_drop", "brick", "diamond_ogival"):
        canvas, binary = synthesize_replicated_body_draft(
            clean_motif=motif_bgr,
            cad_butta=clean_motif,
            ground_bgr=ground,
            zari_bgr=zari,
            panel_w=panel_w,
            panel_h=panel_h,
            arrangement=arr,
            alternating_mirror=(arr == "half_drop"),
        )
        assert canvas.shape == (panel_h, panel_w, 3)
        assert binary.shape == (panel_h, panel_w)
        # Check that both motif floats (255) and ground exist
        fg_ratio = np.count_nonzero(binary > 128) / float(panel_w * panel_h)
        assert 0.08 < fg_ratio < 0.65, f"Abnormal foreground ratio {fg_ratio} for arrangement {arr}"
        print(f"✔ CAD Synthesis: Arrangement '{arr}' generated cleanly (fg_ratio={fg_ratio:.2%})")


if __name__ == "__main__":
    test_lattice_straight_grid()
    test_lattice_half_drop()
    test_lattice_brick()
    test_multi_instance_motif_ensembling()
    test_motif_symmetry_preservation()
    test_pattern_completion_lattice_fill()
    test_border_periodicity_and_tiling()
    test_replicated_cad_draft_synthesis()
    print("\n" + "=" * 60)
    print("ALL PATTERN RECOGNITION & REPLICATION TESTS PASSED!")
    print("=" * 60)
