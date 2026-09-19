---
document: ML Training Strategy — Restoration Network via Synthetic Paired Data
project: WeaveCore Pattern Extraction Engine (WPEE)
version: 1.0
status: PHASE 2 / FUTURE — not part of the current build. The MVP (WEAVECORE_PATTERNEXTRACT_SPEC_v3.md)
  ships using only open-source pretrained models and classical CV, with zero custom training.
  Build this only after that MVP is functioning and validated on real use.
companion_docs: [WEAVECORE_PATTERNEXTRACT_SPEC_v3.md]
---

# WPEE — ML Training Strategy: Synthetic Paired Data ("Reverse Rendering")

> **This is the Phase 2 plan, not the current build.** Ship the open-source/classical MVP in
> `WEAVECORE_PATTERNEXTRACT_SPEC_v3.md` first. Come back to this document once that's working.

## 1. The Problem
You have 500-2,000 flat, loom-ready design files (indexed BMPs) — your own export-ready/in-use
mill designs. You do not have any matched (photo of a saree, its corresponding design file)
pairs, and can't get them (no way to photograph a saree and simultaneously know its "true"
digital design unless you already made that design). A prior attempt to fine-tune directly on
the unpaired design corpus produced no usable result.

## 2. Why the Obvious Approach (unpaired GAN translation) Is the Wrong Tool Here
CycleGAN-family models exist specifically for unpaired translation, but they optimize for
*distributional realism between domains*, not pixel-level fidelity to a specific source. They
are documented to distort or hallucinate fine structural detail, are unstable to train, and
typically need substantial data on **both** sides of the translation to work at all. Your
corpus is one-sided (designs only) — there's nothing for an unpaired method to anchor against
convincingly. This is very likely why the earlier attempt produced nothing usable.

## 3. The Strategy: Manufacture Paired Data From Your Own Ground Truth
This is the standard approach in document-restoration/OCR research (DocUNet, Augraphy,
PreP-OCR) for the identical problem shape: they have clean ground truth (documents) but no
"photo of it in the wild," so they synthetically render the "in the wild" version FROM the
clean original. Applied here:

```
[ Real design file, e.g. design_0413.bmp ]     ← exact ground truth, already in your corpus
              │
              ▼
   Convert indexed BMP → RGB via its own palette (trivial, no data loss)
              │
              ▼
   Apply randomized "photograph simulation" stack:
     1. Cloth warp: randomized 2D mesh displacement (simulates drape/fold)
     2. Perspective skew: random homography (simulates off-angle phone camera)
     3. Lighting: gradient/shadow overlay, randomized direction and intensity
     4. Colour cast: randomized white-balance shift (simulates camera/screen colour)
     5. Blur: random gaussian/motion blur
     6. Compression artifacts: JPEG/screenshot recompression at random quality
     7. Moiré: simulated screen/weave interference pattern (randomized frequency)
     8. Sensor noise: randomized gaussian/salt-pepper noise
     9. Occlusion: random patches (simulates a fold, hand, watermark) — deliberately,
        since Stage 3 (pattern completion) needs to learn to handle exactly this
              │
              ▼
   [ Synthetic "photo" ]  ──paired with──►  [ design_0413.bmp, the exact original ]
```

Every step is randomized per sample, so a single design file can generate many distinct
synthetic training pairs. With 500-2,000 source designs and, say, 30-50 randomized renders
each, that's 15,000-100,000 training pairs — enough to train a UNet-scale restoration model,
generated entirely automatically, with zero manual labeling.

## 4. What the Network Actually Learns (framing matters)
Do **not** frame this as photorealistic image generation (GAN/diffusion). Frame it as a
**restoration/regression problem**: input = degraded synthetic photo, output = the clean, flat,
correctly-lit RGB rendering of the design (i.e., what the design looks like with all the
photographic degradation reversed — deskewed, delit, denoised, completed). This output is then
handed to your **existing, already-working** `LoomPreprocessor.quantize_colors` and
`export_jacquard_bmp` — the network's job stops at "give me a clean flat image," not "give me
the final indexed BMP." This keeps the trained model's job narrow and the deterministic,
already-correct classical code doing what it already does well.

This framing is deliberately chosen over training the network to directly predict palette
indices: your design files use a variable number of colours per design (K varies), so a fixed
classification head doesn't generalize across designs the way a continuous RGB restoration
target does. Let quantization stay classical.

## 5. Model & Training Plan (sized for a single local consumer GPU)
| Item | Recommendation | Why |
|------|------------------|-----|
| Architecture | Lightweight UNet (or a small Restormer/NAFNet-style restoration network) | Well-understood, trains stably, doesn't need adversarial training |
| Training resolution | 512×512 patches (tile larger images at inference, matching WeaveCore's existing tiled-inference pattern for large images) | Keeps VRAM requirements modest on a single consumer GPU |
| Loss | L1 pixel loss + a perceptual (VGG feature) loss term | L1 alone tends to blur fine motif edges; perceptual loss preserves pattern sharpness, which matters for "exact replica" |
| Precision | Mixed precision (fp16) training | Halves VRAM usage, minimal accuracy cost |
| Dataset split | Hold out ~10% of your 500-2,000 source designs entirely (not just synthetic renders of them) for validation, so validation never leaks the same base design seen in training | Prevents the model from "memorizing" specific designs rather than learning general restoration |
| Framework | PyTorch + ONNX export for inference | Matches the ONNX Runtime inference pattern already used elsewhere in your codebases |

## 6. Validating Against Reality (the sim-to-real gap)
A model trained purely on synthetic photos may not generalize perfectly to real screenshots on
day one — this is the known risk with any synthetic-data approach. Mitigation, in order:
1. Make the degradation randomization in §3 as aggressive and varied as you can tolerate —
   over-randomizing tends to generalize better than under-randomizing (domain randomization).
2. Once Stage 0 is trained, collect even 50-100 **real** saree photos (no design labels needed)
   purely to *look at* the model's output qualitatively — you don't need ground truth to notice
   if the output looks wrong.
3. Only if real-world output is visibly worse than synthetic validation output: hand-correct a
   small batch (even 20-30) of real photos into rough designs yourself, and fine-tune the
   already-trained model on that small real batch. This is far cheaper than needing hundreds of
   labeled pairs upfront, because the model already knows the general restoration task from
   synthetic data — fine-tuning only needs to close a smaller gap.

## 7. Integration Point
Stage 0 in the updated pipeline (`WEAVECORE_PATTERNEXTRACT_SPEC_v2.md` §3). Runs first, before
segmentation. Ships as an ONNX model file loaded via ONNX Runtime in a new
`app/services/restoration.py`, following the same inference wrapper pattern already used for
other models in this codebase family.

## 8. What This Does Not Solve
This strategy trains Stage 0 (restoration) only. Region segmentation (border/body/pallu) and
repeat/symmetry detection remain classical CV (MobileSAM zero-shot + autocorrelation-based
lattice detection, per the master spec) — they don't need labeled data and shouldn't be forced
into this same training pipeline. Keep the two problems separate.
