# Phase 7 Implementation Plan — Entries · Export · Library API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close three deferred items — add/remove formats/samples/bios entries from UI, pack zip export+import, and a small public library API.

**Architecture:** Mirror Phase 4's coupled file+manifest write pattern for entry POSTs; reuse Phase 5's PackStore + atomic writes. Zip export streams a `shutil.make_archive` result; import unzips + validates + moves. Library API is a re-export shim in `myvoice/__init__.py` plus a smoke test.

**Tech Stack:** existing — FastAPI, Pydantic v2, React 18, Tiptap, existing JobRegistry / EventBus / PackStore. Adds: `zipfile` (stdlib), `python-multipart` (probably already pulled in by FastAPI).

**Spec:** [`docs/superpowers/specs/2026-05-26-phase-7-entries-export-library-design.md`](../specs/2026-05-26-phase-7-entries-export-library-design.md)

**Branch:** All work on `phase-7-entries-export-library` (already checked out). 6 commits, one per task. Open one PR at the end.

---

## File Structure

### New backend
```
packages/api/myvoice/api/
  entries.py        # POST /api/packs/{slug}/formats + DELETE for formats/samples/bios
  pack_zip.py       # GET /api/packs/{slug}/export + POST /api/packs/import
```

### New backend tests
```
packages/api/tests/api/
  test_formats_route.py
  test_bios_route.py
  test_samples_delete.py
  test_pack_zip_export.py
  test_pack_zip_import.py
packages/api/tests/
  test_public_api.py
```

### Modified backend
```
packages/api/myvoice/__init__.py            # re-export public surface
packages/api/myvoice/server.py              # mount new routers
packages/api/myvoice/api/samples.py         # add DELETE /{slug}/samples/{id}
```

### New frontend
```
packages/web/src/api/
  entries.ts        # createFormat, createBio, deleteEntry
  pack_zip.ts       # exportPackUrl, importPack
packages/web/src/components/manifest/
  NewEntryDialog.tsx
  DeleteEntryDialog.tsx
packages/web/src/components/packs/
  ImportPackDialog.tsx
```

### New frontend tests
```
packages/web/tests/components/manifest/
  NewEntryDialog.test.tsx
  DeleteEntryDialog.test.tsx
packages/web/tests/components/packs/
  ImportPackDialog.test.tsx
```

### Modified frontend
```
packages/web/src/routes/PackDetailPage.tsx     # FileGroup gains + New button + Delete header button
packages/web/src/components/MarkdownEditor.tsx # Delete button in header (passed via optional onDelete prop)
packages/web/src/components/PackList.tsx       # Import pack button at top
packages/web/src/components/manifest/ManifestForm.tsx   # Export pack button in a Distribute section
```

### Modified docs
```
README.md                                # "Using myvoice as a library" section
```

### New e2e
```
e2e/entries-and-zip.spec.ts
```

---

## Task 1 — Backend: entry POST/DELETE routes

**Files:**
- Create: `packages/api/myvoice/api/entries.py`
- Modify: `packages/api/myvoice/api/samples.py` (add DELETE handler)
- Modify: `packages/api/myvoice/server.py` (mount entries router)
- Create: `packages/api/tests/api/test_formats_route.py`
- Create: `packages/api/tests/api/test_bios_route.py`
- Create: `packages/api/tests/api/test_samples_delete.py`

- [ ] **Step 1.1: Write failing formats tests**

`packages/api/tests/api/test_formats_route.py`:
```python
"""POST /api/packs/{slug}/formats + DELETE /api/packs/{slug}/formats/{name}."""
from __future__ import annotations

import shutil
from collections.abc import Iterator
from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

from myvoice.server import create_app

_REPO_ROOT = Path(__file__).resolve().parents[4]
_DAN_SRC = _REPO_ROOT / "packs" / "dan"


@pytest.fixture
def entries_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[tuple[TestClient, Path]]:
    packs_root = tmp_path / "packs"
    packs_root.mkdir()
    shutil.copytree(_DAN_SRC, packs_root / "dan")
    monkeypatch.setenv("MYVOICE_PACKS_ROOT", str(packs_root))
    monkeypatch.setenv("MYVOICE_CONFIG_PATH", str(tmp_path / "config.yaml"))
    app = create_app()
    with TestClient(app) as c:
        yield c, packs_root


def test_create_format_success(entries_client: tuple[TestClient, Path]) -> None:
    client, packs_root = entries_client
    r = client.post(
        "/api/packs/dan/formats",
        json={"name": "linkedin-post-2", "description": "second LinkedIn template", "content": "# Hook\n\nBody."},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "linkedin-post-2"
    assert body["file"] == "formats/linkedin-post-2.md"
    # File on disk
    file_path = packs_root / "dan" / "formats" / "linkedin-post-2.md"
    assert file_path.is_file()
    assert "Hook" in file_path.read_text()
    # Manifest updated
    manifest = yaml.safe_load((packs_root / "dan" / "stylepack.yaml").read_text())
    names = [f["name"] for f in manifest.get("formats", [])]
    assert "linkedin-post-2" in names


def test_create_format_conflict_409(entries_client: tuple[TestClient, Path]) -> None:
    client, _ = entries_client
    payload = {"name": "duplicate-fmt", "content": "x"}
    r1 = client.post("/api/packs/dan/formats", json=payload)
    assert r1.status_code == 201
    r2 = client.post("/api/packs/dan/formats", json=payload)
    assert r2.status_code == 409
    assert r2.json()["detail"]["error"]["code"] == "name_conflict"


def test_create_format_bad_name_422(entries_client: tuple[TestClient, Path]) -> None:
    client, _ = entries_client
    r = client.post("/api/packs/dan/formats", json={"name": "Bad Name", "content": "x"})
    assert r.status_code == 422


def test_create_format_default_content_is_placeholder(entries_client: tuple[TestClient, Path]) -> None:
    """No content provided → placeholder so the file is non-empty (spec requirement)."""
    client, packs_root = entries_client
    r = client.post("/api/packs/dan/formats", json={"name": "empty-test"})
    assert r.status_code == 201
    file_path = packs_root / "dan" / "formats" / "empty-test.md"
    body = file_path.read_text()
    assert body.strip(), "format file must be non-empty"


def test_delete_format_success(entries_client: tuple[TestClient, Path]) -> None:
    client, packs_root = entries_client
    # Create first to ensure idempotency
    client.post("/api/packs/dan/formats", json={"name": "to-delete", "content": "x"})
    file_path = packs_root / "dan" / "formats" / "to-delete.md"
    assert file_path.is_file()
    # Delete
    r = client.delete("/api/packs/dan/formats/to-delete")
    assert r.status_code == 204
    assert not file_path.exists()
    manifest = yaml.safe_load((packs_root / "dan" / "stylepack.yaml").read_text())
    names = [f["name"] for f in manifest.get("formats", [])]
    assert "to-delete" not in names


def test_delete_format_not_found_404(entries_client: tuple[TestClient, Path]) -> None:
    client, _ = entries_client
    r = client.delete("/api/packs/dan/formats/no-such-format")
    assert r.status_code == 404
```

Run: `uv run pytest packages/api/tests/api/test_formats_route.py -v`
Expected: FAIL — endpoint missing.

- [ ] **Step 1.2: Write failing bios tests**

`packages/api/tests/api/test_bios_route.py`:
```python
"""POST /api/packs/{slug}/bios + DELETE /api/packs/{slug}/bios/{name}."""
from __future__ import annotations

import shutil
from collections.abc import Iterator
from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

from myvoice.server import create_app

_REPO_ROOT = Path(__file__).resolve().parents[4]
_DAN_SRC = _REPO_ROOT / "packs" / "dan"


@pytest.fixture
def bios_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[tuple[TestClient, Path]]:
    packs_root = tmp_path / "packs"
    packs_root.mkdir()
    shutil.copytree(_DAN_SRC, packs_root / "dan")
    monkeypatch.setenv("MYVOICE_PACKS_ROOT", str(packs_root))
    monkeypatch.setenv("MYVOICE_CONFIG_PATH", str(tmp_path / "config.yaml"))
    app = create_app()
    with TestClient(app) as c:
        yield c, packs_root


def test_create_bio_success_with_metadata(bios_client: tuple[TestClient, Path]) -> None:
    client, packs_root = bios_client
    r = client.post(
        "/api/packs/dan/bios",
        json={
            "name": "podcast-guest",
            "description": "Bio used for podcast intros",
            "max_chars": 600,
            "third_person": True,
            "content": "Dan Baskette is…",
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "podcast-guest"
    assert body["file"] == "bios/podcast-guest.md"
    manifest = yaml.safe_load((packs_root / "dan" / "stylepack.yaml").read_text())
    entry = next(b for b in manifest["bios"] if b["name"] == "podcast-guest")
    assert entry["max_chars"] == 600
    assert entry["third_person"] is True
    assert "target_words" not in entry  # None values omitted


def test_create_bio_conflict_409(bios_client: tuple[TestClient, Path]) -> None:
    client, _ = bios_client
    # twitter already exists in the dan pack
    r = client.post("/api/packs/dan/bios", json={"name": "twitter", "content": "x"})
    assert r.status_code == 409


def test_delete_bio_success(bios_client: tuple[TestClient, Path]) -> None:
    client, packs_root = bios_client
    r = client.delete("/api/packs/dan/bios/twitter")
    assert r.status_code == 204
    manifest = yaml.safe_load((packs_root / "dan" / "stylepack.yaml").read_text())
    names = [b["name"] for b in manifest.get("bios", [])]
    assert "twitter" not in names
    # File gone from disk
    assert not (packs_root / "dan" / "bios" / "twitter.md").exists()


def test_delete_bio_not_found_404(bios_client: tuple[TestClient, Path]) -> None:
    client, _ = bios_client
    r = client.delete("/api/packs/dan/bios/no-such-bio")
    assert r.status_code == 404
```

- [ ] **Step 1.3: Write failing sample-delete tests**

`packages/api/tests/api/test_samples_delete.py`:
```python
"""DELETE /api/packs/{slug}/samples/{id}."""
from __future__ import annotations

import shutil
from collections.abc import Iterator
from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

from myvoice.server import create_app

_REPO_ROOT = Path(__file__).resolve().parents[4]
_DAN_SRC = _REPO_ROOT / "packs" / "dan"


@pytest.fixture
def samples_delete_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[tuple[TestClient, Path]]:
    packs_root = tmp_path / "packs"
    packs_root.mkdir()
    shutil.copytree(_DAN_SRC, packs_root / "dan")
    monkeypatch.setenv("MYVOICE_PACKS_ROOT", str(packs_root))
    monkeypatch.setenv("MYVOICE_CONFIG_PATH", str(tmp_path / "config.yaml"))
    app = create_app()
    with TestClient(app) as c:
        yield c, packs_root


def test_delete_sample_success(samples_delete_client: tuple[TestClient, Path]) -> None:
    client, packs_root = samples_delete_client
    # Create first
    r1 = client.post("/api/packs/dan/samples", json={"excerpt": "Sample to delete.", "source_url": None, "note": None})
    assert r1.status_code == 201
    sample_id = r1.json()["id"]
    file_rel = r1.json()["file"]
    assert (packs_root / "dan" / file_rel).exists()

    r2 = client.delete(f"/api/packs/dan/samples/{sample_id}")
    assert r2.status_code == 204
    assert not (packs_root / "dan" / file_rel).exists()
    manifest = yaml.safe_load((packs_root / "dan" / "stylepack.yaml").read_text())
    ids = [s["id"] for s in manifest.get("samples", [])]
    assert sample_id not in ids


def test_delete_sample_not_found_404(samples_delete_client: tuple[TestClient, Path]) -> None:
    client, _ = samples_delete_client
    r = client.delete("/api/packs/dan/samples/99")
    assert r.status_code == 404
```

Run: `uv run pytest packages/api/tests/api/test_bios_route.py packages/api/tests/api/test_samples_delete.py -v`
Expected: FAIL.

- [ ] **Step 1.4: Implement entries.py**

`packages/api/myvoice/api/entries.py`:
```python
"""POST /api/packs/{slug}/{formats,bios} + DELETE /api/packs/{slug}/{formats,samples,bios}/{name}.

Mirrors the existing samples POST in api/samples.py — coupled file+manifest write.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

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
            pass  # manifest no longer references it; orphan is harmless

    await request.app.state.event_bus.emit(
        {"type": "pack:updated", "slug": slug, "files_changed": [file_rel] if file_rel else []}
    )
```

- [ ] **Step 1.5: Mount the router**

Edit `packages/api/myvoice/server.py` `create_app()` — add the import alongside other `from myvoice.api.* import router as *_router` lines and include it:

```python
    from myvoice.api.entries import router as entries_router
    # ...
    app.include_router(entries_router)
```

Add after `app.include_router(samples_router)`.

- [ ] **Step 1.6: Run tests + commit**

```bash
cd /Users/dbbaskette/Projects/myvoice
uv run pytest packages/api/tests/api/test_formats_route.py packages/api/tests/api/test_bios_route.py packages/api/tests/api/test_samples_delete.py -v
uv run pytest packages/api/tests/ -q
uv run ruff check packages/api
uv run mypy packages/api
```

All must pass. Then:

```bash
git add packages/api
git commit -m "$(cat <<'EOF'
feat(api): entry POST/DELETE routes for formats/samples/bios

POST /api/packs/{slug}/formats and POST /api/packs/{slug}/bios mirror
the Phase 4 samples POST pattern: coupled file + manifest write,
409 on name conflict, name regex ^[a-z0-9][a-z0-9-_]*$, default
placeholder content if none provided so the file is non-empty.

DELETE /api/packs/{slug}/{formats,samples,bios}/{ident} removes the
manifest entry, then deletes the file (missing-ok). 404 if entry
isn't found. All routes emit pack:updated on success.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Frontend: + New / Delete inside sub-tabs

**Files:**
- Create: `packages/web/src/api/entries.ts`
- Create: `packages/web/src/components/manifest/NewEntryDialog.tsx`
- Create: `packages/web/src/components/manifest/DeleteEntryDialog.tsx`
- Create: `packages/web/tests/components/manifest/NewEntryDialog.test.tsx`
- Create: `packages/web/tests/components/manifest/DeleteEntryDialog.test.tsx`
- Modify: `packages/web/src/routes/PackDetailPage.tsx` (FileGroup gets + New + Delete wiring)
- Modify: `packages/web/src/components/MarkdownEditor.tsx` (accept optional `onDelete` prop, render Delete button in header)

- [ ] **Step 2.1: API client**

`packages/web/src/api/entries.ts`:
```typescript
import { apiFetch } from "./client";

export interface CreateFormatRequest {
  name: string;
  description?: string;
  content?: string;
}

export interface CreateBioRequest {
  name: string;
  description?: string;
  max_chars?: number;
  target_words?: number;
  third_person?: boolean;
  content?: string;
}

export interface CreateSampleRequest {
  excerpt: string;
  source_url?: string;
  note?: string;
}

export type EntryKind = "formats" | "samples" | "bios";

export async function createFormat(slug: string, req: CreateFormatRequest): Promise<{ name: string; file: string }> {
  return apiFetch(`/api/packs/${encodeURIComponent(slug)}/formats`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function createBio(slug: string, req: CreateBioRequest): Promise<{ name: string; file: string }> {
  return apiFetch(`/api/packs/${encodeURIComponent(slug)}/bios`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// createSample re-uses the existing /api/packs/{slug}/samples endpoint from Phase 4.
// Re-export here for one-stop entry creation.
export async function createSample(slug: string, req: CreateSampleRequest): Promise<{ id: string; file: string }> {
  return apiFetch(`/api/packs/${encodeURIComponent(slug)}/samples`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function deleteEntry(slug: string, kind: EntryKind, ident: string): Promise<void> {
  const res = await fetch(`/api/packs/${encodeURIComponent(slug)}/${kind}/${encodeURIComponent(ident)}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`HTTP ${res.status} deleting ${kind}/${ident}`);
  }
}
```

- [ ] **Step 2.2: NewEntryDialog component**

`packages/web/src/components/manifest/NewEntryDialog.tsx`:
```tsx
import { type FormEvent, useState } from "react";

import { createBio, createFormat, createSample, type EntryKind } from "../../api/entries";

const NAME_PATTERN = /^[a-z0-9][a-z0-9\-_]*$/;

interface NewEntryDialogProps {
  slug: string;
  kind: EntryKind;
  open: boolean;
  onClose: () => void;
  onCreated: (file: string) => void;
}

export function NewEntryDialog({ slug, kind, open, onClose, onCreated }: NewEntryDialogProps): JSX.Element | null {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [note, setNote] = useState("");
  const [maxChars, setMaxChars] = useState("");
  const [targetWords, setTargetWords] = useState("");
  const [thirdPerson, setThirdPerson] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const reset = () => {
    setName(""); setDescription(""); setContent("");
    setExcerpt(""); setSourceUrl(""); setNote("");
    setMaxChars(""); setTargetWords(""); setThirdPerson(false);
    setNameError(null); setError(null);
  };

  const close = () => { reset(); onClose(); };

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setSubmitting(true);
    setNameError(null);
    setError(null);
    try {
      let file: string;
      if (kind === "formats") {
        const r = await createFormat(slug, {
          name,
          description: description.trim() || undefined,
          content: content.trim() || undefined,
        });
        file = r.file;
      } else if (kind === "bios") {
        const r = await createBio(slug, {
          name,
          description: description.trim() || undefined,
          max_chars: maxChars ? parseInt(maxChars, 10) : undefined,
          target_words: targetWords ? parseInt(targetWords, 10) : undefined,
          third_person: thirdPerson,
          content: content.trim() || undefined,
        });
        file = r.file;
      } else {
        const r = await createSample(slug, {
          excerpt,
          source_url: sourceUrl.trim() || undefined,
          note: note.trim() || undefined,
        });
        file = r.file;
      }
      onCreated(file);
      close();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("409") || msg.toLowerCase().includes("conflict")) {
        if (kind === "samples") {
          setError("Could not create sample. Try again.");
        } else {
          setNameError(`A ${kind.slice(0, -1)} with this name already exists.`);
        }
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const nameValid = kind === "samples" ? true : NAME_PATTERN.test(name);
  const canSubmit = !submitting && (
    kind === "samples" ? excerpt.trim().length > 0
                       : nameValid && name.trim().length > 0
  );

  const title = kind === "formats" ? "New format" : kind === "bios" ? "New bio" : "New sample";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={close}
      onKeyDown={(e) => { if (e.key === "Escape") close(); }}
      role="presentation"
    >
      <dialog
        open
        className="bg-slate-900 border border-slate-700 rounded-lg p-6 w-[480px] max-w-[90vw] space-y-4 m-0"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        aria-label={title}
      >
        <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
        <form onSubmit={submit} className="space-y-4">
          {kind !== "samples" && (
            <Field label="Name" htmlFor="ne-name" hint="lowercase, hyphens, no spaces" error={nameError}>
              <input id="ne-name" type="text" value={name} onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100" />
              {!nameValid && name !== "" && (
                <p className="text-amber-400 text-xs mt-1">Must match ^[a-z0-9][a-z0-9-_]*$</p>
              )}
            </Field>
          )}
          {kind !== "samples" && (
            <Field label="Description (optional)" htmlFor="ne-desc">
              <input id="ne-desc" type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100" />
            </Field>
          )}
          {kind === "bios" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="max_chars" htmlFor="ne-mc">
                <input id="ne-mc" type="number" min={1} value={maxChars} onChange={(e) => setMaxChars(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100" />
              </Field>
              <Field label="target_words" htmlFor="ne-tw">
                <input id="ne-tw" type="number" min={1} value={targetWords} onChange={(e) => setTargetWords(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100" />
              </Field>
              <div className="col-span-2 flex items-center gap-2">
                <input id="ne-tp" type="checkbox" checked={thirdPerson} onChange={(e) => setThirdPerson(e.target.checked)} />
                <label htmlFor="ne-tp" className="text-sm text-slate-200">Third person</label>
              </div>
            </div>
          )}
          {kind === "samples" && (
            <>
              <Field label="Excerpt" htmlFor="ne-excerpt">
                <textarea id="ne-excerpt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)}
                  className="w-full h-32 bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100" />
              </Field>
              <Field label="Source URL (optional)" htmlFor="ne-src">
                <input id="ne-src" type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100" />
              </Field>
              <Field label="Note (optional)" htmlFor="ne-note">
                <input id="ne-note" type="text" value={note} onChange={(e) => setNote(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100" />
              </Field>
            </>
          )}
          {kind !== "samples" && (
            <Field label="Initial content (optional)" htmlFor="ne-content">
              <textarea id="ne-content" value={content} onChange={(e) => setContent(e.target.value)}
                className="w-full h-24 bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 font-mono text-sm" />
            </Field>
          )}
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close}
              className="px-3 py-1.5 text-sm border border-slate-700 rounded text-slate-300 hover:bg-slate-800">
              Cancel
            </button>
            <button type="submit" disabled={!canSubmit}
              className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded disabled:opacity-50">
              {submitting ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

interface FieldProps { label: string; htmlFor: string; hint?: string; error?: string | null; children: React.ReactNode; }
function Field({ label, htmlFor, hint, error, children }: FieldProps): JSX.Element {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-200 mb-1">{label}</label>
      {children}
      {hint && !error && <p className="text-slate-500 text-xs mt-1">{hint}</p>}
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2.3: DeleteEntryDialog component**

`packages/web/src/components/manifest/DeleteEntryDialog.tsx`:
```tsx
import { useState } from "react";

import { deleteEntry, type EntryKind } from "../../api/entries";

interface DeleteEntryDialogProps {
  slug: string;
  kind: EntryKind;
  /** For formats/bios: the name. For samples: the id. */
  ident: string;
  /** Display label (typically the filename) shown in the prompt. */
  label: string;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteEntryDialog({
  slug, kind, ident, label, open, onClose, onDeleted,
}: DeleteEntryDialogProps): JSX.Element | null {
  const [typed, setTyped] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const canConfirm = typed === ident && !submitting;

  const confirm = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);
    try {
      await deleteEntry(slug, kind, ident);
      setTyped("");
      onDeleted();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      role="presentation"
    >
      <dialog
        open
        className="bg-slate-900 border border-red-800 rounded-lg p-6 w-[480px] max-w-[90vw] space-y-4 m-0"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        aria-label={`Delete ${kind.slice(0, -1)}`}
      >
        <h2 className="text-lg font-semibold text-red-300">Delete {kind.slice(0, -1)} {label}</h2>
        <p className="text-slate-300 text-sm">
          This removes the manifest entry and deletes the file from disk.
        </p>
        <div>
          <label htmlFor="de-confirm" className="block text-sm font-medium text-slate-200 mb-1">
            Type <code>{ident}</code> to confirm:
          </label>
          <input id="de-confirm" type="text" value={typed} onChange={(e) => setTyped(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100" />
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => { setTyped(""); onClose(); }}
            className="px-3 py-1.5 text-sm border border-slate-700 rounded text-slate-300 hover:bg-slate-800">
            Cancel
          </button>
          <button type="button" onClick={confirm} disabled={!canConfirm}
            className="px-3 py-1.5 text-sm bg-red-700 hover:bg-red-600 text-white rounded disabled:opacity-50">
            {submitting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
```

- [ ] **Step 2.4: Update MarkdownEditor to accept onDelete prop**

Edit `packages/web/src/components/MarkdownEditor.tsx`. Change the props interface and add a Delete button in the header.

Find:
```typescript
interface MarkdownEditorProps {
  slug: string;
  path: string;
}
```
Replace with:
```typescript
interface MarkdownEditorProps {
  slug: string;
  path: string;
  onDelete?: () => void;   // when provided, renders a Delete button in the header
}
```

Find the destructure inside `export function MarkdownEditor(...)`:
```typescript
export function MarkdownEditor({ slug, path }: MarkdownEditorProps): JSX.Element {
```
Replace:
```typescript
export function MarkdownEditor({ slug, path, onDelete }: MarkdownEditorProps): JSX.Element {
```

In the header `<header className="border-b border-slate-800 px-6 py-3 flex items-center gap-3 bg-slate-900/50">` block, find the Save button:
```typescript
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="px-4 py-1 text-xs rounded bg-blue-600 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : "Save"}
        </button>
```

Add a Delete button just before the Save button (so render order is: Rich/Raw toggle → Delete → Save):
```typescript
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="px-3 py-1 text-xs rounded border border-red-700 text-red-300 hover:bg-red-900/30"
          >
            Delete
          </button>
        )}
```

- [ ] **Step 2.5: Wire FileGroup with +New + Delete**

Edit `packages/web/src/routes/PackDetailPage.tsx`. Replace the existing `FileGroup` function body. The full new `FileGroup`:

```tsx
import { DeleteEntryDialog } from "../components/manifest/DeleteEntryDialog";
import { NewEntryDialog } from "../components/manifest/NewEntryDialog";
import { type EntryKind } from "../api/entries";
import { useGlobalEvents } from "../hooks/useGlobalEvents";

// ... keep existing top-of-file imports ...

function FileGroup({ category }: { category: EntryKind }): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const [manifest, setManifest] = useState<Record<string, unknown> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const reload = (preferSelected?: string | null): void => {
    if (!slug) return;
    getManifest(slug).then((m) => {
      setManifest(m);
      const entries = (m[category] as Array<{ file: string }> | undefined) ?? [];
      if (preferSelected && entries.some((e) => e.file === preferSelected)) {
        setSelected(preferSelected);
      } else if (entries.length > 0) {
        // Keep previous selection if still present; else fall back to first
        setSelected((prev) => (prev && entries.some((e) => e.file === prev) ? prev : entries[0].file));
      } else {
        setSelected(null);
      }
    });
  };

  useEffect(() => {
    if (!slug) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, category]);

  // Live refresh on pack:updated events for this slug.
  useGlobalEvents((evt) => {
    if (evt.type === "pack:updated" && evt.slug === slug) reload(selected);
  });

  if (!slug) return <div />;
  if (manifest === null) return <div className="p-6 text-slate-500">Loading…</div>;
  const entries = (manifest[category] as Array<{ name?: string; id?: string; file: string }>) ?? [];

  // Find the entry's identity (name for formats/bios, id for samples) for the selected file.
  const selectedEntry = entries.find((e) => e.file === selected);
  const selectedIdent = category === "samples" ? selectedEntry?.id : selectedEntry?.name;

  return (
    <div className="flex h-full">
      <div className="w-[220px] shrink-0 flex flex-col border-r border-slate-800 bg-slate-950/30">
        <ul className="flex-1 overflow-y-auto">
          {entries.length === 0 ? (
            <li className="p-4 text-slate-500 text-xs">No {category} yet.</li>
          ) : entries.map((e) => (
            <li key={e.file}>
              <button
                type="button"
                onClick={() => setSelected(e.file)}
                className={`w-full text-left px-4 py-2 text-sm ${
                  selected === e.file ? "bg-slate-800 text-slate-100" : "text-slate-300 hover:bg-slate-800/40"
                }`}
              >
                {e.name ?? e.id ?? e.file}
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-slate-800 p-2">
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="w-full px-2 py-1.5 text-sm border border-dashed border-slate-700 rounded text-slate-400 hover:text-slate-100 hover:border-slate-500"
          >
            + New {category.slice(0, -1)}
          </button>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        {selected ? (
          <MarkdownEditor
            slug={slug}
            path={selected}
            onDelete={selectedIdent ? () => setDeleteOpen(true) : undefined}
          />
        ) : (
          <div className="p-6 text-slate-500">No file selected. Click "+ New {category.slice(0, -1)}" to add one.</div>
        )}
      </div>
      <NewEntryDialog
        slug={slug}
        kind={category}
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(file) => reload(file)}
      />
      {selectedIdent && selected && (
        <DeleteEntryDialog
          slug={slug}
          kind={category}
          ident={selectedIdent}
          label={selected}
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => { setSelected(null); reload(); }}
        />
      )}
    </div>
  );
}
```

(`useGlobalEvents` was added in Phase 5 — it auto-imports `EventSource` for `/api/events`.)

- [ ] **Step 2.6: Vitest tests**

`packages/web/tests/components/manifest/NewEntryDialog.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { NewEntryDialog } from "../../../src/components/manifest/NewEntryDialog";

const mockCreateFormat = vi.hoisted(() => vi.fn());
const mockCreateBio = vi.hoisted(() => vi.fn());
const mockCreateSample = vi.hoisted(() => vi.fn());
vi.mock("../../../src/api/entries", () => ({
  createFormat: mockCreateFormat,
  createBio: mockCreateBio,
  createSample: mockCreateSample,
}));

beforeEach(() => {
  mockCreateFormat.mockReset();
  mockCreateBio.mockReset();
  mockCreateSample.mockReset();
});

describe("NewEntryDialog", () => {
  it("renders name field for formats", () => {
    render(<NewEntryDialog slug="dan" kind="formats" open={true} onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.queryByLabelText("Excerpt")).toBeNull();
  });

  it("renders excerpt for samples", () => {
    render(<NewEntryDialog slug="dan" kind="samples" open={true} onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByLabelText("Excerpt")).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).toBeNull();
  });

  it("renders max_chars + target_words + third_person for bios", () => {
    render(<NewEntryDialog slug="dan" kind="bios" open={true} onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByLabelText("max_chars")).toBeInTheDocument();
    expect(screen.getByLabelText("target_words")).toBeInTheDocument();
    expect(screen.getByLabelText("Third person")).toBeInTheDocument();
  });

  it("disables submit until name valid (formats)", () => {
    render(<NewEntryDialog slug="dan" kind="formats" open={true} onClose={() => {}} onCreated={() => {}} />);
    const submit = screen.getByRole("button", { name: /Create$/ });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Foo Bar" } });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "linkedin-post" } });
    expect(submit).toBeEnabled();
  });

  it("calls createFormat on submit and closes", async () => {
    mockCreateFormat.mockResolvedValue({ name: "x", file: "formats/x.md" });
    const onCreated = vi.fn();
    const onClose = vi.fn();
    render(<NewEntryDialog slug="dan" kind="formats" open={true} onClose={onClose} onCreated={onCreated} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /Create$/ }));
    await waitFor(() => expect(mockCreateFormat).toHaveBeenCalled());
    expect(onCreated).toHaveBeenCalledWith("formats/x.md");
    expect(onClose).toHaveBeenCalled();
  });

  it("shows inline error on 409", async () => {
    mockCreateFormat.mockRejectedValue(new Error("HTTP 409 conflict"));
    render(<NewEntryDialog slug="dan" kind="formats" open={true} onClose={() => {}} onCreated={() => {}} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /Create$/ }));
    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeInTheDocument());
  });
});
```

`packages/web/tests/components/manifest/DeleteEntryDialog.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { DeleteEntryDialog } from "../../../src/components/manifest/DeleteEntryDialog";

const mockDelete = vi.hoisted(() => vi.fn());
vi.mock("../../../src/api/entries", async () => {
  const actual = await vi.importActual<typeof import("../../../src/api/entries")>("../../../src/api/entries");
  return { ...actual, deleteEntry: mockDelete };
});

beforeEach(() => { mockDelete.mockReset(); });

describe("DeleteEntryDialog", () => {
  it("disables Delete until exact ident typed", () => {
    render(<DeleteEntryDialog slug="dan" kind="formats" ident="blog-post" label="formats/blog-post.md"
      open={true} onClose={() => {}} onDeleted={() => {}} />);
    const btn = screen.getByRole("button", { name: /Delete$/ });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: "blog-pos" } });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: "blog-post" } });
    expect(btn).toBeEnabled();
  });

  it("calls deleteEntry on confirm", async () => {
    mockDelete.mockResolvedValue(undefined);
    const onDeleted = vi.fn();
    render(<DeleteEntryDialog slug="dan" kind="formats" ident="blog-post" label="formats/blog-post.md"
      open={true} onClose={() => {}} onDeleted={onDeleted} />);
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: "blog-post" } });
    fireEvent.click(screen.getByRole("button", { name: /Delete$/ }));
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("dan", "formats", "blog-post");
      expect(onDeleted).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2.7: Run checks + commit**

```bash
cd packages/web
pnpm test
pnpm lint
pnpm build
cd ../..
git add packages/web
git commit -m "$(cat <<'EOF'
feat(web): + New / Delete inside Formats/Samples/Bios sub-tabs

FileGroup gains a "+ New <kind>" button at the bottom of the file
list and surfaces a Delete button inside the MarkdownEditor header
(via a new optional onDelete prop). NewEntryDialog renders the
right form per kind: name + description + content for formats and
bios (plus max_chars / target_words / third_person for bios);
excerpt + source_url + note for samples (reuses Phase 4's samples
POST). DeleteEntryDialog uses the same slug-typed confirmation
pattern as DeletePackDialog. FileGroup live-refreshes on
pack:updated SSE events.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Backend: pack zip export + import

**Files:**
- Create: `packages/api/myvoice/api/pack_zip.py`
- Modify: `packages/api/myvoice/server.py` (mount pack_zip router)
- Create: `packages/api/tests/api/test_pack_zip_export.py`
- Create: `packages/api/tests/api/test_pack_zip_import.py`

- [ ] **Step 3.1: Write failing export tests**

`packages/api/tests/api/test_pack_zip_export.py`:
```python
"""GET /api/packs/{slug}/export."""
from __future__ import annotations

import io
import shutil
import zipfile
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from myvoice.server import create_app

_REPO_ROOT = Path(__file__).resolve().parents[4]
_DAN_SRC = _REPO_ROOT / "packs" / "dan"


@pytest.fixture
def zip_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    packs_root = tmp_path / "packs"
    packs_root.mkdir()
    shutil.copytree(_DAN_SRC, packs_root / "dan")
    monkeypatch.setenv("MYVOICE_PACKS_ROOT", str(packs_root))
    monkeypatch.setenv("MYVOICE_CONFIG_PATH", str(tmp_path / "config.yaml"))
    app = create_app()
    with TestClient(app) as c:
        yield c


def test_export_returns_zip_with_pack_contents(zip_client: TestClient) -> None:
    r = zip_client.get("/api/packs/dan/export")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/zip"
    assert "pack-dan-" in r.headers["content-disposition"]
    assert ".zip" in r.headers["content-disposition"]
    # Open the zip
    z = zipfile.ZipFile(io.BytesIO(r.content))
    names = z.namelist()
    # All entries nested under "dan/" so import is symmetric
    assert all(n.startswith("dan/") for n in names), names
    assert "dan/stylepack.yaml" in names
    # No dot-files / __pycache__
    assert not any(n.startswith("dan/.") or "__pycache__" in n for n in names)


def test_export_404_unknown_slug(zip_client: TestClient) -> None:
    r = zip_client.get("/api/packs/nope/export")
    assert r.status_code == 404
```

- [ ] **Step 3.2: Write failing import tests**

`packages/api/tests/api/test_pack_zip_import.py`:
```python
"""POST /api/packs/import."""
from __future__ import annotations

import io
import shutil
import zipfile
from collections.abc import Iterator
from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

from myvoice.server import create_app

_REPO_ROOT = Path(__file__).resolve().parents[4]
_DAN_SRC = _REPO_ROOT / "packs" / "dan"


def _make_pack_zip(pack_src: Path, inner_slug: str) -> bytes:
    """Build a zip of pack_src nested under inner_slug/."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for path in pack_src.rglob("*"):
            if path.is_file():
                rel = path.relative_to(pack_src)
                z.write(path, arcname=f"{inner_slug}/{rel}")
    return buf.getvalue()


@pytest.fixture
def import_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[tuple[TestClient, Path]]:
    packs_root = tmp_path / "packs"
    packs_root.mkdir()
    monkeypatch.setenv("MYVOICE_PACKS_ROOT", str(packs_root))
    monkeypatch.setenv("MYVOICE_CONFIG_PATH", str(tmp_path / "config.yaml"))
    app = create_app()
    with TestClient(app) as c:
        yield c, packs_root


def _patch_slug(zip_bytes: bytes, new_slug: str) -> bytes:
    """Re-pack the zip rewriting stylepack.yaml's pack.slug to new_slug + renaming the inner dir."""
    out = io.BytesIO()
    src = zipfile.ZipFile(io.BytesIO(zip_bytes))
    with zipfile.ZipFile(out, "w") as z:
        for name in src.namelist():
            data = src.read(name)
            new_name = new_slug + name[name.index("/"):]
            if name.endswith("stylepack.yaml"):
                manifest = yaml.safe_load(data.decode("utf-8"))
                manifest["pack"]["slug"] = new_slug
                data = yaml.safe_dump(manifest, sort_keys=False).encode("utf-8")
            z.writestr(new_name, data)
    return out.getvalue()


def test_import_pack_success(import_client: tuple[TestClient, Path]) -> None:
    client, packs_root = import_client
    # Build a zip from the on-disk dan pack, rewriting slug → alice
    raw = _make_pack_zip(_DAN_SRC, "dan")
    altered = _patch_slug(raw, "alice")
    r = client.post(
        "/api/packs/import",
        files={"file": ("alice.zip", altered, "application/zip")},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["slug"] == "alice"
    assert (packs_root / "alice" / "stylepack.yaml").is_file()


def test_import_slug_conflict_409(import_client: tuple[TestClient, Path]) -> None:
    client, packs_root = import_client
    # Pre-create the pack
    shutil.copytree(_DAN_SRC, packs_root / "dan")
    raw = _make_pack_zip(_DAN_SRC, "dan")
    r = client.post(
        "/api/packs/import",
        files={"file": ("dan.zip", raw, "application/zip")},
    )
    assert r.status_code == 409
    assert r.json()["detail"]["error"]["code"] == "slug_conflict"


def test_import_invalid_zip_422(import_client: tuple[TestClient, Path]) -> None:
    client, _ = import_client
    # A zip with NO stylepack.yaml
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("notapack/README.md", "hello")
    r = client.post(
        "/api/packs/import",
        files={"file": ("bad.zip", buf.getvalue(), "application/zip")},
    )
    assert r.status_code == 422
    assert r.json()["detail"]["error"]["code"] == "invalid_pack"
```

Run: `uv run pytest packages/api/tests/api/test_pack_zip_export.py packages/api/tests/api/test_pack_zip_import.py -v`
Expected: FAIL.

- [ ] **Step 3.3: Implement pack_zip.py**

`packages/api/myvoice/api/pack_zip.py`:
```python
"""GET /api/packs/{slug}/export + POST /api/packs/import."""
from __future__ import annotations

import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from myvoice.packs.templates import locate_template, resolve_write_root  # locate_template unused but keeps imports tidy
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
        z = zipfile.ZipFile(__import__("io").BytesIO(raw))
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
                detail={"error": {"code": "invalid_pack", "message": "Manifest missing pack.slug."}},
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
```

Notes: import uses `__import__("io").BytesIO` to avoid an extra top-level import; clean style would be `import io` at the top. Use the clean version — add `import io` at the top of `pack_zip.py` and replace `__import__("io").BytesIO(raw)` with `io.BytesIO(raw)`.

Also: `locate_template` import is unused — drop it.

- [ ] **Step 3.4: Mount router**

Edit `packages/api/myvoice/server.py` — same pattern as Task 1.5:
```python
    from myvoice.api.pack_zip import router as pack_zip_router
    # ...
    app.include_router(pack_zip_router)
```

- [ ] **Step 3.5: Run + commit**

```bash
uv run pytest packages/api/tests/ -q
uv run ruff check packages/api
uv run mypy packages/api
git add packages/api
git commit -m "$(cat <<'EOF'
feat(api): GET /api/packs/{slug}/export + POST /api/packs/import

Export streams a zip of the pack nested under <slug>/ (so import is
symmetric); skips dot-files, __pycache__, *.pyc. Filename header is
pack-<slug>-<version>.zip. Uses BackgroundTask to rmtree the tmp dir
after the response sends.

Import accepts multipart, caps at 50 MB, extracts to tmp, finds the
single inner pack directory (422 invalid_pack if zero or many),
reads pack.slug from the manifest as authoritative, refuses 409 on
slug conflict (user must rename existing pack first), shutil.move
into the write root, runs validate_pack defensively with rmtree
rollback on failure. Emits pack:created on success.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — Frontend: Export pack button + Import pack dialog

**Files:**
- Create: `packages/web/src/api/pack_zip.ts`
- Create: `packages/web/src/components/packs/ImportPackDialog.tsx`
- Create: `packages/web/tests/components/packs/ImportPackDialog.test.tsx`
- Modify: `packages/web/src/components/manifest/ManifestForm.tsx` (Export button in new Distribute section)
- Modify: `packages/web/src/components/PackList.tsx` (Import pack button)

- [ ] **Step 4.1: API client**

`packages/web/src/api/pack_zip.ts`:
```typescript
import type { PackSummary } from "./packs";

export function exportPackUrl(slug: string): string {
  return `/api/packs/${encodeURIComponent(slug)}/export`;
}

export async function importPack(file: File): Promise<PackSummary> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/packs/import", { method: "POST", body: form });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.detail?.error?.message ?? "";
    } catch { /* ignore */ }
    throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return res.json() as Promise<PackSummary>;
}
```

- [ ] **Step 4.2: ImportPackDialog component**

`packages/web/src/components/packs/ImportPackDialog.tsx`:
```tsx
import { type ChangeEvent, useState } from "react";

import { importPack } from "../../api/pack_zip";

interface ImportPackDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ImportPackDialog({ open, onClose }: ImportPackDialogProps): JSX.Element | null {
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!open) return null;

  const reset = () => { setFile(null); setError(null); setSuccess(null); };
  const close = () => { reset(); onClose(); };

  const onFile = (e: ChangeEvent<HTMLInputElement>): void => {
    setFile(e.target.files?.[0] ?? null);
    setError(null);
    setSuccess(null);
  };

  const submit = async (): Promise<void> => {
    if (!file) return;
    setSubmitting(true);
    setError(null);
    try {
      const summary = await importPack(file);
      setSuccess(`Imported pack "${summary.slug}".`);
      setTimeout(close, 1500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("409")) {
        setError("A pack with that slug already exists. Rename or delete it first.");
      } else if (msg.includes("422")) {
        setError("That zip isn't a valid style pack.");
      } else if (msg.includes("413")) {
        setError("Zip is too large (limit 50 MB).");
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={close}
      onKeyDown={(e) => { if (e.key === "Escape") close(); }}
      role="presentation"
    >
      <dialog
        open
        className="bg-slate-900 border border-slate-700 rounded-lg p-6 w-[480px] max-w-[90vw] space-y-4 m-0"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        aria-label="Import pack"
      >
        <h2 className="text-lg font-semibold text-slate-100">Import pack</h2>
        <p className="text-slate-400 text-sm">Upload a .zip exported from another myvoice install.</p>
        <input
          type="file"
          accept=".zip,application/zip"
          onChange={onFile}
          aria-label="Pack zip file"
          className="block w-full text-sm text-slate-300 file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700"
        />
        {file && <p className="text-slate-500 text-xs">{file.name} · {(file.size / 1024).toFixed(1)} KB</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}
        {success && <p className="text-emerald-400 text-sm">{success}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={close}
            className="px-3 py-1.5 text-sm border border-slate-700 rounded text-slate-300 hover:bg-slate-800">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={!file || submitting}
            className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded disabled:opacity-50">
            {submitting ? "Importing…" : "Import"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
```

- [ ] **Step 4.3: Vitest test**

`packages/web/tests/components/packs/ImportPackDialog.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { ImportPackDialog } from "../../../src/components/packs/ImportPackDialog";

const mockImport = vi.hoisted(() => vi.fn());
vi.mock("../../../src/api/pack_zip", () => ({ importPack: mockImport }));

beforeEach(() => { mockImport.mockReset(); });

describe("ImportPackDialog", () => {
  it("disables Import when no file selected", () => {
    render(<ImportPackDialog open={true} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: /Import$/ })).toBeDisabled();
  });

  it("enables Import when file picked", () => {
    render(<ImportPackDialog open={true} onClose={() => {}} />);
    const input = screen.getByLabelText(/Pack zip file/i) as HTMLInputElement;
    const file = new File(["x"], "pack.zip", { type: "application/zip" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByRole("button", { name: /Import$/ })).toBeEnabled();
  });

  it("calls importPack and shows success on 201", async () => {
    mockImport.mockResolvedValue({ slug: "alice", name: "Alice", version: "0.1.0", valid: true, error_count: 0 });
    render(<ImportPackDialog open={true} onClose={() => {}} />);
    const input = screen.getByLabelText(/Pack zip file/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "alice.zip", { type: "application/zip" })] } });
    fireEvent.click(screen.getByRole("button", { name: /Import$/ }));
    await waitFor(() => expect(screen.getByText(/Imported pack "alice"/)).toBeInTheDocument());
  });

  it("maps 409 to slug-conflict message", async () => {
    mockImport.mockRejectedValue(new Error("HTTP 409"));
    render(<ImportPackDialog open={true} onClose={() => {}} />);
    const input = screen.getByLabelText(/Pack zip file/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "alice.zip", { type: "application/zip" })] } });
    fireEvent.click(screen.getByRole("button", { name: /Import$/ }));
    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 4.4: Add Export button to ManifestForm**

Edit `packages/web/src/components/manifest/ManifestForm.tsx`. Add `import { exportPackUrl } from "../../api/pack_zip";` to the imports.

Find the JSX block where `EntriesSection` is rendered and the Danger zone section that follows it. Insert a new "Distribute" section between them:

```tsx
      <section className="space-y-3 pt-6 mt-6 border-t border-slate-800">
        <h2 className="text-base font-semibold text-slate-100">Distribute</h2>
        <p className="text-slate-400 text-sm">Export this pack as a .zip you can share or re-import elsewhere.</p>
        <a
          href={exportPackUrl(slug)}
          download
          className="inline-block px-3 py-1.5 text-sm border border-slate-700 text-slate-300 rounded hover:bg-slate-800"
        >
          Export pack as .zip
        </a>
      </section>
```

- [ ] **Step 4.5: Add Import button to PackList**

Edit `packages/web/src/components/PackList.tsx`. Add imports for `ImportPackDialog` + a state for the dialog. Add a button in the same area as "+ New pack" (typically at the bottom of the list, above the divider). Both buttons can sit side-by-side or stacked.

Example minimal change:
```tsx
import { useState } from "react";
import { ImportPackDialog } from "./packs/ImportPackDialog";

// inside the component:
const [importOpen, setImportOpen] = useState(false);

// near the existing "+ New pack" button:
<div className="space-y-2 px-2 py-2 border-t border-slate-800">
  <button
    type="button"
    onClick={() => setNewPackOpen(true)}
    className="w-full px-2 py-1.5 text-sm border border-dashed border-slate-700 rounded text-slate-400 hover:text-slate-100 hover:border-slate-500"
  >
    + New pack
  </button>
  <button
    type="button"
    onClick={() => setImportOpen(true)}
    className="w-full px-2 py-1.5 text-sm border border-dashed border-slate-700 rounded text-slate-400 hover:text-slate-100 hover:border-slate-500"
  >
    Import pack…
  </button>
</div>

// alongside <NewPackDialog ... />:
<ImportPackDialog open={importOpen} onClose={() => setImportOpen(false)} />
```

(Inspect the actual current `PackList.tsx` first to match the surrounding structure — the exact spot for the button depends on what's already there.)

- [ ] **Step 4.6: Run + commit**

```bash
cd packages/web
pnpm test
pnpm lint
pnpm build
cd ../..
git add packages/web
git commit -m "$(cat <<'EOF'
feat(web): Export pack button + Import pack dialog

ManifestForm gains a Distribute section between Entries and Danger
zone — a plain anchor that hits /api/packs/{slug}/export with the
download attribute, so the browser handles the .zip save natively.

ImportPackDialog opens from PackList sidebar (next to + New pack);
file picker accepts .zip, POSTs multipart to /api/packs/import,
maps 409 → "slug already exists", 422 → "not a valid pack zip",
413 → "too large". On success shows a confirmation and auto-closes;
the sidebar refreshes via the existing pack:created SSE.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — Public library API + smoke test + README

**Files:**
- Modify: `packages/api/myvoice/__init__.py`
- Create: `packages/api/tests/test_public_api.py`
- Modify: `README.md`

- [ ] **Step 5.1: Replace __init__.py with public re-exports**

Replace the entire contents of `packages/api/myvoice/__init__.py` with:

```python
"""myvoice — Local-first style-pack editor + library.

Public API for other apps (e.g., Pencraft):

    from myvoice import PackStore, compose_prompt, lint, validate_pack
    from myvoice import Manifest, Violation, LintHit

Imports outside the names listed in __all__ below are PRIVATE and may
change without notice. Pin a version of myvoice if you depend on
internal modules.
"""
from __future__ import annotations

__version__ = "0.1.0"

from myvoice.compose import compose as compose_prompt
from myvoice.lint import (
    LintHit,
    Violation,
    detect_positive_hits,
    lint,
    lint_to_hits,
)
from myvoice.packs.manifest import Manifest
from myvoice.packs.store import PackStore
from myvoice.validate import validate_pack

__all__ = [
    "__version__",
    "PackStore",
    "Manifest",
    "compose_prompt",
    "lint",
    "lint_to_hits",
    "detect_positive_hits",
    "validate_pack",
    "Violation",
    "LintHit",
]
```

- [ ] **Step 5.2: Write the smoke test**

`packages/api/tests/test_public_api.py`:
```python
"""Smoke test: every public name imports + a basic round-trip works."""
from __future__ import annotations

from pathlib import Path

import myvoice

_EXPECTED = {
    "__version__",
    "PackStore",
    "Manifest",
    "compose_prompt",
    "lint",
    "lint_to_hits",
    "detect_positive_hits",
    "validate_pack",
    "Violation",
    "LintHit",
}


def test_all_public_names_present() -> None:
    assert set(myvoice.__all__) == _EXPECTED
    for name in _EXPECTED:
        assert hasattr(myvoice, name), f"myvoice.{name} missing"


def test_library_round_trip() -> None:
    """Mirror what a downstream library consumer (e.g., Pencraft) would do."""
    from myvoice import PackStore, compose_prompt, lint, validate_pack

    repo_packs = Path(__file__).resolve().parents[3] / "packs"
    store = PackStore([repo_packs])
    assert "dan" in store.slugs()

    dan = store.get("dan")
    assert dan is not None
    assert dan.valid

    result = validate_pack(dan.root_path)
    assert result.errors == []
    assert result.manifest is not None

    prompt = compose_prompt(dan.root_path, draft="A short draft.")
    assert "A short draft." in prompt
    assert len(prompt) > 100  # non-trivial

    violations = lint(result.manifest, "Let me delve into this.")
    assert any("delve" in v.match for v in violations)
```

- [ ] **Step 5.3: README update**

Edit `README.md`. Find the "Style packs" section (or wherever the existing "Design" reference lives) and INSERT a new section before "Design":

````markdown
## Using myvoice as a library

Other Python apps can consume packs by importing from `myvoice` directly:

```python
from pathlib import Path
from myvoice import PackStore, compose_prompt, lint, validate_pack

# Discover packs from one or more roots
store = PackStore([Path("~/.myvoice/packs").expanduser()])

# List + look up a pack
for slug in store.slugs():
    info = store.get(slug)
    print(slug, info.valid)

dan = store.get("dan")

# Compose a prompt for the LLM
prompt = compose_prompt(
    dan.root_path,
    format="blog-post",
    samples=["01"],
    draft="My rough draft text…",
)

# Lint a draft against the pack
result = validate_pack(dan.root_path)
violations = lint(result.manifest, "Let me delve into this.")
for v in violations:
    print(v.kind, v.match, v.message)
```

The names exported from `myvoice/__init__.py` (`PackStore`, `Manifest`, `compose_prompt`, `lint`, `lint_to_hits`, `detect_positive_hits`, `validate_pack`, `Violation`, `LintHit`, `__version__`) are the public API. Anything else is private and may change without notice.

Install via `pipx install myvoice` (CLI + library) or `pip install myvoice` (library only inside a project venv).
````

- [ ] **Step 5.4: Run + commit**

```bash
uv run pytest packages/api/tests/test_public_api.py -v
uv run pytest packages/api/tests/ -q
uv run ruff check packages/api
uv run mypy packages/api
git add packages/api README.md
git commit -m "$(cat <<'EOF'
feat(api): public library API exports + smoke test + README

Re-export PackStore, Manifest, compose_prompt (alias for compose),
lint, lint_to_hits, detect_positive_hits, validate_pack, Violation,
LintHit from myvoice/__init__.py with __all__ defining the public
surface. Anything outside that list is private and may change
without notice.

test_public_api.py asserts every name is present and runs a 4-step
round-trip (list packs → look up → validate → compose → lint) that
mirrors what a downstream consumer like Pencraft will do.

README gains a "Using myvoice as a library" section with the same
example code so the surface is discoverable.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — Playwright e2e + final checks + PR

**Files:**
- Create: `e2e/entries-and-zip.spec.ts`
- Modify: README.md if anything's left to document (rare)

- [ ] **Step 6.1: e2e spec**

`e2e/entries-and-zip.spec.ts`:
```typescript
import { test, expect } from "@playwright/test";

test("create a format entry, then delete it", async ({ page }) => {
  await page.goto("/");
  // Pick the dan pack
  await page.click("text=dan");
  // Navigate to Formats tab
  await page.click("text=📄 Formats");
  await expect(page.locator("text=blog-post")).toBeVisible({ timeout: 5000 });

  // Open + New format
  const stamp = Date.now().toString();
  const name = `e2e-fmt-${stamp}`;
  await page.click("text=+ New format");
  await expect(page.getByRole("dialog", { name: /New format/i })).toBeVisible();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: /Create$/ }).click();

  // New entry appears
  await expect(page.locator(`text=${name}`)).toBeVisible({ timeout: 5000 });

  // Delete it
  await page.click(`text=${name}`);
  await page.click("text=Delete");
  await expect(page.getByRole("dialog", { name: /Delete format/i })).toBeVisible();
  await page.getByLabel(/Type/).fill(name);
  await page.getByRole("button", { name: /Delete$/ }).click();

  // Gone from sidebar
  await expect(page.locator(`text=${name}`)).toHaveCount(0, { timeout: 5000 });
});

test("export pack as zip then import it under a new slug", async ({ page, request }) => {
  // 1. Hit /api/packs/dan/export directly via Playwright's request fixture, capture the zip
  const response = await request.get("/api/packs/dan/export");
  expect(response.status()).toBe(200);
  const buf = await response.body();
  expect(buf.length).toBeGreaterThan(100);

  // We can't easily re-pack with a different slug from inside the test runner without unzip libs,
  // so this case just verifies the export endpoint round-trips. Full import flow is covered
  // by the backend pytest in test_pack_zip_import.py.

  // 2. Visit the Manifest tab and confirm the Distribute section + Export anchor exist
  await page.goto("/");
  await page.click("text=dan");
  await page.click("text=⚙ Manifest");
  await expect(page.locator("text=Distribute")).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole("link", { name: /Export pack as \.zip/i })).toBeVisible();
});
```

(Note on the second test: doing a full export-then-import round-trip through Playwright requires writing the binary zip to disk between steps, which is awkward. The pytest in test_pack_zip_import.py covers the round-trip end-to-end at the API level; the e2e just confirms the UI affordance exists and the export endpoint returns 200.)

- [ ] **Step 6.2: Run everything locally**

```bash
cd /Users/dbbaskette/Projects/myvoice
uv run pytest packages/api/tests -q
uv run ruff check packages/api
uv run mypy packages/api
cd packages/web && pnpm test && pnpm lint && pnpm build && cd ../..
cd packages/web && pnpm exec playwright test --reporter=line --config=../../playwright.config.ts && cd ../..
```

All must pass.

- [ ] **Step 6.3: Commit + push + open PR**

```bash
git add e2e
git commit -m "$(cat <<'EOF'
test(e2e): entries lifecycle + export endpoint smoke

Adds two Playwright specs: (1) create a new format from the
Formats sub-tab, see it appear, type the name to confirm delete,
verify it's gone; (2) request /api/packs/dan/export and verify
the .zip body comes through plus the Manifest tab Distribute
section is rendered. Full export+import round-trip stays in
backend pytest where it's natural.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin phase-7-entries-export-library
gh pr create --title "Phase 7: entries + zip + library API" --body "$(cat <<'EOF'
## Summary
- POST/DELETE /api/packs/{slug}/{formats,samples,bios} routes mirroring the Phase 4 samples POST pattern (coupled file + manifest write, atomic, 409 on conflict, emits pack:updated)
- Frontend: + New / Delete inside the existing Formats/Samples/Bios sub-tabs via NewEntryDialog + DeleteEntryDialog; MarkdownEditor takes an optional onDelete prop to render the delete button in its header
- GET /api/packs/{slug}/export streams a zip nested under <slug>/, skipping dot-files; POST /api/packs/import accepts multipart, finds the inner pack, refuses 409 on slug conflict, validates defensively
- Frontend: Distribute section in ManifestForm with a download link; Import pack dialog in the sidebar
- Public library API: re-exports PackStore / Manifest / compose_prompt / lint / lint_to_hits / detect_positive_hits / validate_pack / Violation / LintHit / __version__ from myvoice/__init__.py with __all__ defining the surface
- Smoke test that imports every name and runs a 4-step round-trip
- README gains "Using myvoice as a library" section

Out of scope (later): entry rename, overwrite-on-import, signed bundles, per-entry reorder UI.

## Test plan
- [ ] uv run pytest passes
- [ ] uv run ruff check + mypy pass
- [ ] pnpm test + pnpm lint + pnpm build pass
- [ ] pnpm exec playwright test passes (entries-and-zip + earlier specs)
- [ ] Manual: create a format, delete it, export the dan pack, import it under a renamed slug, confirm sidebar updates live
- [ ] Manual: in a venv, `python -c "from myvoice import PackStore, compose_prompt, lint, validate_pack; print('ok')"`
EOF
)"
```

---

## Self-review

**Spec coverage:**
- Part A.2 (POST/DELETE routes) → Task 1 ✓
- Part A.5–A.7 (FileGroup + NewEntryDialog + DeleteEntryDialog) → Task 2 ✓
- Part A.8 (tests) → Tasks 1 and 2 ✓
- Part B.1–B.3 (export + import routes) → Task 3 ✓
- Part B.4 (Export button + Import dialog) → Task 4 ✓
- Part B.5 (API client) → Task 4.1 ✓
- Part B.6 (tests) → Tasks 3 and 4 ✓
- Part C.1 (`__init__.py` shim) → Task 5.1 ✓
- Part C.2 (README) → Task 5.3 ✓
- Part C.3 (smoke test) → Task 5.2 ✓
- Done-state items → Step 6.2 covers tests; manual checks are user-side.

**Placeholder scan:** none. Each code step has full code.

**Type consistency:** `EntryKind = "formats" | "samples" | "bios"` used identically across entries.ts, NewEntryDialog, DeleteEntryDialog, and FileGroup. The new backend POST/DELETE codes (`name_conflict`, `entry_not_found`) follow the established error-envelope shape. `compose_prompt` is the alias name everywhere (re-export in `__init__.py`, used in README and the smoke test).
