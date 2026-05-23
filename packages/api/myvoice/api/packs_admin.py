"""POST /api/packs (create) + DELETE /api/packs/{slug} (soft-delete)."""
from __future__ import annotations

import shutil
from datetime import datetime, timezone
from typing import Any

import yaml
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from myvoice.packs.templates import locate_template, resolve_trash_root, resolve_write_root
from myvoice.validate import validate_pack

router = APIRouter(prefix="/api/packs", tags=["packs-admin"])


class CreatePackRequest(BaseModel):
    slug: str = Field(min_length=1, pattern=r"^[a-z][a-z0-9\-_]*$")
    name: str = Field(min_length=1)
    author: str = Field(min_length=1)
    persona_identity: str = Field(min_length=1)
    persona_one_line: str = Field(min_length=1)
    version: str = "0.1.0"
    description: str | None = None


@router.post("", status_code=201)
async def create_pack(req: CreatePackRequest, request: Request) -> dict[str, Any]:
    write_root = resolve_write_root()
    target = write_root / req.slug
    if target.exists():
        raise HTTPException(
            status_code=409,
            detail={
                "error": {
                    "code": "slug_conflict",
                    "message": f"A pack with slug '{req.slug}' already exists.",
                    "details": {"slug": req.slug, "path": str(target)},
                }
            },
        )
    try:
        template = locate_template()
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "template_missing",
                    "message": str(e),
                }
            },
        ) from e

    write_root.mkdir(parents=True, exist_ok=True)
    shutil.copytree(template, target)

    # Patch manifest
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
    manifest_path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")

    # Re-index
    store = request.app.state.pack_store
    store.reload()

    # Validate (defensive — _template is CI-validated)
    result = validate_pack(target)
    if result.errors:
        # Rollback: remove the broken copy
        shutil.rmtree(target, ignore_errors=True)
        store.reload()
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "manifest_invalid",
                    "message": "Created pack failed validation",
                    "details": {
                        "errors": [
                            {"path": e.path, "message": e.message} for e in result.errors
                        ]
                    },
                }
            },
        )

    # Emit event — await directly since we're in an async route
    bus = request.app.state.event_bus
    await bus.emit(
        {
            "type": "pack:created",
            "slug": req.slug,
            "name": req.name,
            "path": str(target),
        }
    )

    # Return summary
    info = store.get(req.slug)
    assert info is not None
    return {
        "slug": info.slug,
        "name": info.name,
        "version": info.version,
        "valid": info.valid,
        "error_count": len(info.errors),
    }


@router.delete("/{slug}", status_code=204)
async def delete_pack(slug: str, request: Request) -> None:
    store = request.app.state.pack_store
    info = store.get(slug)
    if info is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error": {
                    "code": "pack_not_found",
                    "message": f"No pack with slug '{slug}'.",
                }
            },
        )

    trash_root = resolve_trash_root()
    trash_root.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")  # noqa: UP017
    trash_target = trash_root / f"{ts}-{slug}"

    try:
        shutil.move(str(info.root_path), str(trash_target))
    except OSError:
        # Cross-device fallback
        shutil.copytree(info.root_path, trash_target)
        shutil.rmtree(info.root_path, ignore_errors=True)

    store.rescan_one(slug)

    bus = request.app.state.event_bus
    await bus.emit({"type": "pack:deleted", "slug": slug})
