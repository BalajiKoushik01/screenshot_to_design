# Silk saree creator workflow research

Reviewed 6 November 2026 against the existing screenshot-to-design implementation. Product documentation describes vendor capabilities. Hands-on designer trials are still needed to validate demand, speed and file compatibility.

## What to build around

| Workflow | Evidence | Decision for WeaveCore |
| --- | --- | --- |
| Correct a design at the dot level | PaintShop Pro offers palette loading with index preservation. Aseprite documents indexed pixels and symmetric drawing. [Corel](https://help.corel.com/paintshop-pro/v25/Corel-PaintShop-Pro-en/Corel-PaintShop-Pro-Working-with-image-palettes.html), [Aseprite](https://www.aseprite.org/docs/symmetry) | Store black and white as fixed indices. Make pencil and eraser act on a single pixel, with optional symmetry. Keep edits and display separate from BMP encoding. |
| Inspect and edit motifs in repeat | ArahPaint supports drawing and previewing seamless repeats, plus repeat detection on scans. NedGraphics exposes repeat type, origin, scale, mirrors and border design. [ArahPaint](https://arahne.org/en/products/arahpaint/), [NedGraphics Design & Repeat](https://www.nedgraphics.com/product/design-repeat-software/) | Let the designer select or correct a repeat cell and its origin. Add straight, half-drop and mirrored previews before filling a panel. Validate seams against adjacent tiles. |
| Reopen a design and assemble it | Texcelle supports layered design with repeat and scale controls. The repo already creates separate body, border and pallu outputs. [Texcelle](https://www.nedgraphics.com/product/texcelle-design-software/) | Save an editable project before adding assembly. Keep body, each border, pallu and reusable motifs separately editable. Record placement and output dimensions explicitly. |
| Handoff to existing loom software | BMP stores an explicit color table and pixel indices. The repo contains 1-bit and indexed samples. [Microsoft BMP storage](https://learn.microsoft.com/en-us/windows/win32/gdi/bitmap-storage) | Verify 8-bit headers, exact indices, dimensions and orientation. Confirm palette polarity and import compatibility with the designer's actual tooling before calling an output production-ready. |

## Where screenshot reconstruction can stand out

The target workflow is screenshot or existing design → reconstruct visible components → review predicted areas → correct dots and repeats → assemble → export. The differentiator is how quickly a designer can get from a difficult reference to a draft they trust enough to edit. Seamless repeat, layers and palette tools are already offered by established editors.

Near-regular textures can vary across repeats and distort with viewpoint. PatchMatch-based lattice detection is one published approach for recovering repeated structure, and the Deformed Lattice dataset covers lighting and perspective variation. These are useful references for benchmarking repeat geometry. Saree screenshots still need their own evaluation set, especially folded fabric and unique pallu motifs. [ICCV paper](https://openaccess.thecvf.com/content_iccv_2015/html/Liu_PatchMatch-Based_Automatic_Lattice_ICCV_2015_paper.html), [Penn State dataset](https://sites.psu.edu/lpac/lattice-detection/)

Start from the existing segmentation, lattice detection and completion pipeline. Compare detected repeat geometry and designer-corrected geometry before changing the detector. Evaluate repeated-region recovery separately from one-off motifs. A repeated region may have a visible donor elsewhere in the image. A hidden one-off motif has no such evidence. The UI should show which output areas were derived from visible pixels, repeat donors or fallback synthesis.

## Validation before a paid pilot

1. Assemble 20 references across clean flat images, compressed video frames, perspective distortion, and occlusion. Include body, border and pallu examples. Mark visible components, repeat cells and areas where the original is unknown. Use matched BMPs where available.
2. Compare the engine output with a simple deskew-and-quantize baseline. Score component coverage, repeat-vector and phase errors, and aligned foreground overlap where ground truth exists. Record correction minutes and corrections per component in a designer walkthrough.
3. Round-trip representative exports through the existing handoff software. Verify pixel dimensions, bit depth, palette polarity and index counts. Include odd widths to catch row-padding errors.
4. Add private project storage and tenant-scoped downloads before accepting customer designs. Restrict cloud-provider configuration to authorized operators.

## Implementation order

1. Implemented in this change. Portable single-plane project save and reopen, including from the upload screen, and mirrored pencil and eraser strokes. The file stores dimensions and binary pixel indices. BMP remains the delivery format.
2. Add editable component documents seeded from the existing body, border and pallu output masks, with motif reuse and live repeat previews. Keep the document format versioned as multi-part assembly is introduced.
3. Make extraction corrections visible and reversible. Separate recovered and predicted pixels, compare the baseline with real samples and improve the failure cases that consume the most designer time.
