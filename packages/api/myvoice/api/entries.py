"""POST /api/packs/{slug}/{formats,bios} + DELETE /api/packs/{slug}/{formats,samples,bios}/{name}.

Mirrors the existing samples POST in api/samples.py — coupled file+manifest write.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/packs", tags=["entries"])

_NAME_PATTERN = r"^[a-z0-9][a-z0-9\-_]*$"


class _CreateFormatBody(BaseModel):
    name: str = Field(min_length=1, pattern=_NAME_PATTERN)
    description: str | None = None
    content: str | None = None


class _CreateBioBody(BaseModel):
    name: str = Field(min_length=1, pattern=_NAME_PATTERN)
    description: str | None = None
    max_chars: int | None = Field(default=None, gt=0)
    target_words: int | None = Field(default=None, gt=0)
    third_person: bool = False
    content: str | None = None


def _placeholder(name: str) -> str:
    return f"# {name}\n\n_TODO: fill this in._\n"


def _load_manifest(pack_root: Path) -> dict[str, Any]:
    manifest_path = pack_root / "stylepack.yaml"
    raw = yaml.safe_load(manifest_path.read_text(encoding="utf-8")) or {}
    if not isinstance(raw, dict):
        raise ValueError("manifest must be a mapping")
    return raw


def _names_in(entries: list[dict[str, Any]], key: str) -> set[str]:
    return {e[key] for e in entries if isinstance(e.get(key), str)}


def _conflict(kind: str, name: str) -> HTTPException:
    return HTTPException(
        status_code=409,
        detail={
            "error": {
                "code": "name_conflict",
                "message": f"A {kind[:-1]} named '{name}' already exists.",
            }
        },
    )


def _pack_not_found(slug: str) -> HTTPException:
    return HTTPException(
        status_code=404,
        detail={"error": {"code": "pack_not_found", "message": f"No pack '{slug}'"}},
    )


def _entry_not_found(kind: str, ident: str) -> HTTPException:
    return HTTPException(
        status_code=404,
        detail={
            "error": {
                "code": "entry_not_found",
                "message": f"No {kind[:-1]} '{ident}' in this pack.",
            }
        },
    )


@router.post("/{slug}/formats", status_code=201)
async def create_format(
    slug: str, req: _CreateFormatBody, request: Request
) -> dict[str, str]:
    store = request.app.state.pack_store
    info = store.get(slug)
    if info is None:
        raise _pack_not_found(slug)

    data = _load_manifest(info.root_path)
    existing: list[dict[str, Any]] = list(data.get("formats") or [])
    if req.name in _names_in(existing, "name"):
        raise _conflict("formats", req.name)

    rel = f"formats/{req.name}.md"
    file_path = info.root_path / rel
    file_path.parent.mkdir(parents=True, exist_ok=True)
    body = req.content if req.content and req.content.strip() else _placeholder(req.name)
    file_path.write_text(body, encoding="utf-8")

    entry: dict[str, Any] = {"name": req.name, "file": rel}
    if req.description is not None:
        entry["description"] = req.description
    existing.append(entry)
    data["formats"] = existing

    store.save_manifest(slug, data)
    await request.app.state.event_bus.emit(
        {"type": "pack:updated", "slug": slug, "files_changed": [rel]}
    )
    return {"name": req.name, "file": rel}


@router.post("/{slug}/bios", status_code=201)
async def create_bio(slug: str, req: _CreateBioBody, request: Request) -> dict[str, str]:
    store = request.app.state.pack_store
    info = store.get(slug)
    if info is None:
        raise _pack_not_found(slug)

    data = _load_manifest(info.root_path)
    existing: list[dict[str, Any]] = list(data.get("bios") or [])
    if req.name in _names_in(existing, "name"):
        raise _conflict("bios", req.name)

    rel = f"bios/{req.name}.md"
    file_path = info.root_path / rel
    file_path.parent.mkdir(parents=True, exist_ok=True)
    body = req.content if req.content and req.content.strip() else _placeholder(req.name)
    file_path.write_text(body, encoding="utf-8")

    entry: dict[str, Any] = {"name": req.name, "file": rel}
    if req.description is not None:
        entry["description"] = req.description
    if req.max_chars is not None:
        entry["max_chars"] = req.max_chars
    if req.target_words is not None:
        entry["target_words"] = req.target_words
    if req.third_person:
        entry["third_person"] = True
    existing.append(entry)
    data["bios"] = existing

    store.save_manifest(slug, data)
    await request.app.state.event_bus.emit(
        {"type": "pack:updated", "slug": slug, "files_changed": [rel]}
    )
    return {"name": req.name, "file": rel}


@router.delete("/{slug}/formats/{name}", status_code=204)
async def delete_format(slug: str, name: str, request: Request) -> None:
    await _delete_entry(slug, "formats", name, name_key="name", request=request)


@router.delete("/{slug}/bios/{name}", status_code=204)
async def delete_bio(slug: str, name: str, request: Request) -> None:
    await _delete_entry(slug, "bios", name, name_key="name", request=request)


@router.delete("/{slug}/samples/{sample_id}", status_code=204)
async def delete_sample(slug: str, sample_id: str, request: Request) -> None:
    await _delete_entry(slug, "samples", sample_id, name_key="id", request=request)


async def _delete_entry(
    slug: str, kind: str, ident: str, *, name_key: str, request: Request
) -> None:
    store = request.app.state.pack_store
    info = store.get(slug)
    if info is None:
        raise _pack_not_found(slug)

    data = _load_manifest(info.root_path)
    entries: list[dict[str, Any]] = list(data.get(kind) or [])
    target = next((e for e in entries if e.get(name_key) == ident), None)
    if target is None:
        raise _entry_not_found(kind, ident)

    file_rel = target.get("file")
    data[kind] = [e for e in entries if e is not target]
    store.save_manifest(slug, data)

    if isinstance(file_rel, str):
        file_path = info.root_path / file_rel
        try:
            file_path.unlink(missing_ok=True)
        except OSError:
            logger.warning(
                "Could not unlink %s — manifest entry removed, orphan file remains",
                file_path,
            )

    await request.app.state.event_bus.emit(
        {"type": "pack:updated", "slug": slug, "files_changed": [file_rel] if file_rel else []}
    )
