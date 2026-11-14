"""Reproducible regression benchmark, not a claim about arbitrary saree photographs.
Run from loom-backend: PYTHONPATH=. python scripts/benchmark_indexed.py
"""
import base64
import io
import json
from pathlib import Path
from time import perf_counter
import numpy as np
from PIL import Image
from app.services.indexed_design import extract

rows = []
for path in sorted((Path(__file__).resolve().parents[2] / 'sample output').glob('*.[Bb][Mm][Pp]')):
    with Image.open(path) as im:
        original = im.convert('RGB')
        expected = np.asarray(original)
        w, h = im.size
        # Simulate a 2x CAD screenshot surrounded by application chrome.
        screen = Image.new('RGB', (w * 2 + 40, h * 2 + 60), (40, 43, 48))
        screen.paste(original.resize((w * 2, h * 2), Image.Resampling.NEAREST), (20, 30))
        for fmt, mode in [('PNG', 'preserve'), ('JPEG', 'reduce')]:
            output = io.BytesIO()
            screen.save(output, format=fmt, **({'quality': 85} if fmt == 'JPEG' else {}))
            start = perf_counter()
            result = extract(output.getvalue(), {'width': w, 'height': h, 'mode': mode,
                'colors': len(original.getcolors(256) or []) or 16,
                'corners': [[20, 30], [20 + w * 2 - 1, 30], [20 + w * 2 - 1, 30 + h * 2 - 1], [20, 30 + h * 2 - 1]]})
            indices = np.frombuffer(base64.b64decode(result['indices']), dtype='uint8').reshape(h, w)
            actual = np.asarray(result['palette'], dtype='uint8')[indices]
            rows.append({'sample': path.name, 'case': fmt, 'width': w, 'height': h,
                         'rgb_exact_pixel_percent': round(float(np.all(expected == actual, axis=2).mean() * 100), 4),
                         'rgb_mae': round(float(np.abs(expected.astype('int16') - actual.astype('int16')).mean()), 4),
                         'seconds': round(perf_counter() - start, 3)})
print(json.dumps({'description': 'Known-grid 2x screenshot with UI margin; JPEG quality 85 is intentionally lossy.', 'results': rows}, indent=2))
if any(r['rgb_exact_pixel_percent'] != 100 for r in rows if r['case'] == 'PNG'):
    raise SystemExit('Lossless screenshot regression')
