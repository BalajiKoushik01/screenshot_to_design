# WeaveCore — editable indexed designs from saree references

WeaveCore turns a selected area of a silk saree screenshot into an editable pixel grid. Designers can correct individual cells, work with named panels, inspect repeats and export an **uncompressed 8-bit indexed BMP** without changing its palette indices during export.

The default application is the **Indexed Design Studio**. The previous AI reconstruction workspace remains available at `?legacy=1` when running the legacy backend. Its synthetic motif replacement and binding logic are not used by the new extraction path.

## What works

- PNG, JPEG, BMP, TIFF and WebP ingestion with decoded image validation.
- Full-image extraction or four-corner perspective crop, with explicit output columns and rows.
- Exact sampled-color preservation for artwork with at most 256 colors. Existing palette-mode images retain their original indices, including distinct slots with identical RGB values.
- Explicit, deterministic color reduction for photographs, with dithering disabled.
- Pixel pencil with continuous strokes, connected flood fill, color picker, zoom, pixel grid, and bounded undo/redo.
- Palette names and recoloring without changing indices; up to 256 slots.
- Named rectangular body/border/pallu/motif panels, crop, mirror, repeated tiling and 3 × 3 repeat preview.
- Versioned editable JSON project save/reopen, PNG preview, whole-design or selected-panel indexed BMP export.
- Export-width preflight: a mismatch blocks export rather than resizing the design silently.

## What “pixel-perfect” means here

An undistorted screenshot of known-grid, limited-color artwork can be reconstructed exactly when the crop and output dimensions are correct. The included regression benchmark recovers all RGB pixels in ten lossless screenshots derived from the repository's BMP samples.

That result **does not extend to arbitrary saree photographs**. JPEG compression, folds, shadows, blur, missing areas and uncertain grid dimensions destroy or obscure information. Reduction and perspective resampling must be reviewed. This studio does not invent missing motifs, infer weave structures or certify controller compatibility. Its BMP is a color-area design for downstream CAD, not a machine program.

See [research and implementation decisions](docs/SCREENSHOT_TO_DESIGN_RESEARCH.md), [benchmark results](docs/BENCHMARK_RESULTS.json), and [the designer guide](docs/INDEXED_STUDIO_GUIDE.md).

## Run the studio

Python 3.11+ and Node.js 20+:

```bash
git clone https://github.com/BalajiKoushik01/screenshot_to_design.git
cd screenshot_to_design/loom-backend
python -m venv .venv
# Linux/macOS: source .venv/bin/activate
# Windows: .venv\Scripts\activate
pip install -r requirements-studio.txt
cd frontend
npm ci
npm run build
cd ..
python -m uvicorn app.studio_main:app --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000`. For frontend development run `npm run dev` in `loom-backend/frontend`; Vite proxies `/api` to port 8000. The new studio uses same-origin requests, so it needs no browser API key or cross-origin setup. The legacy `VITE_API_BASE_URL` setting does not change studio routing.

### Container

```bash
docker build -t weavecore-studio .
docker run --rm -p 8000:8000 weavecore-studio
```

The default container uses the minimal studio dependencies, serves the built UI and runs as a non-root user. Docker execution still needs verification on your deployment host.

## Verification

```bash
cd loom-backend
pip install httpx
python -m unittest discover -s tests -p 'test_*.py' -v
PYTHONPATH=. python scripts/benchmark_indexed.py
cd frontend
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The Python tests cover extraction, input limits, invalid geometry, indexed input, crop alignment and the ten repository BMPs. JavaScript tests cover index-preserving project/BMP encoding, row padding, orientation, flood-fill connectivity, continuous strokes, repeat operations and history isolation. Playwright covers the browser upload/edit/save/export flow and narrow-screen overflow. CI runs these checks; a committed test is not evidence it passed until the workflow reports success.

## Boundaries and deployment

The studio endpoint is stateless: image bytes are processed in memory and no upload or export is retained by this code. Edits and downloads happen in the browser; save the JSON project before closing. Upload limit: 20 MB; decoded input: 24 million pixels; output: four million cells, with a maximum side of 16,384. Work panel by panel for larger sarees. Undo memory is bounded to approximately 32 MB of pixel snapshots, with a maximum of 40 actions.

The standalone app is suitable for local use and controlled pilots. Public SaaS still needs authentication, tenant controls, TLS, request limits at the reverse proxy, monitoring, quotas, durable project storage and a retention policy. The two-extraction semaphore is per process, not a global quota. Multipart handling may spool uploads temporarily before the endpoint reads them; use an appropriate temporary-storage policy. Browser decoding/encoding and large flood fills remain main-thread operations.

## Repository map

| Path | Role |
|---|---|
| `loom-backend/app/studio_main.py` | Minimal studio server |
| `loom-backend/app/api/studio.py` | Stateless multipart extraction endpoint |
| `loom-backend/app/services/indexed_design.py` | Validation, geometry, palette extraction |
| `loom-backend/frontend/src/studio/` | Indexed editor, project schema, BMP encoder |
| `loom-backend/tests/` | Python regression tests |
| `loom-backend/frontend/tests/` | Pure editor/export tests |
| `loom-backend/frontend/e2e/` | Browser workflow tests |
| `loom-backend/scripts/benchmark_indexed.py` | Known-grid screenshot benchmark |
| `documents/` | Earlier product proposals; not implementation evidence |

The original service can still be run with `requirements.txt` and `uvicorn app.main:app`. It includes the new extraction router as well as the existing research endpoints. Read [its security limitations](docs/API_SECURITY.md) before enabling it outside a trusted environment.
