"""POST /api/packs/{slug}/samples — coupled file + manifest write."""
from __future__ import annotations

import re
from typing import Any

import yaml
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api/packs", tags=["samples"])


class SaveSampleRequest(BaseModel):
    excerpt: str
    source_url: str | None = None
    note: str | None = None


@router.post("/{slug}/samples", status_code=201)
def create_sample(
    slug: str, req: SaveSampleRequest, request: Request
) -> dict[str, str]:
    store = request.app.state.pack_store
    info = store.get(slug)
    if info is None:
        raise HTTPException(
            404,
            detail={"error": {"code": "pack_not_found", "message": f"No pack '{slug}'"}},
        )

    manifest_path = info.root_path / "stylepack.yaml"
    data: dict[str, Any] = yaml.safe_load(manifest_path.read_text(encoding="utf-8")) or {}
    samples: list[dict[str, Any]] = list(data.get("samples") or [])

    # Compute next id (numeric, 2-digit zero-padded). Fall back to "01" if no numeric ids.
    nums = [
        int(s["id"])
        for s in samples
        if isinstance(s.get("id"), str) and re.fullmatch(r"\d+", s["id"])
    ]
    next_id = max(nums) + 1 if nums else 1
    id_str = f"{next_id:02d}"

    slug_part = _slugify(req.excerpt)[:40] or "sample"
    rel = f"samples/{id_str}-{slug_part}.md"
    file_path = info.root_path / rel
    file_path.parent.mkdir(parents=True, exist_ok=True)

    # Build file body
    body_parts: list[str] = []
    if req.source_url:
        body_parts.append(f"_Source: {req.source_url}_\n")
    if req.note:
        body_parts.append(f"_{req.note}_\n")
    if body_parts:
        body_parts.append("")
    body_parts.append(_blockquote(req.excerpt))
    file_path.write_text("\n".join(body_parts) + "\n", encoding="utf-8")

    # Update manifest samples list
    description = req.excerpt[:80] + ("…" if len(req.excerpt) > 80 else "")
    samples.append({"id": id_str, "file": rel, "description": description})
    data["samples"] = samples

    # Atomic manifest write via store (also refreshes in-memory entry)
    store.save_manifest(slug, data)

    return {"id": id_str, "file": rel}


def _slugify(text: str) -> str:
    """Lowercase, non-alphanumeric → '-', trim edges, max 40 chars."""
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", text.lower()).strip("-")
    return cleaned[:40]


def _blockquote(text: str) -> str:
    """Each non-empty line gets '> ' prefix; empty lines get '>'."""
    lines = []
    for line in text.splitlines():
        lines.append(f"> {line}" if line.strip() else ">")
    return "\n".join(lines)
