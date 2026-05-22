"""REST endpoints for browsing style packs."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request

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
