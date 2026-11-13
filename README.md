# WeaveCore — screenshot-to-design research prototype

This repository explores the conversion of reference textile imagery into editable pattern components. The working tree combines a FastAPI image-processing service with a Vite/React designer interface. The code includes experiments in extraction, segmentation, vectorisation, pattern assembly and bitmap export.

**Status:** prototype under active development. Image-to-design fidelity, editable-layer reconstruction and loom compatibility must be evaluated for each workflow. A screenshot is not sufficient evidence of a reproducible loom-ready design.

## Repository layout

| Path | Purpose |
| --- | --- |
| `loom-backend/app/main.py` | FastAPI entry point and static frontend serving |
| `loom-backend/app/api/v1/endpoints.py` | Upload, status, analysis and export endpoints |
| `loom-backend/app/services/` | Computer-vision and design-processing modules |
| `loom-backend/frontend/` | React/Vite and Fabric-based editor |
| `loom-backend/app/assets/textile_library/` | Sample motif assets |
| `documents/` | Product requirements and technical design proposals |
| `Dockerfile` | Multi-stage frontend/backend container build |

## Run locally

Use Python 3.11 and a recent compatible Node.js version.

**Backend:**

```bash
git clone https://github.com/BalajiKoushik01/screenshot_to_design.git
cd screenshot_to_design/loom-backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

**Frontend (in a separate terminal):**

```bash
cd loom-backend/frontend
npm ci
cp .env.example .env
npm run dev
```

On Windows, copy `.env.example` to `.env` manually. The example sets `VITE_API_BASE_URL=http://127.0.0.1:8000`.

When Redis is unavailable, the backend falls back to a local thread executor. That fallback serializes the shared pipeline progress callback and is not durable or multi-tenant safe. Additional AI models or provider configuration may be needed for optional stages. The API docs are available at `http://127.0.0.1:8000/docs` when the backend starts.

## Development expectations

The design documents are specifications, **not test evidence**. Assess extraction fidelity on representative reference images; verify geometry, repeats and colour indexing, and inspect results manually before using them in an industrial workflow.

### Not production hardened

The API currently restricts browser origins, limits the size of file uploads, and returns generic unexpected-error responses. It still lacks authentication, per-user job isolation, verified image decoding, access-controlled exports, rate limiting and durable local fallback jobs. The credential configuration route is now disabled by default; operators should use server-side environment secrets. Do not deploy publicly until these controls are in place. Uploaded images may be copyrighted or confidential; only process material you have permission to use.

## Useful design references

- `documents/WEAVECORE_PATTERNEXTRACT_PRD_v3.md`
- `documents/WEAVECORE_PATTERNEXTRACT_SPEC_v3.md`
- `documents/WEAVECORE_PATTERNEXTRACT_TRS_v3.md`

See the code for implemented endpoint behaviour; planned features in the documents may not yet be available.
