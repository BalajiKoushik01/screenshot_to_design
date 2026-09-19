import cv2
import numpy as np
import glob, os

def classify_layout(image: np.ndarray, filename: str = "", repeat_conf: float = 0.0, repeat_arr: str = "") -> str:
    fn_lower = os.path.basename(filename).lower()
    
    # 1. Filename explicit hints
    if "broket" in fn_lower or "brocade" in fn_lower or "jaal" in fn_lower:
        return "all_over_brocade"
    if "boder" in fn_lower or "border" in fn_lower:
        if "body" in fn_lower:
            return "single_border_and_body"
        return "border_only"
    if "motif" in fn_lower or "butta" in fn_lower:
        return "isolated_motif"

    h, w = image.shape[:2]

    # 2. Check for isolated motif
    # A single motif typically has aspect ratio between 0.5 and 2.0 and a single dominant contour
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    perim = np.concatenate([gray[0, :], gray[-1, :], gray[:, 0], gray[:, -1]])
    bg_val = float(np.median(perim))
    diff = np.abs(gray.astype(float) - bg_val)
    fg_mask = (diff > 25).astype(np.uint8)
    
    cnts, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if cnts and repeat_conf < 0.3:
        areas = [cv2.contourArea(c) for c in cnts if cv2.contourArea(c) > 100]
        if len(areas) == 1 and 0.05 < (areas[0] / (h * w)) < 0.75:
            return "isolated_motif"

    # 3. Check for border vs all-over brocade vs single border and body
    # Analyze variance / edge profile along vertical axis (split into 4 bands)
    edges = cv2.Canny(gray, 50, 150)
    band_h = h // 4
    band_densities = [np.mean(edges[i*band_h:(i+1)*band_h, :]) for i in range(4)]
    
    # In saree with bottom border, bottom band is significantly denser or distinct from upper body
    bottom_vs_top = band_densities[3] / max(1.0, band_densities[0])
    if bottom_vs_top > 2.0 and band_densities[3] > 15:
        return "single_border_and_body"
    elif repeat_arr in ("all_over_jaal", "running_stripe") or (band_densities[3] > 20 and band_densities[0] > 20):
        return "all_over_brocade"
        
    return "single_border_and_body"

# Test on sample output files
for p in sorted(glob.glob('../sample output/*')):
    img = cv2.imread(p)
    if img is not None:
        layout = classify_layout(img, filename=p)
        print(f"{os.path.basename(p):<45} -> {layout}")
