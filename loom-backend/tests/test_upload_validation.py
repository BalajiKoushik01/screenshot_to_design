import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).resolve().parents[1] / "app" / "core" / "upload_validation.py"
spec = importlib.util.spec_from_file_location("upload_validation", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class UploadValidationTests(unittest.TestCase):
    def test_good_json(self):
        self.assertEqual(module.parse_pattern_parameters("[[0,0],[1,0],[1,1],[0,1]]", 8, 1024)[2], [1, 1])

    def test_legacy_tuple_input(self):
        self.assertEqual(len(module.parse_pattern_parameters("[(0,0),(1,0),(1,1),(0,1)]", 2, 16)), 4)

    def test_bad_inputs(self):
        for points, colors, width in [
            ("[[NaN,0],[1,0],[1,1],[0,1]]", 2, 16),
            ("[[true,0],[1,0],[1,1],[0,1]]", 2, 16),
            ("[[0,0]]", 2, 16),
            ("[[0,0],[1,0],[1,1],[0,1]]", 1, 16),
            ("[[0,0],[1,0],[1,1],[0,1]]", 2, 20001),
            (" " * 2049, 2, 16),
        ]:
            with self.subTest(points=points[:15], colors=colors, width=width):
                with self.assertRaises(ValueError):
                    module.parse_pattern_parameters(points, colors, width)


if __name__ == "__main__":
    unittest.main()
