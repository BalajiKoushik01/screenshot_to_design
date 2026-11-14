"""Stateless extraction: uploads are decoded in memory and never written to public storage."""
import json
import threading
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from app.services.indexed_design import MAX_BYTES, extract

router = APIRouter()
_slots = threading.BoundedSemaphore(2)


@router.post("/extract")
def extract_design(image: UploadFile = File(...), options: str = Form("{}")):
    try:
        if len(options) > 4096:
            raise HTTPException(413, "Extraction options are too large")
        data = image.file.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise HTTPException(413, "Image exceeds 20 MB")
        if not _slots.acquire(blocking=False):
            raise HTTPException(429, "Extraction is busy; retry shortly")
        try:
            return extract(data, json.loads(options))
        finally:
            _slots.release()
    except (ValueError, TypeError) as exc:
        raise HTTPException(422, str(exc)) from exc
    finally:
        image.file.close()
