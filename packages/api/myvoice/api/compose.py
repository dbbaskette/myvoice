"""Sync /api/compose + /api/lint routes."""
from __future__ import annotations

import dataclasses

import yaml
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from myvoice.compose import compose
from myvoice.lint import detect_ai_patterns, detect_positive_hits, lint_to_hits
from myvoice.packs.manifest import Manifest

router = APIRouter(tags=["compose"])


class ComposeRequest(BaseModel):
    pack: str
    format: str | None = None
    samples: list[str] = []
    draft: str | None = None


@router.post("/api/compose")
def compose_endpoint(req: ComposeRequest, request: Request) -> dict[str, object]:
    store = request.app.state.pack_store
    info = store.get(req.pack)
    if info is None:
        raise HTTPException(
            404,
            detail={"error": {"code": "pack_not_found", "message": f"No pack '{req.pack}'"}},
        )
    prompt = compose(
        info.root_path,
        format=req.format,
        samples=req.samples if req.samples else None,
        draft=req.draft,
    )
    return {"prompt": prompt, "char_count": len(prompt), "samples_used": req.samples}


class LintRequest(BaseModel):
    pack: str
    text: str


@router.post("/api/lint")
def lint_endpoint(req: LintRequest, request: Request) -> dict[str, object]:
    store = request.app.state.pack_store
    info = store.get(req.pack)
    if info is None:
        raise HTTPException(
            404,
            detail={"error": {"code": "pack_not_found", "message": f"No pack '{req.pack}'"}},
        )
    manifest_path = info.root_path / "stylepack.yaml"
    manifest = Manifest.model_validate(
        yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
    )
    violations = lint_to_hits(manifest, req.text) + detect_ai_patterns(req.text)
    hits = detect_positive_hits(req.text)
    return {
        "violations": [dataclasses.asdict(v) for v in violations],
        "hits": [dataclasses.asdict(h) for h in hits],
    }
