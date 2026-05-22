"""REST endpoints for browsing style packs."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from pydantic import ValidationError as PydanticValidationError

router = APIRouter(prefix="/api/packs", tags=["packs"])


@router.get("")
def list_packs(request: Request) -> list[dict[str, Any]]:
    """Return summaries of all discovered packs."""
    store = request.app.state.pack_store
    return [
        {
            "slug": info.slug,
            "name": info.name,
            "version": info.version,
            "valid": info.valid,
            "error_count": len(info.errors),
        }
        for info in (store.get(slug) for slug in store.slugs())
        if info is not None
    ]


@router.get("/{slug}")
def get_pack(slug: str, request: Request) -> dict[str, Any]:
    """Pack detail: manifest summary + content counts + validation status."""
    store = request.app.state.pack_store
    info = store.get(slug)
    if info is None:
        raise HTTPException(status_code=404, detail=f"pack '{slug}' not found")

    detail: dict[str, Any] = {
        "slug": info.slug,
        "name": info.name,
        "version": info.version,
        "root_path": str(info.root_path),
        "valid": info.valid,
        "errors": [{"path": e.path, "message": e.message} for e in info.errors],
    }
    # If valid, include manifest counts
    from myvoice.validate import validate_pack

    result = validate_pack(info.root_path)
    if result.manifest is not None:
        m_obj = result.manifest
        detail["author"] = m_obj.pack.author
        detail["description"] = m_obj.pack.description
        detail["persona"] = {
            "identity": m_obj.persona.identity,
            "one_line": m_obj.persona.one_line,
        }
        detail["counts"] = {
            "banished_words": len(m_obj.banished.words),
            "banished_phrases": len(m_obj.banished.phrases),
            "permitted_exceptions": len(m_obj.banished.permitted_exceptions),
            "formats": len(m_obj.formats),
            "samples": len(m_obj.samples),
            "bios": len(m_obj.bios),
        }
    return detail


@router.get("/{slug}/manifest")
def get_manifest(slug: str, request: Request) -> dict[str, Any]:
    """Full manifest as JSON."""
    import yaml

    store = request.app.state.pack_store
    info = store.get(slug)
    if info is None:
        raise HTTPException(status_code=404, detail=f"pack '{slug}' not found")

    manifest_path = info.root_path / "stylepack.yaml"
    raw = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
    assert isinstance(raw, dict)
    return raw


@router.get("/{slug}/files/{path:path}", response_class=PlainTextResponse)
def get_pack_file(slug: str, path: str, request: Request) -> str:
    """Return the raw text content of a file within a pack."""

    store = request.app.state.pack_store
    info = store.get(slug)
    if info is None:
        raise HTTPException(status_code=404, detail=f"pack '{slug}' not found")

    # Path-traversal guard: resolve and require resulting path to be inside pack root.
    pack_root: Path = info.root_path.resolve()
    requested: Path = (pack_root / path).resolve()
    try:
        requested.relative_to(pack_root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="path escapes pack root") from exc

    if not requested.is_file():
        raise HTTPException(status_code=404, detail=f"file '{path}' not found in pack '{slug}'")

    return requested.read_text(encoding="utf-8")


class _WriteFileBody(BaseModel):
    content: str = Field(min_length=0)


def _atomic_write_text(path: Path, text: str) -> None:
    """Write `text` to `path` via a same-directory temp file + rename."""
    tmp = tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=str(path.parent),
        prefix=f".{path.name}.", suffix=".tmp", delete=False,
    )
    try:
        tmp.write(text)
        tmp.flush()
        os.fsync(tmp.fileno())
        tmp.close()
        os.replace(tmp.name, str(path))
    except Exception:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
        raise


@router.put("/{slug}/manifest")
def put_manifest(slug: str, body: dict[str, Any], request: Request) -> dict[str, Any]:
    """Validate + write the manifest. Re-loads the pack store on success."""
    from myvoice.packs.manifest import Manifest

    store = request.app.state.pack_store
    info = store.get(slug)
    if info is None:
        raise HTTPException(status_code=404, detail=f"pack '{slug}' not found")

    try:
        Manifest.model_validate(body)
    except PydanticValidationError as exc:
        errors = [
            {"path": ".".join(str(p) for p in e["loc"]), "message": e["msg"]}
            for e in exc.errors()
        ]
        raise HTTPException(status_code=422, detail={"errors": errors}) from exc

    manifest_path = info.root_path / "stylepack.yaml"
    _atomic_write_text(manifest_path, yaml.safe_dump(body, sort_keys=False))
    store.reload()
    new_info = store.get(slug)
    assert new_info is not None
    return {
        "slug": new_info.slug,
        "name": new_info.name,
        "version": new_info.version,
        "valid": new_info.valid,
        "error_count": len(new_info.errors),
    }


@router.put("/{slug}/files/{path:path}")
def put_pack_file(
    slug: str, path: str, body: _WriteFileBody, request: Request
) -> dict[str, Any]:
    """Atomic write of a content file; re-validates pack on success."""
    store = request.app.state.pack_store
    info = store.get(slug)
    if info is None:
        raise HTTPException(status_code=404, detail=f"pack '{slug}' not found")

    pack_root = info.root_path.resolve()
    requested = (pack_root / path).resolve()
    try:
        requested.relative_to(pack_root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="path escapes pack root") from exc

    requested.parent.mkdir(parents=True, exist_ok=True)
    _atomic_write_text(requested, body.content)
    store.reload()
    new_info = store.get(slug)
    assert new_info is not None
    return {
        "slug": new_info.slug,
        "valid": new_info.valid,
        "error_count": len(new_info.errors),
        "bytes_written": len(body.content),
    }
