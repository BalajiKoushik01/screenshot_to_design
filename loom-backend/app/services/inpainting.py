import os
import base64
import json
import asyncio
from pathlib import Path
from typing import Optional
import httpx

class InpaintingService:
    """Service that calls an external inference API (Replicate or RunPod) to
    perform image inpainting.

    The workflow:
    1. Load the source image and mask from disk and encode them as base64.
    2. Send an asynchronous POST request to the inference endpoint with the
       required payload (including a prompt tailored for Indian textile motifs).
    3. Poll the returned ``prediction`` URL until the job reaches a terminal
       state (``succeeded`` or ``failed``).
    4. On success, download the generated image and write it to ``output_path``.
    5. Return the absolute path of the saved file.

    Configuration is resolved from environment variables:
    - ``INPAINT_API_TOKEN`` – Bearer token for the API (required).
    - ``INPAINT_API_URL`` – Base URL of the inference service. For Replicate the
      default is ``https://api.replicate.com/v1/predictions``; for RunPod a custom
      URL can be supplied.
    """

    def __init__(self) -> None:
        self.api_token: str = os.getenv("INPAINT_API_TOKEN")
        self.api_url: str = os.getenv(
            "INPAINT_API_URL", "https://api.replicate.com/v1/predictions"
        )
        if not self.api_token:
            raise RuntimeError("Environment variable INPAINT_API_TOKEN is required")
        self.headers = {
            "Authorization": f"Token {self.api_token}",
            "Content-Type": "application/json",
        }
        # Prompt optimized for traditional Indian textile patterns.
        self.prompt: str = (
            "seamless traditional Indian kanjeevaram silk zari motif, "
            "intricate geometric lattice pattern, high definition textile design"
        )

    @staticmethod
    def _file_to_base64(path: Path) -> str:
        """Read a file and return its base64 encoded string.
        """
        with path.open("rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")

    async def _post_prediction(self, payload: dict) -> dict:
        """Submit a new prediction request and return the parsed JSON response.
        """
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.api_url, headers=self.headers, json=payload, timeout=30.0
            )
            response.raise_for_status()
            return response.json()

    async def _poll_prediction(self, prediction_id: str) -> dict:
        """Poll the prediction endpoint until the status is terminal.

        Returns the final JSON payload.
        """
        poll_url = f"{self.api_url}/{prediction_id}"
        async with httpx.AsyncClient() as client:
            while True:
                resp = await client.get(poll_url, headers=self.headers)
                resp.raise_for_status()
                data = resp.json()
                status = data.get("status")
                if status in {"succeeded", "failed"}:
                    return data
                # Respect API recommended back‑off (default 2 seconds).
                await asyncio.sleep(2)

    async def _download_image(self, url: str, dest_path: Path) -> None:
        """Download the image from ``url`` and write it to ``dest_path``.
        """
        async with httpx.AsyncClient() as client:
            resp = await client.get(url)
            resp.raise_for_status()
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            dest_path.write_bytes(resp.content)

    async def inpaint(
        self,
        image_path: str,
        mask_path: str,
        output_path: Optional[str] = None,
    ) -> str:
        """Run the inpainting pipeline.

        Args:
            image_path: Path to the raw screenshot (RGB image).
            mask_path: Path to the binary mask where white pixels denote the
                region to be replaced.
            output_path: Desired location for the generated image. If omitted,
                the result is saved alongside the source image with a ``_inpainted``
                suffix.

        Returns:
            Absolute path to the saved inpainted image.
        """
        image_path = Path(image_path).resolve()
        mask_path = Path(mask_path).resolve()
        if not image_path.is_file():
            raise FileNotFoundError(f"Image file not found: {image_path}")
        if not mask_path.is_file():
            raise FileNotFoundError(f"Mask file not found: {mask_path}")

        # Encode inputs
        image_b64 = self._file_to_base64(image_path)
        mask_b64 = self._file_to_base64(mask_path)

        # Build payload – this follows Replicate's stable‑diffusion‑xl‑inpainting
        # schema. Adjust keys if using a different provider.
        payload = {
            "version": "c7e6dfab81c7c0b1e6eb1c8cfb1e8a5e0f1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d",  # placeholder version hash
            "input": {
                "prompt": self.prompt,
                "image": f"data:image/png;base64,{image_b64}",
                "mask": f"data:image/png;base64,{mask_b64}",
                "num_inference_steps": 50,
                "guidance_scale": 7.5,
            },
        }

        # Submit prediction request
        prediction = await self._post_prediction(payload)
        prediction_id = prediction.get("id")
        if not prediction_id:
            raise RuntimeError("Failed to obtain prediction ID from the API response")

        # Poll until complete
        final_result = await self._poll_prediction(prediction_id)
        if final_result.get("status") != "succeeded":
            raise RuntimeError(f"Inpainting failed: {final_result.get('error')}" )

        # Expected output structure: {"output": ["https://.../generated.png"]}
        outputs = final_result.get("output")
        if not outputs:
            raise RuntimeError("API returned no output image URL")
        image_url = outputs[0] if isinstance(outputs, list) else outputs.get("image")
        if not image_url:
            raise RuntimeError("Could not locate generated image URL in API response")

        # Determine destination path
        if output_path is None:
            dest_path = image_path.parent / f"{image_path.stem}_inpainted{image_path.suffix}"
        else:
            dest_path = Path(output_path).resolve()

        await self._download_image(image_url, dest_path)
        return str(dest_path)

# Example usage (to be executed in an async context):
#
# async def main():
#     service = InpaintingService()
#     result_path = await service.inpaint(
#         "./tmp/source.png",
#         "./tmp/mask.png",
#         "./tmp/result.png",
#     )
#     print("Inpainted image saved to", result_path)
#
# asyncio.run(main())
