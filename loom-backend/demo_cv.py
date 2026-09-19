import cv2
import numpy as np
import os
from pathlib import Path
from app.services.cv_engine import LoomPreprocessor

def main():
    """Demonstrate a single run of LoomPreprocessor.

    A synthetic image is created, saved to a temporary file, and then
    processed with dummy corner coordinates that map the entire image.
    The shape of the warped result is printed.
    """
    # Create a synthetic image (200x200 with a gradient)
    height, width = 200, 200
    synthetic = np.zeros((height, width, 3), dtype=np.uint8)
    cv2.rectangle(synthetic, (0, 0), (width - 1, height - 1), (0, 255, 0), -1)
    cv2.putText(synthetic, "Demo", (50, 110), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 0, 0), 2)

    # Save to a temporary file within the project directory
    temp_dir = Path(__file__).parent / "temp"
    temp_dir.mkdir(exist_ok=True)
    temp_path = temp_dir / "demo_image.png"
    cv2.imwrite(str(temp_path), synthetic)

    # Coordinates covering the full image (unordered to test ordering)
    coords = [
        (width - 1, height - 1),  # bottom-right
        (0, 0),                  # top-left
        (width - 1, 0),          # top-right
        (0, height - 1)          # bottom-left
    ]

    # Run the perspective correction once
    warped = LoomPreprocessor.apply_perspective_correction(str(temp_path), coords)
    print("Warped image shape:", warped.shape)

    # Cleanup (optional)
    # temp_path.unlink()

if __name__ == "__main__":
    main()
