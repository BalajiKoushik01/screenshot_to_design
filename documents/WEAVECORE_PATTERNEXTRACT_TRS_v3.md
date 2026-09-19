---
document: Technical Requirements Specification (TRS) — v3
project: WeaveCore Pattern Extraction Engine (WPEE)
version: 3.0
supersedes: WEAVECORE_PATTERNEXTRACT_TRS_v2.md
companion_docs: [PRD_v3.md, SPEC_v3.md, ML_STRATEGY_v1.md (Phase 2/Future)]
---

# WPEE — Technical Requirements Specification (v3)

## 1. What Changed From v2
FR-2 and FR-3 (train and run a custom restoration network) are removed from this build's scope
and replaced with pretrained-model requirements. TR-1 through TR-4 (training requirements) move
to Phase 2 and are no longer part of this document's active requirements — see
`ML_STRATEGY_v1.md`, now marked Phase 2/Future.

## 2. Existing Requirements (verify, do not rebuild) — unchanged from v2 §2

| ID | Requirement | Existing Implementation |
|----|-------------|---------------------------|
| ER-1 | Accept image upload, store to `tmp/`, enqueue async job | `app/api/v1/endpoints.py` `POST /designs/upload` |
| ER-2 | Return job status/result via polling | `GET /designs/status/{task_id}` |
| ER-3 | 4-point perspective deskew | `LoomPreprocessor.apply_perspective_correction` |
| ER-4 | Colour quantization to N clusters | `LoomPreprocessor.quantize_colors` (currently RGB — see NR-3) |
| ER-5 | Nearest-neighbour rescale to loom hook width | `LoomPreprocessor.export_jacquard_bmp` |
| ER-6 | Single 8-bit indexed BMP export | `LoomPreprocessor.export_jacquard_bmp` — do not change this format |
| ER-7 | Local OpenCV inpainting + cloud SDXL inpainting | `InpaintingService` |
| ER-8 | Async task processing | Celery + Redis, `app/worker.py` |
| ER-9 | 4-point pin + freehand mask canvas UI | `LoomCanvas.tsx` (Fabric.js) |
| ER-10 | Client-side flow state machine | `useLoomStore.ts` (Zustand) |

## 3. New Functional Requirements (v3 — no training required for any of these)

| ID | Requirement | Priority | Model/Method |
|----|-------------|----------|----------------|
| FR-1 | Frontend shall be scaffolded (`package.json`, Vite config, `index.html`, `main.tsx`, `App.tsx`), wiring existing components/hooks/store into a runnable app | P0 | N/A |
| FR-2 | System shall run a Laplacian-variance sharpness check on the uploaded image and conditionally run Real-ESRGAN (pretrained weights) to upscale/denoise if below threshold | P0 | Real-ESRGAN, pretrained, open-source |
| FR-3 | System shall segment the (post-restoration, post-deskew) image into border, body/field, pallu, and motif-instance regions | P0 | MobileSAM, pretrained, zero-shot + position heuristics |
| FR-4 | System shall detect repeat vector and symmetry group per region with a confidence score | P0 | Classical autocorrelation (OpenCV/scikit-image), no model |
| FR-5 | System shall expose detected regions/repeats via a new endpoint and accept corrections via a new endpoint, re-running downstream stages from the corrected state | P0 | N/A |
| FR-6 | System shall complete high-confidence regions via symmetry-projection; low-confidence/occluded regions route to the existing `InpaintingService` | P0 | Classical + existing pretrained inpainting |
| FR-7 | `LoomPreprocessor.quantize_colors` shall cluster in Lab space instead of RGB | P0 | Modify existing, no model |
| FR-8 | System shall vectorize quantized colour regions into clean boundaries before rescale | P1 | Classical marching-squares |
| FR-9 | System shall export a layered TIFF (one layer per colour) alongside the existing indexed BMP, without altering the existing BMP export | P0 | Classical (palette-based layer split) |
| FR-10 | System shall export a manifest JSON recording which regions were symmetry-completed vs inpainted | P0 | N/A |
| FR-11 | All new endpoints shall follow the existing `/api/v1/designs/...` URL pattern | P0 | N/A |

## 4. Non-Functional Requirements
| Category | Requirement |
|----------|-------------|
| Training | Zero custom training runs in this build phase — hard constraint, not a preference |
| Performance | Stage 0-2 (restoration check → segmentation → lattice) complete in < 60s for a typical photo on the local GPU |
| Performance | Full pipeline through export completes in < 3 minutes post-correction |
| Compatibility | New stages must not break existing `demo_test.py`/`test_preprocessor.py` — extend, don't replace |
| Reliability | Each new Celery task follows the existing task/retry pattern in `worker.py` |
| Model format | Pretrained models (Real-ESRGAN, MobileSAM) run via ONNX Runtime or ncnn, matching existing inference patterns in this codebase family |
| Data integrity | Existing BMP export format must be byte-identical in behavior before and after this build |

## 5. Explicitly Deferred (Phase 2 — see ML_STRATEGY_v1.md)
- Custom-trained Stage 0 restoration network
- Synthetic paired data generation from the 500-2,000 design corpus
- Any fine-tuning of MobileSAM or other pretrained models on saree-specific data
These remain fully specified in `ML_STRATEGY_v1.md` and require no rework of this document's
requirements to begin later — they slot in as a replacement for FR-2 once ready.

## 6. Testing Requirements
| Level | Requirement |
|-------|-------------|
| Regression | Existing `demo_test.py`/`test_preprocessor.py` continue passing unmodified |
| Unit | New stages (sharpness check + ESRGAN call, segmentation, lattice detection, vectorization) each get unit tests against fixture images |
| E2E | One full happy-path test: upload → auto stages → correction → export → both BMP and TIFF downloadable |

## 7. Traceability Matrix
| FR | PRD Feature # | Test Coverage |
|----|----------------|-----------------|
| FR-1 | 1 | Manual smoke test |
| FR-2 | 2 | Unit (sharpness threshold + ESRGAN output check) |
| FR-3 | 4 | Unit + regression |
| FR-4 | 5 | Unit + regression |
| FR-5 | 6 | E2E |
| FR-6 | 7 | Unit + regression |
| FR-7 | 8 | Unit (Lab vs RGB output on fixture image) |
| FR-8 | 9 | Unit |
| FR-9, FR-10 | 11 | Unit + E2E |
