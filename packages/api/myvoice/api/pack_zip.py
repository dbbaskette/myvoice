"""GET /api/packs/{slug}/export + POST /api/packs/import."""
from __future__ import annotations

import io
import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from myvoice.packs.templates import resolve_write_root
from myvoice.validate import validate_pack

router = APIRouter(tags=["pack-zip"])

_MAX_UPLOAD_BYTES = 50 * 1024 * 1024

_SKIP_NAMES = {".DS_Store", "__pycache__"}


def _should_skip(rel_parts: tuple[str, ...]) -> bool:
    for part in rel_parts:
        if part in _SKIP_NAMES or part.endswith(".pyc"):
            return True
        if part.startswith(".") and part not in {".", ".."}:
            return True
    return False


def _zip_pack(pack_root: Path, dest_zip: Path, inner_name: str) -> None:
    """Write pack_root contents into dest_zip, nested under inner_name/."""
    with zipfile.ZipFile(dest_zip, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for path in pack_root.rglob("*"):
            if not path.is_file():
                continue
            rel = path.relative_to(pack_root)
            if _should_skip(rel.parts):
                continue
            z.write(path, arcname=f"{inner_name}/{rel}")


@router.get("/api/packs/{slug}/export")
def export_pack(slug: str, request: Request) -> FileResponse:
    store = request.app.state.pack_store
    info = store.get(slug)
    if info is None:
        raise HTTPException(
            404,
            detail={"error": {"code": "pack_not_found", "message": f"No pack '{slug}'"}},
        )

    tmp_dir = Path(tempfile.mkdtemp(prefix="myvoice-export-"))
    zip_path = tmp_dir / f"pack-{info.slug}-{info.version}.zip"
    try:
        _zip_pack(info.root_path, zip_path, inner_name=info.slug)
    except Exception:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise

    def _cleanup() -> None:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    return FileResponse(
        path=zip_path,
        media_type="application/zip",
        filename=zip_path.name,
        background=BackgroundTask(_cleanup),
    )


@router.post("/api/packs/import", status_code=201)
async def import_pack(file: UploadFile, request: Request) -> dict[str, Any]:
    raw = await file.read()
    if len(raw) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            413,
            detail={"error": {"code": "file_too_large", "message": "Upload exceeds 50 MB."}},
        )
    try:
        z = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile as e:
        raise HTTPException(
            422,
            detail={"error": {"code": "invalid_pack", "message": f"Not a valid zip: {e}"}},
        ) from e

    with tempfile.TemporaryDirectory(prefix="myvoice-import-") as tmp:
        tmp_root = Path(tmp)
        z.extractall(tmp_root)

        # Find inner pack root: one subdir with stylepack.yaml at the top level
        candidates = [
            d for d in tmp_root.iterdir()
            if d.is_dir() and (d / "stylepack.yaml").is_file()
        ]
        if len(candidates) != 1:
            raise HTTPException(
                422,
                detail={
                    "error": {
                        "code": "invalid_pack",
                        "message": (
                            "Zip must contain exactly one top-level directory "
                            "with a stylepack.yaml. Found "
                            f"{len(candidates)}."
                        ),
                    }
                },
            )
        inner = candidates[0]

        manifest_data = yaml.safe_load((inner / "stylepack.yaml").read_text(encoding="utf-8")) or {}
        pack_slug = (manifest_data.get("pack") or {}).get("slug")
        if not isinstance(pack_slug, str) or not pack_slug:
            raise HTTPException(
                422,
                detail={
                    "error": {
                        "code": "invalid_pack",
                        "message": "Manifest missing pack.slug.",
                    }
                },
            )

        write_root = resolve_write_root()
        target = write_root / pack_slug
        if target.exists():
            raise HTTPException(
                409,
                detail={
                    "error": {
                        "code": "slug_conflict",
                        "message": f"A pack with slug '{pack_slug}' already exists.",
                        "details": {"slug": pack_slug, "path": str(target)},
                    }
                },
            )

        write_root.mkdir(parents=True, exist_ok=True)
        shutil.move(str(inner), str(target))

        store = request.app.state.pack_store
        store.reload()

        # Validate defensively; rollback on failure
        result = validate_pack(target)
        if result.errors:
            shutil.rmtree(target, ignore_errors=True)
            store.reload()
            raise HTTPException(
                500,
                detail={
                    "error": {
                        "code": "manifest_invalid",
                        "message": "Imported pack failed validation",
                        "details": {"errors": [
                            {"path": e.path, "message": e.message} for e in result.errors
                        ]},
                    }
                },
            )

    bus = request.app.state.event_bus
    await bus.emit({"type": "pack:created", "slug": pack_slug, "path": str(target)})

    info = store.get(pack_slug)
    assert info is not None
    return {
        "slug": info.slug,
        "name": info.name,
        "version": info.version,
        "valid": info.valid,
        "error_count": len(info.errors),
    }
