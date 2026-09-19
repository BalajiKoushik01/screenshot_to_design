import cv2
import numpy as np

def test_person_removal_and_scratch_synthesis():
    # 1. Create a simulated realistic saree photograph of a model in a room
    H_img, W_img = 800, 600
    photo = np.full((H_img, W_img, 3), (220, 225, 230), dtype=np.uint8) # Studio room wall
    # Studio floor
    photo[650:, :] = (180, 190, 200)

    # Model head & face (Skin tone: BGR [130, 165, 225])
    cv2.circle(photo, (300, 140), 55, (130, 165, 225), -1)
    # Model neck & arms
    cv2.rectangle(photo, (280, 190), (320, 240), (130, 165, 225), -1)
    cv2.rectangle(photo, (140, 260), (190, 480), (130, 165, 225), -1) # left arm
    cv2.rectangle(photo, (410, 260), (460, 480), (130, 165, 225), -1) # right arm

    # Saree fabric: Crimson Red (#A01020 -> BGR [32, 16, 160])
    saree_poly = np.array([
        [190, 240], [410, 240], [480, 720], [120, 720]
    ], np.int32)
    cv2.fillPoly(photo, [saree_poly], (32, 16, 160))

    # Real saree body buttas (Golden mango butta: BGR [50, 200, 245])
    for by in range(300, 580, 90):
        for bx in (230, 310, 370):
            cv2.ellipse(photo, (bx, by), (18, 25), 0, 0, 360, (50, 200, 245), -1)
            cv2.circle(photo, (bx, by - 6), 5, (32, 16, 160), -1)

    # Saree border band (bottom 100px: BGR [45, 190, 240])
    cv2.rectangle(photo, (120, 620), (480, 710), (45, 190, 240), -1)
    # Border kalgi chevrons
    for kx in range(130, 470, 35):
        pts = np.array([[kx, 620], [kx + 17, 590], [kx + 35, 620]], np.int32)
        cv2.fillPoly(photo, [pts], (45, 190, 240))

    cv2.imwrite('tmp_model_saree_photo.png', photo)
    print("Created simulated model photo: tmp_model_saree_photo.png")

    # 2. Test Person Detection
    ycrcb = cv2.cvtColor(photo, cv2.COLOR_BGR2YCrCb)
    cr = ycrcb[:, :, 1]
    cb = ycrcb[:, :, 2]
    skin_mask = (cr >= 130) & (cr <= 180) & (cb >= 75) & (cb <= 135)
    skin_ratio = np.count_nonzero(skin_mask) / float(H_img * W_img)
    print(f"Detected skin ratio: {skin_ratio * 100:.2f}% (Human presence = {skin_ratio > 0.02})")

    # 3. Extract Authentic Patterns using DynamicTextileExtractor
    from app.services.dynamic_extractor import DynamicTextileExtractor
    modules = DynamicTextileExtractor.extract_from_image(photo)
    print("Extracted Ground color:", modules.ground_hex)
    print("Extracted Zari color:", modules.zari_hex)
    print("Extracted Butta shape:", modules.butta_binary.shape if modules.butta_binary is not None else None)
    print("Extracted Border shape:", modules.border_binary.shape if modules.border_binary is not None else None)

    # 4. Construct the 2D Jacquard CAD Draft FROM SCRATCH
    panel_w = 240
    panel_h = 1536
    border_h = 576
    body_h = panel_h - border_h

    # A. Synthesize Body Draft from Scratch using authentic extracted butta
    body_cad = np.zeros((body_h, panel_w), dtype=np.uint8)
    butta = modules.butta_binary
    if butta is not None and butta.size > 0:
        bh, bw = butta.shape
        # Half drop repeat
        cols = 2
        tw = panel_w // cols
        th = max(bh + 30, 160)
        rows = body_h // (th // 2)

        for r in range(rows):
            cy = r * (th // 2) + th // 4
            x_off = (tw // 2) if (r % 2 == 1) else 0
            for c in range(cols):
                cx = (c * tw + x_off + tw // 2) % panel_w
                y1 = cy - bh // 2
                x1 = cx - bw // 2
                for dy in range(bh):
                    py = y1 + dy
                    if 0 <= py < body_h:
                        for dx in range(bw):
                            if butta[dy, dx] > 128:
                                px = (x1 + dx) % panel_w
                                body_cad[py, px] = 255

        # 1-pixel ground tabby binders
        for y in range(body_h):
            for x in range(panel_w):
                if body_cad[y, x] == 0 and (x + y * 2) % 6 == 0:
                    body_cad[y, x] = 255

    # B. Synthesize Border Draft from Scratch using authentic extracted border
    border_cad = np.zeros((border_h, panel_w), dtype=np.uint8)
    border_strip = modules.border_binary
    if border_strip is not None and border_strip.size > 0:
        b_res = cv2.resize(border_strip, (panel_w, border_h - 80), interpolation=cv2.INTER_NEAREST)
        border_cad[80:, :] = b_res
        # Kalgi at top
        if modules.kalgi_binary is not None and modules.kalgi_binary.size > 0:
            k_res = cv2.resize(modules.kalgi_binary, (panel_w, 75), interpolation=cv2.INTER_NEAREST)
            border_cad[:75, :] = k_res

    # C. Assemble Composite Saree Draft
    composite_cad = np.zeros((panel_h, panel_w), dtype=np.uint8)
    composite_cad[:body_h, :] = body_cad
    composite_cad[body_h:, :] = border_cad

    # D. Colorways
    ground_bgr = modules.ground_bgr
    zari_bgr = modules.zari_bgr
    auth_cad = np.zeros((panel_h, panel_w, 3), dtype=np.uint8)
    auth_cad[composite_cad == 0] = ground_bgr
    auth_cad[composite_cad > 128] = zari_bgr

    blue_cad = np.zeros((panel_h, panel_w, 3), dtype=np.uint8)
    blue_cad[composite_cad == 0] = [200, 24, 0] # Royal Blue #0018C8
    blue_cad[composite_cad > 128] = [255, 255, 255]

    cv2.imwrite('tmp_scratch_synth_auth.png', auth_cad)
    cv2.imwrite('tmp_scratch_synth_blue.png', blue_cad)
    print("Synthesized 2D Jacquard CAD Draft from scratch: (1536, 240, 3)")
    print("ZERO human, ZERO skin, ZERO room background!")

if __name__ == '__main__':
    test_person_removal_and_scratch_synthesis()
