"""POST /api/extract + POST /api/packs/from-analysis."""
from __future__ import annotations

import base64
import re
import shutil
from typing import Any

import yaml
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel, Field

from myvoice.extractor.models import AnalysisResult, UploadedFile
from myvoice.extractor.pipeline import run_extract_job
from myvoice.jobs.models import JobType
from myvoice.packs.templates import locate_template, resolve_write_root
from myvoice.validate import validate_pack

router = APIRouter(tags=["extract"])

_MAX_BYTES_PER_FILE = 5 * 1024 * 1024
_MAX_FILES = 10
_MAX_TOTAL_BYTES = 50 * 1024 * 1024


class _UploadIn(BaseModel):
    name: str
    content_b64: str
    mime: str = "application/octet-stream"


class _PackMeta(BaseModel):
    slug: str | None = None
    name: str | None = None
    author: str | None = None


class ExtractRequest(BaseModel):
    urls: list[str] = Field(default_factory=list)
    files: list[_UploadIn] = Field(default_factory=list)
    pack_meta: _PackMeta = Field(default_factory=_PackMeta)
    provider: str
    model: str


@router.post("/api/extract", status_code=202)
async def start_extract(
    req: ExtractRequest, request: Request, background_tasks: BackgroundTasks,
) -> dict[str, str]:
    if not req.urls and not req.files:
        raise HTTPException(
            400,
            detail={"error": {"code": "extract_invalid_request",
                              "message": "At least one URL or file is required."}},
        )
    if len(req.files) > _MAX_FILES:
        raise HTTPException(
            413,
            detail={"error": {"code": "too_many_files",
                              "message": f"At most {_MAX_FILES} files."}},
        )
    total = 0
    uploads: list[UploadedFile] = []
    for f in req.files:
        try:
            raw = base64.b64decode(f.content_b64, validate=True)
        except Exception as e:
            raise HTTPException(
                400,
                detail={"error": {"code": "extract_invalid_request",
                                  "message": f"Invalid base64 for {f.name}: {e}"}},
            ) from e
        if len(raw) > _MAX_BYTES_PER_FILE:
            raise HTTPException(
                413,
                detail={"error": {"code": "file_too_large",
                                  "message": f"{f.name} exceeds 5 MB."}},
            )
        total += len(raw)
        uploads.append(UploadedFile(name=f.name, content_type=f.mime, raw_bytes=raw))
    if total > _MAX_TOTAL_BYTES:
        raise HTTPException(
            413,
            detail={"error": {"code": "file_too_large",
                              "message": "Total upload exceeds 50 MB."}},
        )

    cfg = request.app.state.config
    prov_cfg = getattr(cfg.providers, req.provider, None)
    if prov_cfg is None or not prov_cfg.api_key:
        raise HTTPException(
            400,
            detail={"error": {"code": "provider_missing_key",
                              "message": f"No API key for {req.provider}",
                              "hint": "Add the key in Settings."}},
        )

    reg = request.app.state.job_registry
    job = await reg.create(JobType.EXTRACT)
    background_tasks.add_task(
        run_extract_job, job.id, reg,
        urls=list(req.urls), uploads=uploads,
        provider_name=req.provider, api_key=prov_cfg.api_key, model=req.model,
    )
    return {"job_id": job.id}


class FromAnalysisRequest(BaseModel):
    slug: str = Field(min_length=1, pattern=r"^[a-z][a-z0-9\-_]*$")
    name: str = Field(min_length=1)
    author: str = Field(min_length=1)
    persona_identity: str = Field(min_length=1)
    persona_one_line: str = Field(min_length=1)
    version: str = "0.1.0"
    description: str | None = None
    proposal: AnalysisResult
    selected_sample_indexes: list[int] = Field(default_factory=list)


@router.post("/api/packs/from-analysis", status_code=201)
async def create_from_analysis(
    req: FromAnalysisRequest, request: Request,
) -> dict[str, Any]:
    write_root = resolve_write_root()
    target = write_root / req.slug
    if target.exists():
        raise HTTPException(
            409,
            detail={"error": {"code": "slug_conflict",
                              "message": f"A pack with slug '{req.slug}' already exists.",
                              "details": {"slug": req.slug, "path": str(target)}}},
        )
    template = locate_template()
    write_root.mkdir(parents=True, exist_ok=True)
    shutil.copytree(template, target)

    # Patch manifest from proposal
    manifest_path = target / "stylepack.yaml"
    data = yaml.safe_load(manifest_path.read_text(encoding="utf-8")) or {}
    data["pack"]["slug"] = req.slug
    data["pack"]["name"] = req.name
    data["pack"]["author"] = req.author
    data["pack"]["version"] = req.version
    if req.description is None:
        data["pack"].pop("description", None)
    else:
        data["pack"]["description"] = req.description
    data["persona"]["identity"] = req.persona_identity
    data["persona"]["one_line"] = req.persona_one_line
    data["banished"]["words"] = sorted({w.word.lower() for w in req.proposal.banished_words})
    data["banished"]["phrases"] = [p.phrase for p in req.proposal.banished_phrases]
    data["banished"]["permitted_exceptions"] = [
        {"term": e.term, "reason": e.reason} for e in req.proposal.permitted_exceptions
    ]
    data["pop_culture"]["allowed"] = list(req.proposal.pop_culture_allowed)
    data["pop_culture"]["banned"] = list(req.proposal.pop_culture_banned)

    # Write selected samples
    selected = [req.proposal.samples[i] for i in req.selected_sample_indexes
                if 0 <= i < len(req.proposal.samples)]
    samples_meta: list[dict[str, str]] = []
    for idx, sample in enumerate(selected, start=1):
        sid = f"{idx:02d}"
        slug_part = _slugify(sample.excerpt)[:40] or "sample"
        rel = f"samples/{sid}-{slug_part}.md"
        file_path = target / rel
        file_path.parent.mkdir(parents=True, exist_ok=True)
        body_parts: list[str] = []
        if sample.source_location:
            body_parts.append(f"_Source: {sample.source_location}_\n")
        if sample.why:
            body_parts.append(f"_{sample.why}_\n")
        if body_parts:
            body_parts.append("")
        body_parts.append(_blockquote(sample.excerpt))
        file_path.write_text("\n".join(body_parts) + "\n", encoding="utf-8")
        samples_meta.append({"id": sid, "file": rel, "description": sample.why or ""})
    data["samples"] = samples_meta

    # Append style_guide_markdown to style-guide.md
    if req.proposal.style_guide_markdown:
        sg = target / "style-guide.md"
        existing = sg.read_text(encoding="utf-8")
        sg.write_text(
            existing.rstrip() + "\n\n---\n\n" + req.proposal.style_guide_markdown + "\n",
            encoding="utf-8",
        )

    # Atomic manifest write + reload
    manifest_path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")
    store = request.app.state.pack_store
    store.reload()

    # Validate defensively
    result = validate_pack(target)
    if result.errors:
        shutil.rmtree(target, ignore_errors=True)
        store.reload()
        raise HTTPException(
            500,
            detail={"error": {"code": "manifest_invalid",
                              "message": "Created pack failed validation",
                              "details": {"errors": [
                                  {"path": e.path, "message": e.message} for e in result.errors
                              ]}}},
        )

    bus = request.app.state.event_bus
    await bus.emit(
        {"type": "pack:created", "slug": req.slug, "name": req.name, "path": str(target)}
    )

    info = store.get(req.slug)
    assert info is not None
    return {
        "slug": info.slug,
        "name": info.name,
        "version": info.version,
        "valid": info.valid,
        "error_count": len(info.errors),
    }


def _slugify(text: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", text.lower()).strip("-")
    return cleaned[:60]


def _blockquote(text: str) -> str:
    return "\n".join(f"> {line}" if line.strip() else ">" for line in text.splitlines())
