import cv2
import numpy as np
from typing import List, Tuple

class LoomPreprocessor:
    """Utility class for image preprocessing specific to the Loom project.

    Currently provides perspective correction for a user‑pinned region.
    """

    @staticmethod
    def _order_clockwise(coords: List[Tuple[float, float]]) -> np.ndarray:
        """Arrange four corner points in clockwise order starting at top‑left.

        The input is a list of four (x, y) tuples. The algorithm works by:
        1. Converting to a NumPy array.
        2. Summing x + y to find the top‑left (smallest) and bottom‑right (largest).
        3. Computing the difference x - y to find top‑right (smallest) and
           bottom‑left (largest).
        Returns a ``(4, 2)`` NumPy array ordered as TL, TR, BR, BL.
        """
        pts = np.array(coords, dtype="float32")
        if pts.shape != (4, 2):
            raise ValueError("Exactly four coordinate pairs are required.")
        # Sum and diff for ordering
        s = pts.sum(axis=1)
        diff = np.diff(pts, axis=1).flatten()
        ordered = np.zeros((4, 2), dtype="float32")
        ordered[0] = pts[np.argmin(s)]          # top‑left
        ordered[2] = pts[np.argmax(s)]          # bottom‑right
        ordered[1] = pts[np.argmin(diff)]       # top‑right
        ordered[3] = pts[np.argmax(diff)]       # bottom‑left
        return ordered

    @staticmethod
    def apply_perspective_correction(image_path: str, coordinates: List[Tuple[float, float]]) -> np.ndarray:
        """Flatten and crop the region defined by ``coordinates``.

        Parameters
        ----------
        image_path: str
            Path to the input image file.
        coordinates: list of 4 (x, y) tuples
            User‑pinned corner points (may be unordered).

        Returns
        -------
        np.ndarray
            The warped image region as a NumPy array (BGR format).
        """
        # Load image
        image = cv2.imread(image_path)
        if image is None:
            raise FileNotFoundError(f"Image not found at path: {image_path}")

        # Order points clockwise (TL, TR, BR, BL)
        src_pts = LoomPreprocessor._order_clockwise(coordinates)

        # Compute width and height of the new rectangle
        widthA = np.linalg.norm(src_pts[2] - src_pts[3])  # bottom width
        widthB = np.linalg.norm(src_pts[1] - src_pts[0])  # top width
        maxWidth = int(max(widthA, widthB))

        heightA = np.linalg.norm(src_pts[1] - src_pts[2])  # right height
        heightB = np.linalg.norm(src_pts[0] - src_pts[3])  # left height
        maxHeight = int(max(heightA, heightB))

        # Destination points for a straight rectangle
        dst_pts = np.array([
            [0, 0],
            [maxWidth - 1, 0],
            [maxWidth - 1, maxHeight - 1],
            [0, maxHeight - 1]
        ], dtype="float32")

        # Compute perspective transform matrix and warp
        M = cv2.getPerspectiveTransform(src_pts, dst_pts)
        warped = cv2.warpPerspective(image, M, (maxWidth, maxHeight))
        return warped
    @staticmethod
    def export_jacquard_bmp(quantized_matrix: np.ndarray, target_width: int, output_path: str) -> str:
        """
        Export a color‑quantized image as an 8‑bit indexed BMP suitable for Jacquard looms.

        The image is resized to ``target_width`` (hooks) using nearest‑neighbor interpolation
        to preserve exact color values, then saved as a BMP with an explicit palette.
        """
        # Ensure input is uint8
        if quantized_matrix.dtype != np.uint8:
            quantized_matrix = quantized_matrix.astype(np.uint8)

        # Convert OpenCV BGR to standard RGB for accurate Pillow palette mapping
        if quantized_matrix.ndim == 3 and quantized_matrix.shape[2] == 3:
            rgb_matrix = cv2.cvtColor(quantized_matrix, cv2.COLOR_BGR2RGB)
        else:
            rgb_matrix = quantized_matrix

        # Original dimensions
        orig_h, orig_w = rgb_matrix.shape[:2]
        if orig_w == 0:
            raise ValueError("Input image width cannot be zero.")
        # Compute proportional height
        scale = target_width / orig_w
        target_height = int(round(orig_h * scale))

        # Resize with nearest‑neighbor interpolation (preserves hook boundaries without blurring)
        resized = cv2.resize(rgb_matrix, (target_width, target_height), interpolation=cv2.INTER_NEAREST)

        # Build palette from unique colors (max 256)
        flat = resized.reshape(-1, 3)
        unique_colors = np.unique(flat, axis=0)
        if unique_colors.shape[0] > 256:
            raise ValueError("More than 256 unique colors; cannot create 8‑bit indexed BMP.")

        # Prepare palette array (256 * 3 values in RGB)
        palette = np.zeros((256, 3), dtype=np.uint8)
        palette[: unique_colors.shape[0]] = unique_colors

        # Map each pixel to its palette index
        color_to_idx = {tuple(color): idx for idx, color in enumerate(unique_colors)}
        indices = np.array([color_to_idx[tuple(px)] for px in flat], dtype=np.uint8)
        indexed_image = indices.reshape(resized.shape[:2])

        # Create Pillow image in palette mode and attach RGB palette
        from PIL import Image
        img = Image.fromarray(indexed_image, mode="P")
        img.putpalette(palette.flatten())
        # Save as BMP (8‑bit indexed)
        img.save(output_path, format="BMP")
        return output_path

    @staticmethod
    def quantize_colors(image_matrix: np.ndarray, color_count: int) -> np.ndarray:
        """Adaptive textile color quantization designed for Jacquard CAD replication.

        Separates chromatic ground/meena yarns from achromatic (white/cream/silver/zari)
        yarns, preventing dominant color shadow variance from cannibalizing pattern clusters.
        Clustering in CIE Lab space ensures perceptually uniform distances.
        """
        orig_shape = image_matrix.shape
        if image_matrix.dtype != np.uint8:
            image_matrix = image_matrix.astype(np.uint8)

        color_count = max(2, min(int(color_count), 256))
        hsv = cv2.cvtColor(image_matrix, cv2.COLOR_BGR2HSV)
        s = hsv[:, :, 1]

        # Check if saturated chromatic ground exists (e.g. Royal Blue, Crimson Red, Silk dyes)
        sat_mask = (s > 55)
        total_px = image_matrix.shape[0] * image_matrix.shape[1]

        if sat_mask.sum() > 0.08 * total_px and (~sat_mask).sum() > 0.05 * total_px and color_count >= 2:
            # Chromatic yarns (silk base ground)
            chroma_pixels = image_matrix[sat_mask].reshape(-1, 3).astype(np.float32)
            k_chroma = max(1, color_count - 2 if color_count > 2 else 1)
            crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 25, 0.5)
            _, _, centers_c = cv2.kmeans(chroma_pixels, k_chroma, None, crit, 10, cv2.KMEANS_PP_CENTERS)

            # Achromatic yarns (white, cream, metallic zari, light silver floats)
            achroma_pixels = image_matrix[~sat_mask].reshape(-1, 3).astype(np.float32)
            k_achroma = max(1, color_count - k_chroma)
            _, _, centers_a = cv2.kmeans(achroma_pixels, k_achroma, None, crit, 10, cv2.KMEANS_PP_CENTERS)

            all_centers = np.vstack([centers_c, centers_a])
        else:
            # Uniform Lab clustering
            lab = cv2.cvtColor(image_matrix, cv2.COLOR_BGR2LAB)
            flat = lab.reshape(-1, 3).astype(np.float32)
            crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 25, 0.5)
            _, _, centers_lab = cv2.kmeans(flat, color_count, None, crit, 10, cv2.KMEANS_PP_CENTERS)
            all_centers = cv2.cvtColor(centers_lab.reshape(1, -1, 3).astype(np.uint8), cv2.COLOR_LAB2BGR).reshape(-1, 3).astype(np.float32)

        # Assign each pixel in CIE Lab space to the closest centroid
        lab_img = cv2.cvtColor(image_matrix, cv2.COLOR_BGR2LAB)
        lab_centers = cv2.cvtColor(all_centers.reshape(1, -1, 3).astype(np.uint8), cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32)

        flat_lab = lab_img.reshape(-1, 3).astype(np.float32)
        dists = np.linalg.norm(flat_lab[:, None, :] - lab_centers[None, :, :], axis=-1)
        best_idx = np.argmin(dists, axis=-1)

        quantized = all_centers[best_idx].reshape(orig_shape)
        return quantized.astype(np.uint8)

