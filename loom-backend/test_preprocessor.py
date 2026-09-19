from app.services.cv_engine import LoomPreprocessor
import numpy as np, cv2, os, pathlib

# 1️⃣ Synthetic image
img = np.full((100, 200, 3), [0, 255, 0], dtype=np.uint8)
temp_path = pathlib.Path('temp_demo.png')
cv2.imwrite(str(temp_path), img)

# 2️⃣ Perspective correction (perfect rectangle)
coords = [(0,0), (199,0), (199,99), (0,99)]
warped = LoomPreprocessor.apply_perspective_correction(str(temp_path), coords)
print('Warped shape:', warped.shape)

# 3️⃣ Quantize colors to 2
quant = LoomPreprocessor.quantize_colors(warped, color_count=2)
print('Unique colors after quantization:', np.unique(quant.reshape(-1,3), axis=0))

# 4️⃣ Export Jacquard BMP (target width 50)
out_path = 'jacquard_demo.bmp'
LoomPreprocessor.export_jacquard_bmp(quant, target_width=50, output_path=out_path)
print('BMP saved:', out_path, os.path.exists(out_path))
