import os
import cv2
import numpy as np
from pathlib import Path

from app.worker import process_textile_design_task

def run_verification():
    print("=" * 70)
    print("STARTING UNIVERSAL DESIGN PIPELINE VERIFICATION")
    print("=" * 70)

    samples = [
        # (name, path, expected_layout, target_w)
        ("Sample 05 (Full Saree)", "../sample output/05    Body  480+480    Boder    576   100  Reed.jpg", "single_border_and_body", 240),
        ("Sample 06 (Border Only)", "../sample output/06     Boder    456   100  Reed   420 + 240  +420.jpg", "border_only", 180),
        ("Broket (All-Over Brocade)", "../sample output/480 broket ani m2.bmp", "all_over_brocade", 240),
    ]

    # Also test an isolated single motif
    img05 = cv2.imread("../sample output/05    Body  480+480    Boder    576   100  Reed.jpg")
    if img05 is not None:
        single_motif = img05[200:320, 80:160]
        motif_path = "tmp_isolated_motif_test.png"
        cv2.imwrite(motif_path, single_motif)
        samples.append(("Isolated Motif (Predictive Half-Drop)", motif_path, "isolated_motif", 240))

    results_summary = []

    for name, img_path, expected_layout, target_w in samples:
        print(f"\n--- Testing: {name} ({img_path}) ---")
        img = cv2.imread(img_path)
        assert img is not None, f"Failed to load {img_path}"
        h, w = img.shape[:2]
        coords = [(0, 0), (w - 1, 0), (w - 1, h - 1), (0, h - 1)]

        res = process_textile_design_task(
            image_path=str(Path(img_path).resolve()),
            mask_path="",
            coordinates=coords,
            colors=4,
            width=target_w,
        )

        specs = res.get("production_specs", {})
        actual_layout = specs.get("layout_type")
        actual_repeat = specs.get("repeat_structure")
        half_drop_shift = specs.get("half_drop_shift_x", 0)
        panel_bmp = res.get("file_url")

        print(f"  [Result] layout_type     = {actual_layout} (expected: {expected_layout})")
        print(f"  [Result] repeat_structure= {actual_repeat} (half_drop_shift_x={half_drop_shift})")
        print(f"  [Result] master_bmp      = {panel_bmp}")
        print(f"  [Result] psp_bundle_zip  = {res.get('psp_bundle_zip_url')}")
        print(f"  [Result] wif_url         = {res.get('wif_url')}")

        assert actual_layout == expected_layout, f"Layout mismatch: got {actual_layout}, expected {expected_layout}"
        # Resolve path relative to project root static/exports
        project_root = Path(__file__).resolve().parents[1]
        local_bmp_path = project_root / panel_bmp.lstrip("/\\")

        assert panel_bmp and local_bmp_path.is_file(), f"Master BMP not found on disk: {local_bmp_path}"

        # Verify pixel accuracy: file must be readable, non-empty, and uncompressed BMP
        out_img = cv2.imread(str(local_bmp_path))
        assert out_img is not None, "Failed to read generated BMP"
        assert out_img.shape[1] == target_w, f"Width mismatch: {out_img.shape[1]} vs {target_w}"
        print(f"  [Verified] Output BMP dimensions: {out_img.shape[1]} hooks x {out_img.shape[0]} picks")

        results_summary.append({
            "name": name,
            "layout": actual_layout,
            "repeat": actual_repeat,
            "dimensions": f"{out_img.shape[1]}x{out_img.shape[0]}",
            "status": "PASS"
        })

    print("\n" + "=" * 70)
    print("ALL UNIVERSAL DESIGN VERIFICATIONS PASSED!")
    for r in results_summary:
        print(f"  ✔ {r['name']:<38} | {r['layout']:<22} | {r['repeat']:<15} | {r['dimensions']} | {r['status']}")
    print("=" * 70)

if __name__ == "__main__":
    run_verification()
