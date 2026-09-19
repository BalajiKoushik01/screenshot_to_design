---
document: Product Requirements Document (PRD) — v3
project: WeaveCore Pattern Extraction Engine (WPEE)
version: 3.0
supersedes: WEAVECORE_PATTERNEXTRACT_PRD_v2.md
companion_docs: [SPEC_v3.md, ML_STRATEGY_v1.md (Phase 2/Future), TRS_v3.md, UIUX_v1.md, SRD_v1.md, DATAFLOW_v1.md, USERFLOW_v1.md]
---

# WPEE — Product Requirements Document (v3)

## 1. What Changed From v2
v2 put a custom-trained restoration network in the MVP. v3 defers ALL custom training to a
future phase: the MVP ships using only open-source pretrained models (Real-ESRGAN, MobileSAM)
and classical CV, on top of the existing `screenshot_to_design` pipeline. This is a strictly
faster path to a functioning product — nothing here is thrown away later, the trained model from
`ML_STRATEGY_v1.md` simply slots in as an upgrade once the MVP is proven.

## 2. Executive Summary
WPEE takes a photo/screenshot of a saree and produces the existing single 8-bit indexed loom
BMP, plus a new layered TIFF for hand-editing. This build phase adds automatic region
segmentation and repeat detection (both pretrained/classical, zero training) on top of the
existing manual deskew/quantize/export pipeline, sold to designers as a web SaaS.

## 3. Goals
| Goal | Metric |
|------|--------|
| Ship a functioning product with zero training runs | MVP uses only pretrained weights + classical CV, confirmed in SPEC_v3.md §2 |
| Validate the concept works before investing in fine-tuning | 10-15 real photos processed end-to-end successfully |
| Preserve a clean upgrade path to fine-tuned models later | Phase 2 (ML_STRATEGY_v1.md) requires no rework of Phase 1 code |

## 4. Non-Goals (this build phase)
- No custom model training of any kind
- No changes to the existing BMP export format
- No IP protection/licensing/distribution packaging (deferred)
- No fine-tuned segmentation or restoration model — pretrained/zero-shot only

## 5. Feature List (Priority) — updated status
| # | Feature | Priority | Approach |
|---|---------|----------|----------|
| 1 | Frontend scaffolding | P0 | Build (no models involved) |
| 2 | Restoration (denoise/upscale) | P0 | Real-ESRGAN, pretrained, conditional on sharpness check |
| 3 | Deskew | P0 | Existing manual 4-point pin, unchanged |
| 4 | Region segmentation | P0 | MobileSAM, pretrained, zero-shot + heuristics |
| 5 | Repeat/symmetry detection | P0 | Classical autocorrelation, no model |
| 6 | Manual correction UI | P0 | Extends existing LoomCanvas.tsx |
| 7 | Pattern completion | P0 | Symmetry-fill (classical) + existing InpaintingService |
| 8 | Colour quantization | P0 | Existing K-Means, RGB→Lab only change |
| 9 | Vectorization | P1 | Classical, new |
| 10 | Indexed BMP export | Done | Existing, unchanged |
| 11 | Layered TIFF export | P0 | New, classical (palette-based layer split) |
| 12 | Fine-tuned restoration model | Future (Phase 2) | See ML_STRATEGY_v1.md — after MVP ships |

## 6. Release Criteria
- [ ] Every MVP feature ships using only pretrained/open-source weights or classical CV — zero training runs
- [ ] End-to-end pipeline runs on a real saree photo through to export
- [ ] Existing BMP export format unchanged and verified byte-compatible
- [ ] Correction UI functions on the extended canvas
- [ ] Tested against 10-15 real, varied-quality saree photos

## 7. Business Context (unchanged)
- Delivery: web SaaS, extending the existing repo
- Build: solo, via Antigravity
- Monetization & licensing: deferred
- Fine-tuning: deferred to Phase 2, using the existing 500-2,000 design corpus and local GPU once MVP is validated
