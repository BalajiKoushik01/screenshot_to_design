# Designer workflow

## 1. Choose the best source

Prefer the original BMP/PNG, then a lossless screenshot of the design at an integer zoom. Use a photograph only when those are unavailable. A photograph of folded cloth is not a complete map of the design. Keep a copy of the source.

Open the image. The browser fills in its dimensions when it can decode the preview. TIFF and some BMP variants may not preview; the server can still decode them. Enter dimensions manually in that case. Transparent imagery is rejected: flatten it onto the intended ground color in your image editor first.

## 2. Establish the grid

For a full design, enter the intended number of columns and rows. Do not assume the longest side represents hooks: the sample files include tall layouts. Your design convention determines the orientation.

For a screenshot with toolbars or a flat reference seen at an angle, choose **Pin crop corners** and click top-left, top-right, bottom-right, bottom-left. Corner coordinates refer to pixel centers. Keep the corners within the actual design. A four-corner transform straightens a planar patch; it cannot unfold fabric or recover hidden areas.

At a known 2× screenshot zoom, a 480-pixel-wide source repeat represents 240 original columns. Guessing this number can duplicate or remove fine lines. Correct output dimensions are a design input, not a resolution enhancement setting.

## 3. Choose color handling

**Preserve exact sampled colors** is appropriate for CAD artwork. More than 256 colors triggers a clear error. If the source is already palette-indexed, its palette numbering is kept intact. Two visibly identical colors may have different indices and must not be casually merged.

**Reduce colors** creates a limited palette from a photograph. Review zari edges, fine lines, meena details and isolated dots. The report measures RGB error relative to the sampled source, before manual edits; it is not confidence in the original design or proof of loom compatibility.

## 4. Edit the indexed master

- Use Pencil for cells and lines; fast strokes interpolate between pointer events.
- Flood fill changes only connected cells of the same palette index.
- Pick color samples an index from the design.
- Change a palette display color without changing the index stored in any cell. Use the name field for ground, zari, meena or a factory reference.
- Undo/Redo restores pixel data and palette edits. Keyboard: Ctrl/Cmd+Z; Shift+Ctrl/Cmd+Z to redo. History is bounded and is not included in saved project files.

Select panel lets you drag a rectangle, then adjust exact X, Y, width and height. Save named regions for body, pallu, borders and motifs. Exporting a selected panel produces that rectangle at its own dimensions; the whole-design width requirement does not apply to a component export.

For repeating patterns, crop to a complete repeat, inspect the 3 × 3 preview and explicitly build the desired repetitions. The edge-difference percentages compare opposite edge indices; a nonzero value need not be a defect, and zero is not a full seam-quality assessment. Mirroring changes artwork and should only be used when intended.

## 5. Save and hand off

Save the editable JSON project to resume with the same palette, pixels, named regions and extraction metadata. It does not contain the original reference image, undo history or a machine configuration. Opening an image does not extract it until you choose Extract. Extracting or opening a project replaces the current editor document; save before doing so.

Set the required full-design export width, or zero for no width restriction. Export blocks mismatches rather than stretching artwork. BMP export uses a 256-entry RGB palette, eight bits per pixel, uncompressed bottom-up rows and four-byte row alignment. It does not infer or add binder dots.

Open the BMP in the factory's CAD system, assign/verify weave structures, confirm hook/pick orientation, selvage and controller format, then follow the factory's sampling process. Float analysis needs a woven interlacement draft; a flat region of a color-area design is not automatically a physical float.

## Reuse a motif or replace palette indices

Select a rectangle, then choose **Copy selected motif**. Set the destination column and row, starting at zero. To keep the destination ground, select the source ground swatch and enable **Skip active palette index when pasting**. The pasted motif must fit inside the canvas.

To replace pixels without changing the palette table, choose the source swatch and a destination slot under **Motif and palette edits**. The replacement is confined to the active rectangular selection when present. Paste and replacement can be undone.

Choose the repeat layout under **Panels & repeats**. The preview and built artwork use the same straight, mirrored, half-drop or half-brick arrangement. Half offsets round down when the tile dimension is odd.

See the [designer workflow audit](DESIGNER_WORKFLOW_AUDIT.md) for requirements and outstanding gaps.

To reuse a motif across projects, copy a selection and choose **Save motif file**. In the destination project, choose **Open saved motif**, set the coordinates, and map each used source index to a destination slot. Choose an optional transparent source index to retain the destination beneath it. Mapping is explicit even when two palette entries have identical colors.
