import base64
import io
import unittest
from pathlib import Path
import numpy as np
from PIL import Image
from fastapi.testclient import TestClient
from app.studio_main import app
from app.services.indexed_design import extract, decode_image


def encoded(image, fmt='PNG'):
    output = io.BytesIO()
    image.save(output, format=fmt)
    return output.getvalue()


def pixels(result):
    return np.frombuffer(base64.b64decode(result['indices']), dtype=np.uint8).reshape(result['height'], result['width'])


class IndexedDesignTests(unittest.TestCase):
    def setUp(self):
        self.rgb = np.zeros((6, 7, 3), dtype=np.uint8)
        self.rgb[:] = [120, 20, 60]
        self.rgb[1:5, 2:4] = [255, 210, 70]
        self.rgb[2, 3] = [0, 140, 50]
        self.data = encoded(Image.fromarray(self.rgb))

    def test_rgb_pixels_exact(self):
        result = extract(self.data, {})
        np.testing.assert_array_equal(np.asarray(result['palette'])[pixels(result)], self.rgb)
        self.assertTrue(result['report']['exact_sampled_rgb'])
        self.assertEqual(result['report']['rgb_mae'], 0)

    def test_duplicate_palette_slots_survive(self):
        im = Image.new('P', (3, 2))
        palette = [0] * 768
        palette[3:6] = palette[9:12] = [230, 170, 40]
        im.putpalette(palette)
        im.putdata([1, 3, 0, 3, 1, 3])
        result = extract(encoded(im, 'BMP'), {})
        self.assertEqual(pixels(result).flatten().tolist(), [1, 3, 0, 3, 1, 3])
        self.assertEqual(result['palette'][1], result['palette'][3])

    def test_full_frame_perspective_no_off_by_one(self):
        result = extract(self.data, {'corners': [[0, 0], [6, 0], [6, 5], [0, 5]], 'width': 7, 'height': 6})
        np.testing.assert_array_equal(np.asarray(result['palette'])[pixels(result)], self.rgb)

    def test_crop_exact(self):
        result = extract(self.data, {'corners': [[2, 1], [3, 1], [3, 4], [2, 4]], 'width': 2, 'height': 4})
        np.testing.assert_array_equal(np.asarray(result['palette'])[pixels(result)], self.rgb[1:5, 2:4])

    def test_invalid_geometry(self):
        for corners in [[[0, 0]] * 4, [[0, 0], [6, 5], [6, 0], [0, 5]], [[-1, 0], [6, 0], [6, 5], [0, 5]], [[0, 0], [0, 5], [6, 5], [6, 0]], [[0, 0], [6, 0], [6, float('nan')], [0, 5]]]:
            with self.subTest(corners=corners), self.assertRaises(ValueError): extract(self.data, {'corners': corners})

    def test_dimensions_and_options_rejected(self):
        for options in [{'width': 0}, {'width': True}, {'width': 16385}, {'width': 4000, 'height': 4000}, {'colors': 257}, {'mode': 'invent'}, [], {'corners': 'wrong'}]:
            with self.subTest(options=options), self.assertRaises(ValueError): extract(self.data, options)

    def test_reduction_explicit_deterministic(self):
        data = encoded(Image.fromarray(np.random.default_rng(4).integers(0, 256, (20, 20, 3), dtype='uint8')))
        with self.assertRaises(ValueError): extract(data, {'mode': 'preserve'})
        a = extract(data, {'mode': 'reduce', 'colors': 4})
        b = extract(data, {'mode': 'reduce', 'colors': 4})
        self.assertEqual(a, b)
        self.assertLessEqual(len(np.unique(pixels(a))), 4)
        self.assertFalse(a['report']['exact_sampled_rgb'])

    def test_transparency_corrupt_input_rejected(self):
        for data in [b'not an image', b'', encoded(Image.new('RGBA', (2, 2), (0, 0, 0, 0)))]:
            with self.assertRaises(ValueError): decode_image(data)

    def test_nearest_resize_preserves_line(self):
        r = extract(self.data, {'width': 14, 'height': 12})
        np.testing.assert_array_equal(np.asarray(r['palette'])[pixels(r)], np.repeat(np.repeat(self.rgb, 2, axis=0), 2, axis=1))

    def test_api_upload_validation(self):
        client = TestClient(app)
        response = client.post('/api/studio/extract', files={'image': ('design.png', self.data)}, data={'options': '{}'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['schema'], 'weavecore.indexed.v1')
        for options in ['{', '[]', '{"width":false}']:
            self.assertEqual(client.post('/api/studio/extract', files={'image': ('design.png', self.data)}, data={'options': options}).status_code, 422)
        self.assertEqual(client.post('/api/studio/extract', files={'image': ('lie.png', b'bad')}).status_code, 422)
        self.assertEqual(client.get('/api/health').status_code, 200)

    def test_repository_bmp_samples_keep_rgb_indices(self):
        paths = list((Path(__file__).resolve().parents[2] / 'sample output').glob('*.[Bb][Mm][Pp]'))
        self.assertGreater(len(paths), 0)
        for path in paths:
            with self.subTest(path=path.name):
                data = path.read_bytes()
                source = decode_image(data)
                r = extract(data, {})
                np.testing.assert_array_equal(np.asarray(r['palette'])[pixels(r)], np.asarray(source.convert('RGB')))
                if source.mode == 'P': np.testing.assert_array_equal(pixels(r), np.asarray(source))


if __name__ == '__main__': unittest.main()
