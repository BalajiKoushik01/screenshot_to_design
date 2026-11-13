"""Pure validation for image-to-pattern form inputs."""
import ast
import json
import math


def parse_pattern_parameters(coordinates: str, color_count: int, target_width: int):
    if not isinstance(coordinates, str) or len(coordinates) > 2048:
        raise ValueError("coordinates must be four numeric [x, y] points")
    try:
        points = json.loads(coordinates)
    except (json.JSONDecodeError, ValueError):
        try:
            points = ast.literal_eval(coordinates)
        except (SyntaxError, ValueError, TypeError, MemoryError) as exc:
            raise ValueError("coordinates must be a valid list of four points") from exc
    if (
        not isinstance(points, list) or len(points) != 4
        or any(
            not isinstance(point, (list, tuple)) or len(point) != 2
            or any(
                isinstance(value, bool) or not isinstance(value, (int, float))
                or not math.isfinite(value)
                for value in point
            )
            for point in points
        )
    ):
        raise ValueError("coordinates must be four finite numeric [x, y] points")
    if isinstance(color_count, bool) or not isinstance(color_count, int) or not 2 <= color_count <= 256:
        raise ValueError("color_count must be between 2 and 256")
    if isinstance(target_width, bool) or not isinstance(target_width, int) or not 16 <= target_width <= 20000:
        raise ValueError("target_width must be between 16 and 20000")
    return points
