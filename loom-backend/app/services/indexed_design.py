"""Faithful raster extraction. Palette indices, not rendered RGB, are the master data."""
from __future__ import annotations

import base64
import hashlib
import io
import math
import warnings

import cv2
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_INPUT_PIXELS = 24_000_000
MAX_PIXELS = 4_000_000
MAX_BYTES = 20 * 1024 * 1024


def dimensions(width, height):
    if any(type(v) is not int or not 1 <= v <= 16384 for v in (width, height)):
        raise ValueError("Dimensions must be integers from 1 to 16384")
    if width * height > MAX_PIXELS:
        raise ValueError("Design exceeds four million pixels; extract one panel or repeat at a time")


def decode_image(data: bytes) -> Image.Image:
    if not data or len(data) > MAX_BYTES:
        raise ValueError("Supply an image of at most 20 MB")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as opened:
                if opened.format not in {"PNG", "JPEG", "BMP", "TIFF", "WEBP"}:
                    raise ValueError("Use PNG, JPEG, BMP, TIFF or WebP")
                if opened.width * opened.height > MAX_INPUT_PIXELS:
                    raise ValueError("Source exceeds 24 million pixels")
                if getattr(opened, "n_frames", 1) != 1:
                    raise ValueError("Choose a single-frame image")
                opened.load()
                image = ImageOps.exif_transpose(opened).copy()
                if "A" in image.getbands() or "transparency" in image.info:
                    rgba = image.convert("RGBA")
                    if rgba.getchannel("A").getextrema() != (255, 255):
                        raise ValueError("Flatten transparent pixels onto your chosen ground color first")
                return image
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError,
            Image.DecompressionBombWarning) as exc:
        raise ValueError("Image is corrupt, unsupported or too large") from exc


def extract(data: bytes, options: dict) -> dict:
    """Crop/rectify with explicit coordinates, then preserve or reduce the palette.

    Corners use pixel centres in TL, TR, BR, BL order. No synthetic motifs,
    denoising, dilation, float binding or invented pixels are silently applied.
    """
    if not isinstance(options, dict):
        raise ValueError("Options must be a JSON object")
    mode = options.get("mode", "preserve")
    if mode not in {"preserve", "reduce"}:
        raise ValueError("Mode must be preserve or reduce")
    colors = options.get("colors", 16)
    if type(colors) is not int or not 2 <= colors <= 256:
        raise ValueError("Color count must be an integer from 2 to 256")
    source = decode_image(data)
    width, height = options.get("width", source.width), options.get("height", source.height)
    dimensions(width, height)
    corners = options.get("corners")
    notes = []
    indexed = source.mode == "P" and mode == "preserve"
    array = np.asarray(source if indexed else source.convert("RGB"))
    if corners is not None:
        if (not isinstance(corners, list) or len(corners) != 4 or any(
            not isinstance(p, list) or len(p) != 2 or any(
                type(v) not in (int, float) or not math.isfinite(v) for v in p
            ) for p in corners
        )):
            raise ValueError("Select four finite corners in TL, TR, BR, BL order")
        points = np.asarray(corners, dtype=np.float32)
        if np.any(points < 0) or np.any(points[:, 0] > source.width - 1) or np.any(points[:, 1] > source.height - 1):
            raise ValueError("Corners must lie inside the source image")
        contour = points.reshape(-1, 1, 2)
        if not cv2.isContourConvex(contour) or cv2.contourArea(contour, oriented=True) < 1:
            raise ValueError("Corners must form a clockwise, non-crossing quadrilateral")
        if width < 2 or height < 2:
            raise ValueError("Perspective extraction requires at least two rows and columns")
        target = np.float32([[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]])
        matrix = cv2.getPerspectiveTransform(points, target)
        array = cv2.warpPerspective(array, matrix, (width, height), flags=cv2.INTER_NEAREST,
                                    borderMode=cv2.BORDER_REPLICATE)
        notes.append("Perspective resampling changes geometry; review thin lines at pixel zoom.")
    elif (width, height) != source.size:
        array = cv2.resize(array, (width, height), interpolation=cv2.INTER_NEAREST_EXACT)
        notes.append("Dimensions changed using nearest-neighbor sampling; no lost detail is recovered.")

    if indexed:
        indices = array.astype(np.uint8)
        flat_palette = source.getpalette("RGB") or []
        flat_palette += [0] * (768 - len(flat_palette))
        palette = np.array(flat_palette[:768], dtype=np.uint8).reshape(256, 3)
        notes.append("Original palette slots and pixel indices preserved, including duplicate colors.")
    elif mode == "preserve":
        palette, inverse = np.unique(array.reshape(-1, 3), axis=0, return_inverse=True)
        if len(palette) > 256:
            raise ValueError("More than 256 source colors. Use Reduce colors and review the result; exact color preservation is impossible in 8-bit BMP.")
        indices = inverse.reshape(height, width).astype(np.uint8)
    else:
        reduced = Image.fromarray(array).quantize(colors=colors, method=Image.Quantize.MEDIANCUT,
                                                   dither=Image.Dither.NONE)
        indices = np.asarray(reduced).copy()
        palette = np.array(reduced.getpalette()[:colors * 3], dtype=np.uint8).reshape(-1, 3)
        notes.append("Colors were reduced without dithering; check small zari and meena details.")

    rendered = palette[indices]
    reference = np.asarray(source.convert("RGB")) if indexed and corners is None and source.size == (width, height) else None
    if not indexed:
        reference = array
    mae = float(np.abs(rendered.astype(np.int16) - reference.astype(np.int16)).mean()) if reference is not None else None
    exact = bool(np.array_equal(rendered, reference)) if reference is not None else None
    return {
        "schema": "weavecore.indexed.v1", "width": width, "height": height,
        "palette": palette.tolist(), "indices": base64.b64encode(indices.tobytes()).decode(),
        "names": [f"Color {i}" for i in range(len(palette))], "regions": [],
        "provenance": {"source_sha256": hashlib.sha256(data).hexdigest(),
                       "source_size": list(source.size), "mode": mode, "corners": corners,
                       "output_size": [width, height]},
        "report": {"used_colors": int(len(np.unique(indices))), "rgb_mae": mae,
                   "exact_sampled_rgb": exact, "notes": notes + [
                       "This is a color-area design, not a validated loom controller program."]},
    }
