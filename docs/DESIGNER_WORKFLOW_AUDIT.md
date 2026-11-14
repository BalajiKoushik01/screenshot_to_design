# Silk saree designer workflow audit

This comparison uses public product manuals and the repository's indexed artwork examples. It compares observable behavior and open interchange formats.

| Stage | Designer requirements | Studio coverage and remaining work |
| --- | --- | --- |
| Capture and calibration | Original CAD/BMP, screenshot crop and deskew, cloth flatness, exact end/pick grid, reference comparison | Indexed raster imports, four corner crop, output dimensions and reference preview. Automatic grid estimation, cloth dewarping and masked repairs remain. |
| Dot editing | Pencil, fill, picker, selection, undo, line and shape tools, despeckle, protected colors | Core pixel tools and rectangular selections. Protected colors, line and shape tools, contour cleanup and irregular selections remain. |
| Motif reuse | Copy an intact motif, paste at exact coordinates, ignore its ground, reuse across files | Same-project motif copying and index-based transparent paste. Persistent motif library and explicit cross-project palette mapping remain. |
| Palette and colorways | Named operational slots, preserve duplicate RGB entries, remap by index, audit counts, maintain alternate palettes | Palette labels, counts, recoloring, and replacement across the canvas or within a selection. Named colorway presets, palette interchange and locked slots remain. |
| Saree layout | Body, pallu, upper/lower borders, acchu, kali, locking and selvedge; editable assembly | Named rectangular panels and extraction exports. Independent layers, linked motif instances and factory-specific assembly rules remain. |
| Repeat layout | Straight, mirrored, half-drop and brick repeats, inspection at the seam, fabric density | Four repeat modes share one coordinate mapping across preview and output. Odd-size offsets round down to the nearest whole cell. Editing directly across seams, repeat detection and ends/picks per unit remain. |
| Weave construction | Assign weave structures to palette indices, handle warp/weft density and binding, inspect face/back floats | Requires a separate interlacement model, draft viewer and validated sample drafts. Color-area BMP is the current handoff. |
| Loom handoff and proofing | Hook/pick limits, orientation, slot mapping, controller formats, trial weave and technical sheet | Indexed BMP with width check and editable project export. Build each machine profile using the controller model and accepted input files, then verify in factory CAD and on the loom. |
| Day-to-day operation | Recovery after tab closure, reusable assets, performance on full designs and keyboard access | Downloadable editable projects and undo/redo. Autosave, persistent asset libraries and end-to-end keyboard editing of the pixel grid remain. |

The next implementation milestones are independent editable layers and reusable motif assets, followed by factory assembly and proofing with accepted examples. Collect matching screenshot, original artwork and accepted export files for each real workflow. Use those fixtures to compare exact indices and orientation, plus size and color assignments, before claiming compatibility.

## Public references

- [ArahPaint manual and features](https://www.arahne.si/wp-content/uploads/manuals/pdf/apaint4-EN.pdf)
- [Corel PaintShop Pro selection and transparent paste](https://help.corel.com/paintshop-pro/v20/main/en/documentation/Corel_PaintShop_Pro/Cutting_copying_and_pasting.html)
- [Adobe Photoshop indexed color tables](https://helpx.adobe.com/photoshop/desktop/adjust-color/selective-color-adjustments/customize-indexed-color-tables.html)
- [Pointcarre repeat and layers workflows](https://www.pointcarre.com/Textile-Printing-Software.php)
- [ArahWeave manual, Jacquard conversion and float analysis](https://www.arahne.si/wp-content/uploads/manuals/pdf/aweave-EN.pdf)
