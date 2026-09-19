---
project: WeaveCore Pattern Extraction Engine (WPEE) — v3
version: 3.0
supersedes: WEAVECORE_PATTERNEXTRACT_SPEC_v2.md
spec_date: 2026-09-13
target_agent: Google Antigravity 2.0 (Gemini 3.5/3.7 Flash)
status: READY_FOR_AGENT
change_summary: >
  v2 put a custom-trained Stage 0 restoration network in the MVP critical path. v3 defers all
  custom training: MVP ships using only open-source pretrained models (Real-ESRGAN, MobileSAM)
  and classical CV (existing deskew/quantize/export code), matching how the pipeline already
  works today. The synthetic-data fine-tuning plan in ML_STRATEGY_v1.md becomes Phase 2 (Future)
  — built only after the open-source-based MVP is functioning and shipped.
---

# WeaveCore Pattern Extraction Engine (WPEE) v3 — Master Specification

> **Agent Brief:** Build the MVP using only open-source pretrained models and classical CV — no
> custom training. Extend the existing `screenshot_to_design`/`loom-backend` repo with automatic
> region segmentation (MobileSAM, zero-shot) and repeat/symmetry detection (classical
> autocorrelation), on top of the existing manual deskew/quantize/export pipeline. Do not build
> the trained restoration network from `ML_STRATEGY_v1.md` yet — that is Phase 2, after this
> ships and you've validated the product works.

---

## 1. What Already Exists (do not rebuild) — unchanged from v2
| Existing Component | File | Keep As-Is? |
|---------------------|------|-------------|
| FastAPI app, CORS, static mount | `app/main.py` | Yes |
| Upload + status endpoints | `app/api/v1/endpoints.py` | Extend (add region/correction endpoints) |
| Celery task orchestration | `app/worker.py` | Extend |
| Perspective deskew (4-point, manual) | `LoomPreprocessor.apply_perspective_correction` | Keep as the primary deskew mechanism for v3 (no auto-deskew model yet) |
| Colour quantization | `LoomPreprocessor.quantize_colors` | Keep, switch RGB→Lab (small change, no training involved) |
| BMP export | `LoomPreprocessor.export_jacquard_bmp` | Keep exactly as-is — single 8-bit indexed BMP |
| Defect inpainting | `InpaintingService` (local OpenCV / cloud Replicate-RunPod SDXL) | Keep, reuse for pattern completion — these are already open-source/pretrained models via API, no fine-tuning needed |
| Correction canvas | `LoomCanvas.tsx` (Fabric.js) | Extend |
| State machine | `useLoomStore.ts` (Zustand) | Extend |

## 2. MVP Scope — Open-Source & Classical Only (no training)
| Capability | v3 MVP Approach | Custom Training Needed? |
|------------|-------------------|---------------------------|
| Restoration (denoise/upscale) | Real-ESRGAN, **pretrained open-source weights**, run only when a sharpness check (Laplacian variance, same technique as WeaveCore's SlotA) flags the image as low quality | No |
| Deskew | Existing manual 4-point pin (kept as-is) | No |
| Region segmentation | MobileSAM, **pretrained open-source weights**, zero-shot + position heuristics | No |
| Repeat/symmetry detection | Classical autocorrelation-based lattice detection (OpenCV/scikit-image) | No |
| Pattern completion | Symmetry-projected fill (classical) + existing `InpaintingService` (already pretrained models via API) as fallback | No |
| Colour quantization | Existing K-Means, switched to Lab space | No |
| Vectorization | Classical marching-squares boundary cleanup | No |
| Export | Existing single indexed BMP + new layered TIFF | No |

Every single MVP capability above uses either code you already have or a pretrained model
downloaded as-is. **Nothing in this build phase requires your design corpus or any training
run.** This is the fastest path to a functioning product, and it directly matches what you
asked for.

## 3. Updated Pipeline (v3)
```
[ Raw Photo/Screenshot ]
        │
        ▼
Stage 0: Sharpness Check (Laplacian variance) + conditional Real-ESRGAN upscale/denoise
        │   Pretrained open-source weights. No training. Same technique as WeaveCore's SlotA.
        ▼
Stage 0.5: Perspective Deskew — EXISTING manual 4-point pin (kept, unchanged)
        ▼
Stage 1: Region Segmentation (NEW) — MobileSAM zero-shot, pretrained, + position heuristics
        ▼
Stage 2: Repeat & Symmetry Detection (NEW) — classical autocorrelation, no model/training
        ▼
   ┌─── Manual Correction UI (extends existing LoomCanvas.tsx) ───┐
   │   Designer reviews regions/repeats, adjusts boundaries        │
   └────────────────────────────────────────────────────────────────┘
        ▼
Stage 3: Pattern Completion
        │   High-confidence: symmetry-projected fill (classical).
        │   Low-confidence/occluded: EXISTING InpaintingService (already pretrained via API).
        ▼
Stage 4: Colour Quantization (EXISTING, Lab-space instead of RGB)
        ▼
Stage 5: Boundary Vectorization (NEW, classical)
        ▼
Stage 6: Loom Hook Rescale (EXISTING, unchanged)
        ▼
Stage 7: Export (EXTEND EXISTING)
        │   (a) Single 8-bit indexed BMP — UNCHANGED
        │   (b) NEW: layered TIFF for Photoshop/PaintShop Pro
        │   (c) NEW: manifest JSON (symmetry-completed vs inpainted regions)
```

## 4. Phase 2 (Future — not part of this build)
Once the above ships and you've used it on real photos, revisit `ML_STRATEGY_v1.md`: build the
synthetic-data pipeline from your 500-2,000 design corpus and train a restoration network to
replace the generic Real-ESRGAN + manual-deskew combination with something that automatically
handles fold/lighting/angle issues specific to sarees, without a manual 4-point pin every time.
This is a strict upgrade path, not a redo — nothing in Phase 1 needs to be thrown away; the
trained model simply slots in as a smarter Stage 0/0.5 later.

## 5. Architecture Decisions (v3 — supersedes v2's Stage 0 decision only; all other v2 ADRs unchanged)
| Decision | Choice | Rationale |
|----------|--------|-----------|
| MVP training requirement | Zero. Open-source pretrained models + classical CV only | Matches your explicit instruction: ship functioning software first, fine-tune later |
| Restoration for MVP | Real-ESRGAN pretrained (not a custom-trained network) | Already proven, open weights available, no data/training time needed |
| Deskew for MVP | Keep the existing manual 4-point pin | Automating this is exactly the Phase 2 upgrade — don't block MVP on it |
| When to build ML_STRATEGY_v1.md's synthetic pipeline | After MVP ships and is validated on real use | Avoids sinking training time into a model before you know the rest of the pipeline actually works end-to-end |

## 6. Development Roadmap (v3)
### Phase 1 — Frontend Scaffolding (Week 1)
- Scaffold `package.json`/Vite/`App.tsx`/`main.tsx`, wire existing components — 2 days
- Verify existing upload → Celery → status flow end-to-end through new frontend shell — 1 day

### Phase 2 — Open-Source Model Integration (Week 1-2)
- Download/integrate pretrained Real-ESRGAN weights (ONNX or ncnn, your choice — ncnn matches WeaveCore precedent) + sharpness-check gate — 1.5 days
- Download/integrate pretrained MobileSAM weights (ONNX Runtime) + position-heuristic region classifier — 2 days
- Classical autocorrelation lattice/repeat detection — 3 days (hardest classical-CV stage; budget the most time)

### Phase 3 — Correction UI + Completion + Export (Week 2-3)
- Extend `LoomCanvas.tsx` with region overlay + confidence badges + correction — 3 days
- Symmetry-projected completion + routing to existing `InpaintingService` for low-confidence regions — 2 days
- Vectorization + layered TIFF export alongside existing BMP export — 2 days

### Phase 4 — Integration Test & Ship (Week 3)
- Run 10-15 real saree photos end-to-end — 1 day
- Fix issues, deploy — 2 days

### Phase 5 — Fine-Tuning (Future, post-launch — see ML_STRATEGY_v1.md)
- Build synthetic-data generator from your design corpus
- Train and validate the Stage 0 restoration network
- Swap it in to replace Real-ESRGAN + manual deskew

## 7. Antigravity Agent Kickoff Prompt
```
You are extending the existing "screenshot_to_design" (loom-backend) repository — do NOT
initialize a new project or replace existing working code. Read
WEAVECORE_PATTERNEXTRACT_SPEC_v3.md in full before writing any code. Ignore ML_STRATEGY_v1.md
for now — that describes a future phase, not this build.

Before writing any code:
1. Inspect the current loom-backend repo (app/, frontend/src/) and confirm exactly what exists
   today against Section 1 of the spec. Report anything that doesn't match before proceeding.
2. Generate a Plan Artifact for Phase 1 (frontend scaffolding) only.

Start with Phase 1:
1. Scaffold frontend/package.json, vite.config.ts, index.html, src/main.tsx, src/App.tsx —
   wire up the EXISTING LoomCanvas.tsx, useProcessDesign.ts, and useLoomStore.ts, don't rewrite them
2. Verify the existing upload -> Celery -> status flow works end-to-end through the new frontend

Constraints:
- No custom model training in this build phase — use only pretrained/open-source model weights
  (Real-ESRGAN, MobileSAM) and classical CV
- Never change the existing single 8-bit indexed BMP export format
- Reuse the existing InpaintingService rather than building a second inpainting system
- Ask before touching any file whose current behavior isn't fully understood yet
```
