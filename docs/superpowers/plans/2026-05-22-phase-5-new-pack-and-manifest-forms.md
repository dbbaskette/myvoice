# Phase 5 — New pack + Manifest forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the editing experience: users create packs from the UI, edit declarative manifest fields via forms, and soft-delete packs to trash.

**Architecture:** Bottom-up — `POST /api/packs` (copy `_template` + patch manifest) → `DELETE /api/packs/{slug}` (move to trash) → frontend dialog + sidebar live refresh → ManifestForm replaces YAML stub with 5 section components → delete dialog → e2e round-trip.

**Tech Stack:**
- Backend: FastAPI, Pydantic v2, `shutil` (copytree, move), existing PackStore + EventBus
- Frontend: React 18, Vite, React Router, Tailwind, existing EventSource pattern from Phase 4
- Testing: pytest (backend) + Vitest + Playwright (frontend, e2e)

**Spec:** [`docs/superpowers/specs/2026-05-22-phase-5-new-pack-and-manifest-forms-design.md`](../specs/2026-05-22-phase-5-new-pack-and-manifest-forms-design.md)

**Branch:** All work on `phase-5-new-pack-and-manifest-forms` (already checked out). 6 commits, one per task. Open one PR at the end.

---

## File Structure

### New backend files
```
packages/api/myvoice/
  packs/
    templates.py          # _locate_template() -> Path
  api/
    packs_admin.py        # POST /api/packs + DELETE /api/packs/{slug}
```

### New backend test files
```
packages/api/tests/api/
  test_packs_create.py
  test_packs_delete.py
```

### Modified backend files
```
packages/api/myvoice/server.py        # mount packs_admin router
```

### New frontend files
```
packages/web/src/
  api/manifest.ts                          # typed Manifest interface + putManifest
  hooks/useGlobalEvents.ts                 # EventSource("/api/events") wrapper
  components/
    packs/
      NewPackDialog.tsx
      DeletePackDialog.tsx
    manifest/
      ManifestForm.tsx                     # owns draft/loaded state, save bar
      PackMetadataSection.tsx
      PersonaSection.tsx
      BanishedSection.tsx
      RulesSection.tsx
      PopCultureSection.tsx
      EntriesSection.tsx                   # read-only counts + links
      TagInput.tsx
      ExceptionsTable.tsx
```

### New frontend test files
```
packages/web/tests/
  components/
    manifest/TagInput.test.tsx
    manifest/ExceptionsTable.test.tsx
    manifest/ManifestForm.test.tsx
    packs/NewPackDialog.test.tsx
    packs/DeletePackDialog.test.tsx
  hooks/useGlobalEvents.test.ts
```

### Modified frontend files
```
packages/web/src/
  api/packs.ts                                  # add createPack + deletePack
  components/PackList.tsx                       # "+ New pack" button + useGlobalEvents subscription
  routes/PackDetailPage.tsx                     # replace ManifestStub with <ManifestForm slug={slug} />
```

### New e2e
```
e2e/pack-lifecycle.spec.ts
```

### Modified docs
```
README.md                                       # add "Create a pack from the UI" note in Packs section
```

---

## Task 1 — Backend: `POST /api/packs`

**Files:**
- Create: `packages/api/myvoice/packs/templates.py`
- Create: `packages/api/myvoice/api/packs_admin.py`
- Create: `packages/api/tests/api/test_packs_create.py`
- Modify: `packages/api/myvoice/server.py` (mount new router)

- [ ] **Step 1.1: Implement `_locate_template()`**

`packages/api/myvoice/packs/templates.py`:
```python
"""Locate the bundled `_template` pack on disk."""
from __future__ import annotations

import os
from pathlib import Path


def _candidate_template_paths() -> list[Path]:
    """Ordered list of places `_template` might live."""
    here = Path(__file__).resolve()
    candidates: list[Path] = []
    # Repo layout: packages/api/myvoice/packs/templates.py → repo_root/packs/_template
    candidates.append(here.parents[3] / "packs" / "_template")
    # Sibling of MYVOICE_PACKS_ROOT (if set, the template should still be the bundled one).
    env_root = os.environ.get("MYVOICE_PACKS_ROOT")
    if env_root:
        candidates.append(Path(env_root) / "_template")
    return candidates


def locate_template() -> Path:
    """Return the path to the bundled `_template` pack, or raise FileNotFoundError."""
    for candidate in _candidate_template_paths():
        if (candidate / "stylepack.yaml").is_file():
            return candidate
    raise FileNotFoundError(
        "Could not find bundled _template pack. Checked: "
        + ", ".join(str(p) for p in _candidate_template_paths())
    )
```

- [ ] **Step 1.2: Resolve-write-root helper**

Add to `packages/api/myvoice/packs/templates.py`:
```python
def resolve_write_root() -> Path:
    """Where to create new packs. MYVOICE_PACKS_ROOT if set, else ~/.myvoice/packs/."""
    env = os.environ.get("MYVOICE_PACKS_ROOT")
    if env:
        return Path(env)
    return Path.home() / ".myvoice" / "packs"
```

- [ ] **Step 1.3: Write failing create-route tests**

`packages/api/tests/api/test_packs_create.py`:
```python
"""Tests for POST /api/packs."""
from __future__ import annotations

import shutil
from collections.abc import Iterator
from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

from myvoice.server import create_app

_REPO_ROOT = Path(__file__).resolve().parents[4]
_TEMPLATE_SRC = _REPO_ROOT / "packs" / "_template"


@pytest.fixture
def create_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[tuple[TestClient, Path]]:
    """TestClient with an isolated empty packs root that contains only `_template`.

    Yields (client, packs_root).
    """
    packs_root = tmp_path / "packs"
    packs_root.mkdir()
    shutil.copytree(_TEMPLATE_SRC, packs_root / "_template")
    monkeypatch.setenv("MYVOICE_PACKS_ROOT", str(packs_root))
    monkeypatch.setenv("MYVOICE_CONFIG_PATH", str(tmp_path / "config.yaml"))
    app = create_app()
    with TestClient(app) as c:
        yield c, packs_root


def test_create_pack_success(create_client: tuple[TestClient, Path]) -> None:
    client, packs_root = create_client
    r = client.post(
        "/api/packs",
        json={
            "slug": "alice",
            "name": "Alice Voice",
            "author": "Alice Example",
            "persona_identity": "The Pragmatic Engineer",
            "persona_one_line": "Builds tight, ships often, no fluff.",
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["slug"] == "alice"
    assert body["name"] == "Alice Voice"
    assert body["valid"] is True
    # Filesystem
    pack_dir = packs_root / "alice"
    assert (pack_dir / "stylepack.yaml").is_file()
    manifest = yaml.safe_load((pack_dir / "stylepack.yaml").read_text())
    assert manifest["pack"]["slug"] == "alice"
    assert manifest["pack"]["name"] == "Alice Voice"
    assert manifest["pack"]["author"] == "Alice Example"
    assert manifest["pack"]["version"] == "0.1.0"
    assert manifest["persona"]["identity"] == "The Pragmatic Engineer"
    # GET should now find it
    r = client.get("/api/packs/alice")
    assert r.status_code == 200


def test_create_pack_slug_conflict_returns_409(create_client: tuple[TestClient, Path]) -> None:
    client, _ = create_client
    payload = {
        "slug": "alice",
        "name": "Alice",
        "author": "A",
        "persona_identity": "i",
        "persona_one_line": "o",
    }
    r1 = client.post("/api/packs", json=payload)
    assert r1.status_code == 201
    r2 = client.post("/api/packs", json=payload)
    assert r2.status_code == 409
    err = r2.json()["detail"]["error"]
    assert err["code"] == "slug_conflict"


@pytest.mark.parametrize(
    "bad_slug",
    ["Foo", "foo bar", "1foo", "-foo", "_foo", "", "foo/bar", "foo.bar"],
)
def test_create_pack_bad_slug_returns_422(
    create_client: tuple[TestClient, Path], bad_slug: str
) -> None:
    client, _ = create_client
    r = client.post(
        "/api/packs",
        json={
            "slug": bad_slug,
            "name": "n",
            "author": "a",
            "persona_identity": "i",
            "persona_one_line": "o",
        },
    )
    assert r.status_code == 422


def test_create_pack_optional_description(create_client: tuple[TestClient, Path]) -> None:
    client, packs_root = create_client
    r = client.post(
        "/api/packs",
        json={
            "slug": "bob",
            "name": "Bob",
            "author": "Bob Sr.",
            "persona_identity": "The Builder",
            "persona_one_line": "Ships daily.",
            "description": "A test voice.",
        },
    )
    assert r.status_code == 201
    manifest = yaml.safe_load((packs_root / "bob" / "stylepack.yaml").read_text())
    assert manifest["pack"]["description"] == "A test voice."


def test_create_pack_emits_event(create_client: tuple[TestClient, Path]) -> None:
    """Verify a pack:created event is broadcast on /api/events."""
    import asyncio
    from fastapi import FastAPI
    from typing import cast

    client, _ = create_client
    app = cast(FastAPI, client.app)
    bus = app.state.event_bus

    received: list[dict] = []
    loop = asyncio.new_event_loop()
    try:
        q = loop.run_until_complete(bus.subscribe())

        async def collect_one() -> dict:
            return await asyncio.wait_for(q.get(), timeout=3.0)

        # Trigger the create
        r = client.post(
            "/api/packs",
            json={
                "slug": "carol",
                "name": "Carol",
                "author": "c",
                "persona_identity": "i",
                "persona_one_line": "o",
            },
        )
        assert r.status_code == 201
        evt = loop.run_until_complete(collect_one())
        received.append(evt)
    finally:
        loop.run_until_complete(bus.unsubscribe(q))
        loop.close()

    assert received[0]["type"] == "pack:created"
    assert received[0]["slug"] == "carol"
```

Run: `uv run pytest packages/api/tests/api/test_packs_create.py -v`
Expected: FAIL — endpoint doesn't exist.

- [ ] **Step 1.4: Implement create endpoint**

`packages/api/myvoice/api/packs_admin.py`:
```python
"""POST /api/packs (create) + DELETE /api/packs/{slug} (soft-delete)."""
from __future__ import annotations

import asyncio
import shutil
from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from myvoice.packs.templates import locate_template, resolve_write_root
from myvoice.validate import validate_pack

router = APIRouter(prefix="/api/packs", tags=["packs-admin"])


class CreatePackRequest(BaseModel):
    slug: str = Field(min_length=1, pattern=r"^[a-z0-9][a-z0-9\-_]*$")
    name: str = Field(min_length=1)
    author: str = Field(min_length=1)
    persona_identity: str = Field(min_length=1)
    persona_one_line: str = Field(min_length=1)
    version: str = "0.1.0"
    description: str | None = None


@router.post("", status_code=201)
def create_pack(req: CreatePackRequest, request: Request) -> dict[str, Any]:
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

    # Emit event (fire and forget — uses the running event loop)
    bus = request.app.state.event_bus
    loop = asyncio.get_event_loop()
    loop.create_task(
        bus.emit(
            {
                "type": "pack:created",
                "slug": req.slug,
                "name": req.name,
                "path": str(target),
            }
        )
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
```

- [ ] **Step 1.5: Mount router in server.py**

Edit `packages/api/myvoice/server.py` `create_app` — add the import and `app.include_router(packs_admin_router)`:

```python
from myvoice.api.packs_admin import router as packs_admin_router
# ...
app.include_router(packs_admin_router)
```
(Add alongside the existing `app.include_router(...)` calls.)

- [ ] **Step 1.6: Run tests, lint, mypy**

```bash
cd /Users/dbbaskette/Projects/myvoice
uv run pytest packages/api/tests/api/test_packs_create.py -v
uv run ruff check packages/api
uv run mypy packages/api
uv run pytest packages/api/tests/ -q
```

All must pass. The full suite goes from 139 to 144 (5 new tests).

- [ ] **Step 1.7: Commit**

```bash
git add packages/api
git commit -m "$(cat <<'EOF'
feat(api): POST /api/packs — create from _template

Copies the bundled _template pack into MYVOICE_PACKS_ROOT (or
~/.myvoice/packs/) under the requested slug, patches the manifest
with the user's slug/name/author/version/description and persona,
re-indexes the PackStore, and emits a pack:created event. Slug regex
^[a-z0-9][a-z0-9-_]*$ keeps directory names filesystem-safe. 409 on
slug conflict.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Backend: `DELETE /api/packs/{slug}`

**Files:**
- Modify: `packages/api/myvoice/api/packs_admin.py` (add DELETE handler)
- Modify: `packages/api/myvoice/packs/templates.py` (add `resolve_trash_root()`)
- Create: `packages/api/tests/api/test_packs_delete.py`

- [ ] **Step 2.1: Add `resolve_trash_root` helper**

Edit `packages/api/myvoice/packs/templates.py`, add:
```python
def resolve_trash_root() -> Path:
    """Where soft-deleted packs go. MYVOICE_PACKS_ROOT-parent/trash if set, else ~/.myvoice/trash/."""
    env = os.environ.get("MYVOICE_PACKS_ROOT")
    if env:
        return Path(env).parent / "trash"
    return Path.home() / ".myvoice" / "trash"
```

- [ ] **Step 2.2: Write failing delete tests**

`packages/api/tests/api/test_packs_delete.py`:
```python
"""Tests for DELETE /api/packs/{slug}."""
from __future__ import annotations

import shutil
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from myvoice.server import create_app

_REPO_ROOT = Path(__file__).resolve().parents[4]
_TEMPLATE_SRC = _REPO_ROOT / "packs" / "_template"
_DAN_SRC = _REPO_ROOT / "packs" / "dan"


@pytest.fixture
def delete_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[tuple[TestClient, Path]]:
    """TestClient with an isolated packs root containing dan + _template.

    Yields (client, packs_root). Trash root resolves to <tmp_path>/trash.
    """
    packs_root = tmp_path / "packs"
    packs_root.mkdir()
    shutil.copytree(_TEMPLATE_SRC, packs_root / "_template")
    shutil.copytree(_DAN_SRC, packs_root / "dan")
    monkeypatch.setenv("MYVOICE_PACKS_ROOT", str(packs_root))
    monkeypatch.setenv("MYVOICE_CONFIG_PATH", str(tmp_path / "config.yaml"))
    app = create_app()
    with TestClient(app) as c:
        yield c, packs_root


def test_delete_pack_success(delete_client: tuple[TestClient, Path]) -> None:
    client, packs_root = delete_client
    # Sanity: dan exists
    assert client.get("/api/packs/dan").status_code == 200
    r = client.delete("/api/packs/dan")
    assert r.status_code == 204, r.text
    # Pack gone from API
    assert client.get("/api/packs/dan").status_code == 404
    # Original dir gone
    assert not (packs_root / "dan").exists()
    # Trash entry created
    trash_root = packs_root.parent / "trash"
    assert trash_root.exists()
    entries = list(trash_root.iterdir())
    assert len(entries) == 1
    assert entries[0].name.endswith("-dan")
    # Manifest survived in trash
    assert (entries[0] / "stylepack.yaml").is_file()


def test_delete_unknown_pack_returns_404(delete_client: tuple[TestClient, Path]) -> None:
    client, _ = delete_client
    r = client.delete("/api/packs/nonexistent")
    assert r.status_code == 404


def test_delete_pack_emits_event(delete_client: tuple[TestClient, Path]) -> None:
    import asyncio
    from typing import cast

    from fastapi import FastAPI

    client, _ = delete_client
    app = cast(FastAPI, client.app)
    bus = app.state.event_bus

    loop = asyncio.new_event_loop()
    try:
        q = loop.run_until_complete(bus.subscribe())

        async def collect_one() -> dict:
            return await asyncio.wait_for(q.get(), timeout=3.0)

        r = client.delete("/api/packs/dan")
        assert r.status_code == 204
        evt = loop.run_until_complete(collect_one())
    finally:
        loop.run_until_complete(bus.unsubscribe(q))
        loop.close()

    assert evt["type"] == "pack:deleted"
    assert evt["slug"] == "dan"
```

Run: `uv run pytest packages/api/tests/api/test_packs_delete.py -v`
Expected: FAIL — endpoint doesn't exist.

- [ ] **Step 2.3: Implement DELETE endpoint**

Add to `packages/api/myvoice/api/packs_admin.py`:
```python
from datetime import datetime, timezone

from myvoice.packs.templates import resolve_trash_root


@router.delete("/{slug}", status_code=204)
def delete_pack(slug: str, request: Request) -> None:
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
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    trash_target = trash_root / f"{ts}-{slug}"

    try:
        shutil.move(str(info.root_path), str(trash_target))
    except OSError:
        # Cross-device fallback
        shutil.copytree(info.root_path, trash_target)
        shutil.rmtree(info.root_path, ignore_errors=True)

    store.rescan_one(slug)

    bus = request.app.state.event_bus
    loop = asyncio.get_event_loop()
    loop.create_task(bus.emit({"type": "pack:deleted", "slug": slug}))
```

- [ ] **Step 2.4: Run tests, lint, mypy, commit**

```bash
uv run pytest packages/api/tests/ -q
uv run ruff check packages/api
uv run mypy packages/api
git add packages/api
git commit -m "$(cat <<'EOF'
feat(api): DELETE /api/packs/{slug} — soft-delete to trash

Moves the pack directory to <trash_root>/<UTC-timestamp>-<slug>/.
Trash root is `~/.myvoice/trash/` or `<MYVOICE_PACKS_ROOT_parent>/trash`
for test isolation. Falls back to copytree+rmtree on cross-device.
Re-indexes the store via rescan_one (which detects the missing
manifest and drops the entry) and emits pack:deleted on /api/events.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Frontend: `+ New pack` dialog + useGlobalEvents

**Files:**
- Modify: `packages/web/src/api/packs.ts` (add `createPack`, `deletePack`)
- Create: `packages/web/src/hooks/useGlobalEvents.ts`
- Create: `packages/web/tests/hooks/useGlobalEvents.test.ts`
- Create: `packages/web/src/components/packs/NewPackDialog.tsx`
- Create: `packages/web/tests/components/packs/NewPackDialog.test.tsx`
- Modify: `packages/web/src/components/PackList.tsx` (subscribe + render "+ New pack" button)

- [ ] **Step 3.1: Add API client methods**

Edit `packages/web/src/api/packs.ts` — append:
```typescript
export interface CreatePackRequest {
  slug: string;
  name: string;
  author: string;
  persona_identity: string;
  persona_one_line: string;
  version?: string;
  description?: string;
}

export async function createPack(req: CreatePackRequest): Promise<PackSummary> {
  return apiFetch<PackSummary>("/api/packs", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function deletePack(slug: string): Promise<void> {
  const res = await fetch(`/api/packs/${encodeURIComponent(slug)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    throw new Error(`HTTP ${res.status} deleting pack ${slug}`);
  }
}
```

Note: `apiFetch` expects JSON responses; the DELETE endpoint returns 204 (no body), so it calls `fetch` directly.

- [ ] **Step 3.2: useGlobalEvents hook**

`packages/web/src/hooks/useGlobalEvents.ts`:
```typescript
import { useEffect } from "react";

export interface GlobalEvent {
  type: "pack:created" | "pack:updated" | "pack:deleted" | "pack:invalid" | "config:updated";
  slug?: string;
  [key: string]: unknown;
}

export function useGlobalEvents(onEvent: (evt: GlobalEvent) => void): void {
  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onmessage = (e) => {
      try {
        onEvent(JSON.parse(e.data) as GlobalEvent);
      } catch {
        // ignore malformed
      }
    };
    es.onerror = () => {
      es.close();
    };
    return () => es.close();
  }, [onEvent]);
}
```

- [ ] **Step 3.3: useGlobalEvents test**

`packages/web/tests/hooks/useGlobalEvents.test.ts`:
```typescript
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { useGlobalEvents } from "../../src/hooks/useGlobalEvents";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  closed = false;
  url: string;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  close(): void {
    this.closed = true;
  }
  emit(data: unknown): void {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(data) }));
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useGlobalEvents", () => {
  it("opens an EventSource and dispatches parsed events", () => {
    const onEvent = vi.fn();
    renderHook(() => useGlobalEvents(onEvent));
    expect(FakeEventSource.instances).toHaveLength(1);
    const es = FakeEventSource.instances[0];
    expect(es.url).toBe("/api/events");
    es.emit({ type: "pack:created", slug: "alice" });
    expect(onEvent).toHaveBeenCalledWith({ type: "pack:created", slug: "alice" });
  });

  it("closes the EventSource on unmount", () => {
    const { unmount } = renderHook(() => useGlobalEvents(() => {}));
    const es = FakeEventSource.instances[0];
    expect(es.closed).toBe(false);
    unmount();
    expect(es.closed).toBe(true);
  });

  it("ignores malformed messages", () => {
    const onEvent = vi.fn();
    renderHook(() => useGlobalEvents(onEvent));
    const es = FakeEventSource.instances[0];
    es.onmessage?.(new MessageEvent("message", { data: "not json" }));
    expect(onEvent).not.toHaveBeenCalled();
  });
});
```

Run: `cd packages/web && pnpm test tests/hooks/useGlobalEvents.test.ts`
Expected: PASS after creating the hook (run after Step 3.2).

- [ ] **Step 3.4: NewPackDialog component**

`packages/web/src/components/packs/NewPackDialog.tsx`:
```tsx
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { createPack } from "../../api/packs";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9\-_]*$/;

interface NewPackDialogProps {
  open: boolean;
  onClose: () => void;
}

export function NewPackDialog({ open, onClose }: NewPackDialogProps): JSX.Element | null {
  const navigate = useNavigate();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [author, setAuthor] = useState("");
  const [identity, setIdentity] = useState("");
  const [oneLine, setOneLine] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const slugValid = SLUG_PATTERN.test(slug);
  const canSubmit =
    !submitting &&
    slugValid &&
    name.trim() !== "" &&
    author.trim() !== "" &&
    identity.trim() !== "" &&
    oneLine.trim() !== "";

  const reset = (): void => {
    setSlug("");
    setName("");
    setAuthor("");
    setIdentity("");
    setOneLine("");
    setDescription("");
    setSlugError(null);
    setError(null);
  };

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setSubmitting(true);
    setSlugError(null);
    setError(null);
    try {
      await createPack({
        slug,
        name,
        author,
        persona_identity: identity,
        persona_one_line: oneLine,
        description: description.trim() || undefined,
      });
      const newSlug = slug;
      reset();
      onClose();
      navigate(`/packs/${encodeURIComponent(newSlug)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("409") || msg.toLowerCase().includes("slug_conflict")) {
        setSlugError("A pack with this slug already exists.");
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
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="button"
      tabIndex={-1}
    >
      <form
        className="bg-slate-900 border border-slate-700 rounded-lg p-6 w-[480px] max-w-[90vw] space-y-4"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        aria-label="New pack"
      >
        <h2 className="text-lg font-semibold text-slate-100">New pack</h2>

        <Field label="Slug" htmlFor="np-slug" hint="lowercase, hyphens, no spaces" error={slugError}>
          <input
            id="np-slug"
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="alice"
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
            autoFocus
          />
          {!slugValid && slug !== "" && (
            <p className="text-amber-400 text-xs mt-1">Must match ^[a-z0-9][a-z0-9-_]*$</p>
          )}
        </Field>

        <Field label="Name" htmlFor="np-name">
          <input
            id="np-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
          />
        </Field>

        <Field label="Author" htmlFor="np-author">
          <input
            id="np-author"
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
          />
        </Field>

        <Field label="Persona identity" htmlFor="np-identity" hint="A short tagline">
          <input
            id="np-identity"
            type="text"
            value={identity}
            onChange={(e) => setIdentity(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
          />
        </Field>

        <Field label="Persona one-line" htmlFor="np-oneline" hint="One sentence of stance">
          <input
            id="np-oneline"
            type="text"
            value={oneLine}
            onChange={(e) => setOneLine(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
          />
        </Field>

        <Field label="Description (optional)" htmlFor="np-desc">
          <textarea
            id="np-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 h-16"
          />
        </Field>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            className="px-3 py-1.5 text-sm border border-slate-700 rounded text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create pack"}
          </button>
        </div>
      </form>
    </div>
  );
}

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}

function Field({ label, htmlFor, hint, error, children }: FieldProps): JSX.Element {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-200 mb-1">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-slate-500 text-xs mt-1">{hint}</p>}
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3.5: NewPackDialog test**

`packages/web/tests/components/packs/NewPackDialog.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NewPackDialog } from "../../../src/components/packs/NewPackDialog";

const mockCreate = vi.hoisted(() => vi.fn());
vi.mock("../../../src/api/packs", () => ({ createPack: mockCreate }));

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

beforeEach(() => {
  mockCreate.mockReset();
  mockNavigate.mockReset();
});

describe("NewPackDialog", () => {
  it("does not render when closed", () => {
    const { container } = render(
      <MemoryRouter>
        <NewPackDialog open={false} onClose={() => {}} />
      </MemoryRouter>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("disables submit until all required fields are valid", () => {
    render(
      <MemoryRouter>
        <NewPackDialog open={true} onClose={() => {}} />
      </MemoryRouter>,
    );
    const submit = screen.getByRole("button", { name: /Create pack/i });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Alice" } });
    fireEvent.change(screen.getByLabelText("Author"), { target: { value: "A" } });
    fireEvent.change(screen.getByLabelText("Persona identity"), { target: { value: "i" } });
    fireEvent.change(screen.getByLabelText("Persona one-line"), { target: { value: "o" } });
    expect(submit).toBeEnabled();
  });

  it("rejects bad slugs", () => {
    render(
      <MemoryRouter>
        <NewPackDialog open={true} onClose={() => {}} />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "Foo Bar" } });
    expect(screen.getByText(/Must match/)).toBeInTheDocument();
  });

  it("submits and navigates on success", async () => {
    mockCreate.mockResolvedValue({ slug: "alice", name: "Alice", version: "0.1.0", valid: true, error_count: 0 });
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <NewPackDialog open={true} onClose={onClose} />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Alice" } });
    fireEvent.change(screen.getByLabelText("Author"), { target: { value: "A" } });
    fireEvent.change(screen.getByLabelText("Persona identity"), { target: { value: "i" } });
    fireEvent.change(screen.getByLabelText("Persona one-line"), { target: { value: "o" } });
    fireEvent.click(screen.getByRole("button", { name: /Create pack/i }));
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith("/packs/alice");
    });
  });

  it("shows inline error on slug_conflict (409)", async () => {
    mockCreate.mockRejectedValue(new Error("HTTP 409 on /api/packs: slug_conflict"));
    render(
      <MemoryRouter>
        <NewPackDialog open={true} onClose={() => {}} />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Alice" } });
    fireEvent.change(screen.getByLabelText("Author"), { target: { value: "A" } });
    fireEvent.change(screen.getByLabelText("Persona identity"), { target: { value: "i" } });
    fireEvent.change(screen.getByLabelText("Persona one-line"), { target: { value: "o" } });
    fireEvent.click(screen.getByRole("button", { name: /Create pack/i }));
    await waitFor(() => {
      expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 3.6: Wire PackList**

Edit `packages/web/src/components/PackList.tsx`:

Replace the body of the component to add a "+ New pack" button at the bottom and subscribe to `useGlobalEvents`. Full replacement file:

```tsx
import { useCallback, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

import { type PackSummary, listPacks } from "../api/packs";
import { type GlobalEvent, useGlobalEvents } from "../hooks/useGlobalEvents";
import { NewPackDialog } from "./packs/NewPackDialog";

interface PackListProps {
  className?: string;
}

const BADGE_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-purple-500",
  "bg-amber-500",
  "bg-pink-500",
  "bg-teal-500",
];

function badgeColor(slug: string): string {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return BADGE_COLORS[h % BADGE_COLORS.length];
}

export function PackList({ className }: PackListProps): JSX.Element {
  const [packs, setPacks] = useState<PackSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const reload = useCallback(() => {
    const abort = new AbortController();
    listPacks({ signal: abort.signal })
      .then((data) => setPacks(data))
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, []);

  useEffect(() => reload(), [reload]);

  const onEvent = useCallback(
    (evt: GlobalEvent) => {
      if (
        evt.type === "pack:created" ||
        evt.type === "pack:deleted" ||
        evt.type === "pack:updated" ||
        evt.type === "pack:invalid"
      ) {
        reload();
      }
    },
    [reload],
  );
  useGlobalEvents(onEvent);

  return (
    <div className={className}>
      {error && <p className="text-red-400 text-xs px-2 py-1">Error: {error}</p>}
      {packs === null && !error && <p className="text-slate-500 text-xs px-2 py-1">Loading…</p>}
      {packs !== null && packs.length === 0 && (
        <p className="text-slate-500 text-xs px-2 py-1">No packs found.</p>
      )}
      {packs?.map((p) => (
        <NavLink
          key={p.slug}
          to={`/packs/${encodeURIComponent(p.slug)}`}
          className={({ isActive }) =>
            `flex items-center gap-2 px-2 py-1 text-sm rounded ${isActive ? "bg-blue-900/40 text-blue-100" : "text-slate-300 hover:bg-slate-800/60"}`
          }
        >
          <span
            className={`inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-semibold text-white ${badgeColor(
              p.slug,
            )}`}
          >
            {p.slug[0]?.toUpperCase() ?? "?"}
          </span>
          <span className="truncate flex-1">{p.slug}</span>
          {!p.valid && (
            <span
              className="text-red-400 text-xs"
              title={`${p.error_count} validation error(s)`}
            >
              ✕
            </span>
          )}
        </NavLink>
      ))}
      <button
        type="button"
        onClick={() => setNewOpen(true)}
        className="mt-2 w-full px-2 py-2 text-sm border border-dashed border-slate-700 rounded text-slate-400 hover:text-slate-100 hover:border-slate-500"
      >
        + New pack
      </button>
      <NewPackDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 3.7: Run frontend checks + commit**

```bash
cd packages/web
pnpm test
pnpm lint
pnpm build  # also typechecks
cd ../..
git add packages/web
git commit -m "$(cat <<'EOF'
feat(web): + New pack dialog + sidebar live refresh via /api/events

Adds:
- createPack/deletePack API clients
- useGlobalEvents hook (EventSource wrapper for /api/events)
- NewPackDialog with slug regex validation, 409 → inline slug error,
  navigates to /packs/<slug> on success
- "+ New pack" button at the bottom of PackList; sidebar reloads on
  pack:created/updated/deleted/invalid events

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — Frontend: ManifestForm + section components

**Files:**
- Create: `packages/web/src/api/manifest.ts`
- Create: `packages/web/src/components/manifest/TagInput.tsx`
- Create: `packages/web/tests/components/manifest/TagInput.test.tsx`
- Create: `packages/web/src/components/manifest/ExceptionsTable.tsx`
- Create: `packages/web/tests/components/manifest/ExceptionsTable.test.tsx`
- Create: `packages/web/src/components/manifest/{PackMetadataSection,PersonaSection,BanishedSection,RulesSection,PopCultureSection,EntriesSection}.tsx`
- Create: `packages/web/src/components/manifest/ManifestForm.tsx`
- Create: `packages/web/tests/components/manifest/ManifestForm.test.tsx`
- Modify: `packages/web/src/routes/PackDetailPage.tsx` (replace `ManifestStub` with `<ManifestForm slug={slug} />`)

- [ ] **Step 4.1: Manifest typed interface + putManifest**

`packages/web/src/api/manifest.ts`:
```typescript
import { apiFetch } from "./client";
import type { PackSummary } from "./packs";

export interface PermittedException {
  term: string;
  reason: string;
}

export interface Banished {
  words: string[];
  phrases: string[];
  permitted_exceptions: PermittedException[];
}

export interface Rules {
  no_em_dashes: boolean;
  no_ascii_double_hyphen_between_letters: boolean;
  no_sentence_starters: string[];
}

export interface PopCulture {
  allowed: string[];
  banned: string[];
}

export interface FormatEntry {
  name: string;
  file: string;
  description?: string | null;
}

export interface SampleEntry {
  id: string;
  file: string;
  description?: string | null;
}

export interface BioEntry {
  name: string;
  file: string;
  max_chars?: number | null;
  target_words?: number | null;
  third_person?: boolean;
  description?: string | null;
}

export interface PackInfo {
  slug: string;
  name: string;
  version: string;
  author: string;
  description?: string | null;
  homepage?: string | null;
}

export interface Persona {
  identity: string;
  one_line: string;
}

export interface Manifest {
  spec_version: "1.0";
  pack: PackInfo;
  persona: Persona;
  banished: Banished;
  rules: Rules;
  pop_culture: PopCulture;
  formats: FormatEntry[];
  samples: SampleEntry[];
  bios: BioEntry[];
}

export async function putManifest(slug: string, manifest: Manifest): Promise<PackSummary> {
  return apiFetch<PackSummary>(`/api/packs/${encodeURIComponent(slug)}/manifest`, {
    method: "PUT",
    body: JSON.stringify(manifest),
  });
}
```

- [ ] **Step 4.2: TagInput component**

`packages/web/src/components/manifest/TagInput.tsx`:
```tsx
import { type KeyboardEvent, useState } from "react";

interface TagInputProps {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  htmlId: string;
}

export function TagInput({ label, values, onChange, placeholder, htmlId }: TagInputProps): JSX.Element {
  const [text, setText] = useState("");

  const add = (): void => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (values.includes(trimmed)) {
      setText("");
      return;
    }
    onChange([...values, trimmed]);
    setText("");
  };

  const remove = (i: number): void => {
    onChange(values.filter((_, idx) => idx !== i));
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };

  return (
    <div>
      <label htmlFor={htmlId} className="block text-sm font-medium text-slate-200 mb-1">
        {label}
      </label>
      <div className="flex flex-wrap gap-1 mb-2">
        {values.map((v, i) => (
          <span
            key={`${v}-${i}`}
            className="inline-flex items-center gap-1 bg-slate-800 text-slate-200 px-2 py-0.5 rounded-full text-xs"
          >
            {v}
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove ${v}`}
              className="text-slate-400 hover:text-red-400"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        id={htmlId}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKey}
        placeholder={placeholder ?? "Type and press Enter…"}
        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 text-sm"
      />
    </div>
  );
}
```

- [ ] **Step 4.3: TagInput test**

`packages/web/tests/components/manifest/TagInput.test.tsx`:
```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TagInput } from "../../../src/components/manifest/TagInput";

describe("TagInput", () => {
  it("renders existing values as chips", () => {
    render(<TagInput htmlId="t1" label="Words" values={["foo", "bar"]} onChange={() => {}} />);
    expect(screen.getByText("foo")).toBeInTheDocument();
    expect(screen.getByText("bar")).toBeInTheDocument();
  });

  it("adds a value on Enter", () => {
    const onChange = vi.fn();
    render(<TagInput htmlId="t1" label="Words" values={["foo"]} onChange={onChange} />);
    const input = screen.getByLabelText("Words");
    fireEvent.change(input, { target: { value: "bar" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["foo", "bar"]);
  });

  it("ignores empty submissions", () => {
    const onChange = vi.fn();
    render(<TagInput htmlId="t1" label="Words" values={["foo"]} onChange={onChange} />);
    const input = screen.getByLabelText("Words");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("rejects duplicates silently", () => {
    const onChange = vi.fn();
    render(<TagInput htmlId="t1" label="Words" values={["foo"]} onChange={onChange} />);
    const input = screen.getByLabelText("Words");
    fireEvent.change(input, { target: { value: "foo" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes a value via the X button", () => {
    const onChange = vi.fn();
    render(<TagInput htmlId="t1" label="Words" values={["foo", "bar"]} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Remove foo"));
    expect(onChange).toHaveBeenCalledWith(["bar"]);
  });
});
```

- [ ] **Step 4.4: ExceptionsTable component**

`packages/web/src/components/manifest/ExceptionsTable.tsx`:
```tsx
import { useState } from "react";

import type { PermittedException } from "../../api/manifest";

interface ExceptionsTableProps {
  values: PermittedException[];
  onChange: (next: PermittedException[]) => void;
}

export function ExceptionsTable({ values, onChange }: ExceptionsTableProps): JSX.Element {
  const [newTerm, setNewTerm] = useState("");
  const [newReason, setNewReason] = useState("");

  const updateRow = (i: number, patch: Partial<PermittedException>): void => {
    onChange(values.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  };
  const removeRow = (i: number): void => {
    onChange(values.filter((_, idx) => idx !== i));
  };
  const addRow = (): void => {
    if (!newTerm.trim() || !newReason.trim()) return;
    onChange([...values, { term: newTerm.trim(), reason: newReason.trim() }]);
    setNewTerm("");
    setNewReason("");
  };

  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-400 text-xs uppercase border-b border-slate-800">
            <th className="py-2 w-1/3">Term</th>
            <th className="py-2">Reason</th>
            <th className="py-2 w-8" aria-label="remove" />
          </tr>
        </thead>
        <tbody>
          {values.map((row, i) => (
            <tr key={i} className="border-b border-slate-800">
              <td className="py-1 pr-2">
                <input
                  type="text"
                  value={row.term}
                  onChange={(e) => updateRow(i, { term: e.target.value })}
                  aria-label={`Exception ${i + 1} term`}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-100"
                />
              </td>
              <td className="py-1 pr-2">
                <input
                  type="text"
                  value={row.reason}
                  onChange={(e) => updateRow(i, { reason: e.target.value })}
                  aria-label={`Exception ${i + 1} reason`}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-100"
                />
              </td>
              <td className="py-1">
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  aria-label={`Remove exception ${row.term}`}
                  className="text-slate-500 hover:text-red-400"
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
          <tr>
            <td className="py-2 pr-2">
              <input
                type="text"
                value={newTerm}
                onChange={(e) => setNewTerm(e.target.value)}
                placeholder="term"
                aria-label="New exception term"
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-100"
              />
            </td>
            <td className="py-2 pr-2">
              <input
                type="text"
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                placeholder="reason"
                aria-label="New exception reason"
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-100"
              />
            </td>
            <td className="py-2 text-right">
              <button
                type="button"
                onClick={addRow}
                disabled={!newTerm.trim() || !newReason.trim()}
                className="text-xs text-emerald-400 hover:text-emerald-300 disabled:opacity-40"
              >
                Add
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4.5: ExceptionsTable test**

`packages/web/tests/components/manifest/ExceptionsTable.test.tsx`:
```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ExceptionsTable } from "../../../src/components/manifest/ExceptionsTable";

describe("ExceptionsTable", () => {
  it("renders existing rows", () => {
    render(
      <ExceptionsTable
        values={[
          { term: "Pivotal", reason: "Proper noun" },
          { term: "unlock", reason: "Speed-to-value vocabulary" },
        ]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByDisplayValue("Pivotal")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Proper noun")).toBeInTheDocument();
  });

  it("adds a new row", () => {
    const onChange = vi.fn();
    render(<ExceptionsTable values={[]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("New exception term"), { target: { value: "foo" } });
    fireEvent.change(screen.getByLabelText("New exception reason"), { target: { value: "bar" } });
    fireEvent.click(screen.getByText("Add"));
    expect(onChange).toHaveBeenCalledWith([{ term: "foo", reason: "bar" }]);
  });

  it("updates a row in place", () => {
    const onChange = vi.fn();
    render(
      <ExceptionsTable values={[{ term: "foo", reason: "bar" }]} onChange={onChange} />,
    );
    fireEvent.change(screen.getByLabelText("Exception 1 reason"), {
      target: { value: "new reason" },
    });
    expect(onChange).toHaveBeenCalledWith([{ term: "foo", reason: "new reason" }]);
  });

  it("removes a row", () => {
    const onChange = vi.fn();
    render(
      <ExceptionsTable
        values={[
          { term: "a", reason: "1" },
          { term: "b", reason: "2" },
        ]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("Remove exception a"));
    expect(onChange).toHaveBeenCalledWith([{ term: "b", reason: "2" }]);
  });
});
```

- [ ] **Step 4.6: Section components**

Each section is a thin controlled component that reads its slice of the draft and emits a typed `onChange` callback. Implementer writes one .tsx file per section following this contract. Brief sketches below show the exact shape — copy them, expand markup to match `SettingsPage` styling. All five live in `packages/web/src/components/manifest/`.

**`PackMetadataSection.tsx`**:
```tsx
import type { PackInfo } from "../../api/manifest";

interface Props {
  pack: PackInfo;
  onChange: (next: PackInfo) => void;
  errors: Record<string, string>;
}

export function PackMetadataSection({ pack, onChange, errors }: Props): JSX.Element {
  const set = <K extends keyof PackInfo>(k: K, v: PackInfo[K]): void => onChange({ ...pack, [k]: v });
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-100">Pack</h2>
      <Field label="Slug" id="pm-slug" hint="Renaming not yet supported">
        <input id="pm-slug" type="text" value={pack.slug} disabled className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-500" />
      </Field>
      <Field label="Name" id="pm-name" error={errors["pack.name"]}>
        <input id="pm-name" type="text" value={pack.name} onChange={(e) => set("name", e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100" />
      </Field>
      <Field label="Version" id="pm-version" error={errors["pack.version"]}>
        <input id="pm-version" type="text" value={pack.version} onChange={(e) => set("version", e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100" />
      </Field>
      <Field label="Author" id="pm-author" error={errors["pack.author"]}>
        <input id="pm-author" type="text" value={pack.author} onChange={(e) => set("author", e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100" />
      </Field>
      <Field label="Description" id="pm-desc">
        <textarea id="pm-desc" value={pack.description ?? ""} onChange={(e) => set("description", e.target.value || null)} className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 h-20" />
      </Field>
      <Field label="Homepage" id="pm-home">
        <input id="pm-home" type="text" value={pack.homepage ?? ""} onChange={(e) => set("homepage", e.target.value || null)} className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100" />
      </Field>
    </section>
  );
}

interface FieldProps { label: string; id: string; hint?: string; error?: string; children: React.ReactNode; }
function Field({ label, id, hint, error, children }: FieldProps): JSX.Element {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-200 mb-1">{label}</label>
      {children}
      {hint && !error && <p className="text-slate-500 text-xs mt-1">{hint}</p>}
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}
```

**`PersonaSection.tsx`**: identical pattern, fields `identity` and `one_line`, paths `persona.identity` / `persona.one_line` for errors.

**`BanishedSection.tsx`**: uses `TagInput` for `words` (id `bs-words`) and `phrases` (id `bs-phrases`), and `ExceptionsTable` for `permitted_exceptions`. Wraps in `<section><h2>Banished</h2>…</section>`.

**`RulesSection.tsx`**: two `<input type="checkbox">` toggles for `no_em_dashes` and `no_ascii_double_hyphen_between_letters`, plus `TagInput` for `no_sentence_starters` (id `rs-starters`).

**`PopCultureSection.tsx`**: two `TagInput`s for `allowed` (id `pc-allowed`) and `banned` (id `pc-banned`).

**`EntriesSection.tsx`** (read-only):
```tsx
import { Link } from "react-router-dom";

interface Props {
  slug: string;
  formatsCount: number;
  samplesCount: number;
  biosCount: number;
}

export function EntriesSection({ slug, formatsCount, samplesCount, biosCount }: Props): JSX.Element {
  const slugEnc = encodeURIComponent(slug);
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-100">Entries</h2>
      <p className="text-slate-500 text-xs">Add or remove entries by editing files in the sub-tabs.</p>
      <div className="grid grid-cols-3 gap-3">
        <EntryCard label="Formats" count={formatsCount} to={`/packs/${slugEnc}/formats`} />
        <EntryCard label="Samples" count={samplesCount} to={`/packs/${slugEnc}/samples`} />
        <EntryCard label="Bios" count={biosCount} to={`/packs/${slugEnc}/bios`} />
      </div>
    </section>
  );
}

function EntryCard({ label, count, to }: { label: string; count: number; to: string }): JSX.Element {
  return (
    <Link to={to} className="block bg-slate-900 border border-slate-800 rounded p-3 hover:border-slate-600">
      <div className="text-slate-100 font-semibold">{label}</div>
      <div className="text-slate-400 text-sm">{count} entries</div>
      <div className="text-slate-500 text-xs mt-1">Edit on the {label} tab →</div>
    </Link>
  );
}
```

- [ ] **Step 4.7: ManifestForm**

`packages/web/src/components/manifest/ManifestForm.tsx`:
```tsx
import { useEffect, useState } from "react";

import { getManifest } from "../../api/packs";
import { type Manifest, putManifest } from "../../api/manifest";
import { BanishedSection } from "./BanishedSection";
import { EntriesSection } from "./EntriesSection";
import { PackMetadataSection } from "./PackMetadataSection";
import { PersonaSection } from "./PersonaSection";
import { PopCultureSection } from "./PopCultureSection";
import { RulesSection } from "./RulesSection";

interface ManifestFormProps {
  slug: string;
}

export function ManifestForm({ slug }: ManifestFormProps): JSX.Element {
  const [loaded, setLoaded] = useState<Manifest | null>(null);
  const [draft, setDraft] = useState<Manifest | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    getManifest(slug)
      .then((data) => {
        if (aborted) return;
        const m = data as unknown as Manifest;
        setLoaded(m);
        setDraft(structuredClone(m));
      })
      .catch((e: Error) => setBanner(e.message));
    return () => {
      aborted = true;
    };
  }, [slug]);

  if (!draft || !loaded) return <div className="p-6 text-slate-500">Loading manifest…</div>;

  const dirty = JSON.stringify(loaded) !== JSON.stringify(draft);

  const discard = (): void => {
    setDraft(structuredClone(loaded));
    setErrors({});
    setBanner(null);
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    setErrors({});
    setBanner(null);
    try {
      await putManifest(slug, draft);
      // Reload from server (which normalizes)
      const fresh = (await getManifest(slug)) as unknown as Manifest;
      setLoaded(fresh);
      setDraft(structuredClone(fresh));
      setToast("Manifest saved.");
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Best-effort parse of 422 errors from apiFetch's thrown message
      try {
        const m = msg.match(/\{.*\}/);
        if (m) {
          const parsed = JSON.parse(m[0]);
          const errList = parsed?.detail?.errors as Array<{ path: string; message: string }> | undefined;
          if (errList) {
            const next: Record<string, string> = {};
            for (const e of errList) next[e.path] = e.message;
            setErrors(next);
            setBanner(`Validation failed: ${errList.length} error(s).`);
            return;
          }
        }
      } catch {
        /* fall through */
      }
      setBanner(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="sticky top-0 -mx-6 px-6 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between z-10">
        <h1 className="text-lg font-semibold text-slate-100">Manifest</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={discard}
            disabled={!dirty || saving}
            className="px-3 py-1.5 text-sm border border-slate-700 rounded text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {banner && <div className="bg-red-900/40 border border-red-700 text-red-200 rounded p-3 text-sm">{banner}</div>}

      <PackMetadataSection
        pack={draft.pack}
        errors={errors}
        onChange={(next) => setDraft({ ...draft, pack: next })}
      />
      <PersonaSection
        persona={draft.persona}
        errors={errors}
        onChange={(next) => setDraft({ ...draft, persona: next })}
      />
      <BanishedSection
        banished={draft.banished}
        onChange={(next) => setDraft({ ...draft, banished: next })}
      />
      <RulesSection rules={draft.rules} onChange={(next) => setDraft({ ...draft, rules: next })} />
      <PopCultureSection
        popCulture={draft.pop_culture}
        onChange={(next) => setDraft({ ...draft, pop_culture: next })}
      />
      <EntriesSection
        slug={slug}
        formatsCount={draft.formats.length}
        samplesCount={draft.samples.length}
        biosCount={draft.bios.length}
      />

      {toast && (
        <div className="fixed bottom-4 right-4 bg-emerald-700 text-emerald-50 px-4 py-2 rounded shadow">
          {toast}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4.8: ManifestForm test**

`packages/web/tests/components/manifest/ManifestForm.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { ManifestForm } from "../../../src/components/manifest/ManifestForm";

const sampleManifest = {
  spec_version: "1.0",
  pack: { slug: "dan", name: "Dan", version: "3.0", author: "Dan", description: null, homepage: null },
  persona: { identity: "The Builder", one_line: "Ships." },
  banished: { words: ["delve"], phrases: [], permitted_exceptions: [] },
  rules: {
    no_em_dashes: true,
    no_ascii_double_hyphen_between_letters: true,
    no_sentence_starters: [],
  },
  pop_culture: { allowed: ["Marvel"], banned: [] },
  formats: [],
  samples: [],
  bios: [],
};

const mockGet = vi.hoisted(() => vi.fn());
const mockPut = vi.hoisted(() => vi.fn());

vi.mock("../../../src/api/packs", () => ({
  getManifest: mockGet,
}));
vi.mock("../../../src/api/manifest", async () => {
  const actual = await vi.importActual<typeof import("../../../src/api/manifest")>(
    "../../../src/api/manifest",
  );
  return { ...actual, putManifest: mockPut };
});

beforeEach(() => {
  mockGet.mockReset();
  mockPut.mockReset();
});

describe("ManifestForm", () => {
  it("loads manifest and renders sections", async () => {
    mockGet.mockResolvedValue(sampleManifest);
    render(
      <MemoryRouter>
        <ManifestForm slug="dan" />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByDisplayValue("Dan")).toBeInTheDocument());
    expect(screen.getByText("Pack")).toBeInTheDocument();
    expect(screen.getByText("Persona")).toBeInTheDocument();
    expect(screen.getByText("Banished")).toBeInTheDocument();
  });

  it("enables save when a field is edited", async () => {
    mockGet.mockResolvedValue(sampleManifest);
    render(
      <MemoryRouter>
        <ManifestForm slug="dan" />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByDisplayValue("Dan")).toBeInTheDocument());
    const save = screen.getByRole("button", { name: /Save changes/i });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Author"), { target: { value: "Dan Baskette" } });
    expect(save).toBeEnabled();
  });

  it("calls putManifest on save", async () => {
    mockGet.mockResolvedValueOnce(sampleManifest).mockResolvedValueOnce(sampleManifest);
    mockPut.mockResolvedValue({ slug: "dan", name: "Dan", version: "3.0", valid: true, error_count: 0 });
    render(
      <MemoryRouter>
        <ManifestForm slug="dan" />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByDisplayValue("Dan")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Author"), { target: { value: "Dan B" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));
    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    expect(mockPut.mock.calls[0][1].pack.author).toBe("Dan B");
  });
});
```

- [ ] **Step 4.9: Wire ManifestForm into PackDetailPage**

Edit `packages/web/src/routes/PackDetailPage.tsx`:

Replace the entire `ManifestStub` function with:
```tsx
function ManifestStub(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return <div />;
  return <ManifestForm slug={slug} />;
}
```

And add the import at the top:
```tsx
import { ManifestForm } from "../components/manifest/ManifestForm";
```

(Renaming `ManifestStub` itself is out of scope — leaving the wrapper means no other call sites need touching.)

- [ ] **Step 4.10: Run checks + commit**

```bash
cd packages/web
pnpm test
pnpm lint
pnpm build
cd ../..
git add packages/web
git commit -m "$(cat <<'EOF'
feat(web): ManifestForm replaces YAML stub with editable sections

ManifestForm owns draft/loaded state with a sticky Save/Discard bar
(mirrors SettingsPage). Five editable sections cover pack metadata,
persona, banished (words/phrases/exceptions), rules, and pop culture.
EntriesSection shows read-only counts with links to the existing
formats/samples/bios sub-tabs — entry list editing is deferred to
Phase 6. Slug is read-only with a "renaming not supported" hint.
422 validation errors from the server are mapped to inline field
highlights.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — Frontend: DeletePackDialog + Danger zone

**Files:**
- Create: `packages/web/src/components/packs/DeletePackDialog.tsx`
- Create: `packages/web/tests/components/packs/DeletePackDialog.test.tsx`
- Modify: `packages/web/src/components/manifest/ManifestForm.tsx` (add Danger zone footer with Delete pack button)

- [ ] **Step 5.1: DeletePackDialog**

`packages/web/src/components/packs/DeletePackDialog.tsx`:
```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { deletePack } from "../../api/packs";

interface DeletePackDialogProps {
  slug: string;
  open: boolean;
  onClose: () => void;
}

export function DeletePackDialog({ slug, open, onClose }: DeletePackDialogProps): JSX.Element | null {
  const navigate = useNavigate();
  const [typed, setTyped] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const canConfirm = typed === slug && !submitting;

  const confirm = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);
    try {
      await deletePack(slug);
      setTyped("");
      onClose();
      navigate("/packs");
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
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="button"
      tabIndex={-1}
    >
      <div
        className="bg-slate-900 border border-red-800 rounded-lg p-6 w-[480px] max-w-[90vw] space-y-4"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Delete pack"
      >
        <h2 className="text-lg font-semibold text-red-300">Delete pack {slug}</h2>
        <p className="text-slate-300 text-sm">
          This will move <code>{slug}</code> to <code>~/.myvoice/trash/</code>. The pack will be
          removed from your library. You can recover the files manually from the trash directory.
        </p>
        <div>
          <label htmlFor="del-confirm" className="block text-sm font-medium text-slate-200 mb-1">
            Type <code>{slug}</code> to confirm:
          </label>
          <input
            id="del-confirm"
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
            autoFocus
          />
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setTyped("");
              onClose();
            }}
            className="px-3 py-1.5 text-sm border border-slate-700 rounded text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!canConfirm}
            className="px-3 py-1.5 text-sm bg-red-700 hover:bg-red-600 text-white rounded disabled:opacity-50"
          >
            {submitting ? "Deleting…" : "Delete pack"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5.2: DeletePackDialog test**

`packages/web/tests/components/packs/DeletePackDialog.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DeletePackDialog } from "../../../src/components/packs/DeletePackDialog";

const mockDelete = vi.hoisted(() => vi.fn());
vi.mock("../../../src/api/packs", () => ({ deletePack: mockDelete }));

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

beforeEach(() => {
  mockDelete.mockReset();
  mockNavigate.mockReset();
});
afterEach(() => {});

describe("DeletePackDialog", () => {
  it("disables Delete until slug is typed exactly", () => {
    render(
      <MemoryRouter>
        <DeletePackDialog slug="alice" open={true} onClose={() => {}} />
      </MemoryRouter>,
    );
    const btn = screen.getByRole("button", { name: /Delete pack/i });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: "alic" } });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: "alice" } });
    expect(btn).toBeEnabled();
  });

  it("calls deletePack and navigates on success", async () => {
    mockDelete.mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <DeletePackDialog slug="alice" open={true} onClose={onClose} />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: "alice" } });
    fireEvent.click(screen.getByRole("button", { name: /Delete pack/i }));
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("alice");
      expect(onClose).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith("/packs");
    });
  });
});
```

- [ ] **Step 5.3: Wire Danger zone into ManifestForm**

Edit `packages/web/src/components/manifest/ManifestForm.tsx`. Add to the imports:
```tsx
import { DeletePackDialog } from "../packs/DeletePackDialog";
```

Add state inside the component (alongside `toast`):
```tsx
const [deleteOpen, setDeleteOpen] = useState(false);
```

Add at the very bottom of the returned JSX, before the `</div>` that closes the outer container — i.e. just below `EntriesSection`:
```tsx
<section className="space-y-3 pt-6 mt-6 border-t border-red-900/40">
  <h2 className="text-base font-semibold text-red-300">Danger zone</h2>
  <p className="text-slate-400 text-sm">
    Move this pack to ~/.myvoice/trash/. The files remain on disk and can be restored manually.
  </p>
  <button
    type="button"
    onClick={() => setDeleteOpen(true)}
    className="px-3 py-1.5 text-sm border border-red-700 text-red-300 rounded hover:bg-red-900/30"
  >
    Delete pack
  </button>
</section>
<DeletePackDialog slug={slug} open={deleteOpen} onClose={() => setDeleteOpen(false)} />
```

- [ ] **Step 5.4: Run checks + commit**

```bash
cd packages/web && pnpm test && pnpm lint && pnpm build && cd ../..
git add packages/web
git commit -m "$(cat <<'EOF'
feat(web): Delete pack dialog with slug-typed confirmation

Adds a Danger zone at the bottom of the ManifestForm with a Delete pack
button. Confirmation dialog requires typing the exact slug to enable
the Delete button. On success, calls DELETE /api/packs/{slug} and
navigates to /packs. The sidebar's useGlobalEvents subscription
auto-removes the pack on the resulting pack:deleted event.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — Playwright e2e + README + open PR

**Files:**
- Create: `e2e/pack-lifecycle.spec.ts`
- Modify: `README.md` (add a "Create a pack from the UI" note in the Packs section)

- [ ] **Step 6.1: pack-lifecycle.spec.ts**

`e2e/pack-lifecycle.spec.ts`:
```typescript
import { test, expect } from "@playwright/test";

/**
 * End-to-end pack lifecycle: create → edit manifest → delete.
 *
 * Uses the same MockProvider-backed backend as the other specs; this
 * spec touches only pack-management endpoints, no LLM calls.
 */
test("pack lifecycle: create, edit manifest, delete", async ({ page }) => {
  await page.goto("/");

  // Open the New pack dialog from the sidebar
  await page.click("text=+ New pack");
  await expect(page.getByRole("dialog", { name: /New pack/i })).toBeVisible({ timeout: 5000 });

  // Fill the form
  const stamp = Date.now().toString();
  const slug = `e2e-${stamp}`;
  await page.getByLabel("Slug").fill(slug);
  await page.getByLabel("Name").fill("E2E Voice");
  await page.getByLabel("Author").fill("E2E");
  await page.getByLabel("Persona identity").fill("The Tester");
  await page.getByLabel("Persona one-line").fill("Verifies the flow end to end.");
  await page.getByRole("button", { name: /Create pack/i }).click();

  // We should land on the new pack's detail page
  await page.waitForURL(new RegExp(`/packs/${slug}`), { timeout: 10_000 });

  // Navigate to Manifest tab
  await page.click("text=⚙ Manifest");
  await expect(page.getByText("Pack", { exact: true })).toBeVisible({ timeout: 10_000 });

  // Edit Author and save
  const author = page.getByLabel("Author");
  await expect(author).toHaveValue("E2E");
  await author.fill("E2E Updated");
  const save = page.getByRole("button", { name: /Save changes/i });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(save).toBeDisabled({ timeout: 5000 });

  // Open Danger zone → delete dialog
  await page.click("text=Delete pack");
  await expect(page.getByRole("dialog", { name: /Delete pack/i })).toBeVisible();
  await page.getByLabel(/Type/).fill(slug);
  await page.getByRole("button", { name: /Delete pack/i }).click();

  // Lands back on /packs
  await page.waitForURL(/\/packs$/, { timeout: 10_000 });

  // Pack should be gone from the sidebar
  await expect(page.locator(`text=${slug}`)).toHaveCount(0, { timeout: 10_000 });
});
```

- [ ] **Step 6.2: README update**

Edit `README.md` — find the existing "Style packs" or "Packs" section and append a brief note (one short paragraph + one code-fence-free sentence) describing the new UI flow. Example phrasing to drop in:

> **Create from the UI:** Click "+ New pack" in the sidebar, fill in slug, name, author, and persona. The new pack is created from the bundled `_template/` and you land on its detail page ready to edit. Use the Manifest tab to edit banished words, rules, and persona; the Danger zone at the bottom soft-deletes the pack to `~/.myvoice/trash/`.

- [ ] **Step 6.3: Run all tests locally**

```bash
cd /Users/dbbaskette/Projects/myvoice
uv run pytest packages/api/tests -q
uv run ruff check packages/api
uv run mypy packages/api
cd packages/web && pnpm test && pnpm lint && pnpm build && cd ../..
cd packages/web && pnpm exec playwright test --reporter=line --config=../../playwright.config.ts && cd ../..
```

All must pass.

- [ ] **Step 6.4: Commit + push + open PR**

```bash
git add e2e README.md
git commit -m "$(cat <<'EOF'
test(e2e): pack lifecycle (create → edit manifest → delete); docs: README

Playwright spec exercises the full Phase 5 flow against the mock-backed
backend: open New pack dialog from the sidebar, fill and submit, edit
the Manifest tab's Author field and save, open the Danger zone and
confirm deletion. README adds a "Create from the UI" note in the
packs section.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin phase-5-new-pack-and-manifest-forms
gh pr create --title "Phase 5: New pack + Manifest forms" --body "$(cat <<'EOF'
## Summary
- POST /api/packs creates a new pack from `_template/`, patches manifest, emits pack:created
- DELETE /api/packs/{slug} soft-deletes to `~/.myvoice/trash/<ts>-<slug>/`, emits pack:deleted
- "+ New pack" sidebar button + dialog (slug regex validation, 409 → inline error)
- useGlobalEvents hook subscribes the sidebar to /api/events for live refresh
- ManifestForm replaces the YAML stub with 5 editable sections (pack metadata, persona, banished, rules, pop culture); list entries stay read-only on the Manifest tab and link to the existing sub-tabs
- DeletePackDialog with slug-typed confirmation, wired into a Danger zone at the bottom of ManifestForm

Out of scope (deferred to Phase 6): slug rename, entry list editing for formats/samples/bios, restore-from-trash UI.

## Test plan
- [ ] uv run pytest passes
- [ ] uv run ruff check + mypy pass
- [ ] pnpm test + pnpm lint + pnpm build pass
- [ ] pnpm exec playwright test passes (pack-lifecycle, compose-rewrite, settings-keys)
- [ ] Manual: create pack via UI, edit manifest, delete; verify pack lands in ~/.myvoice/trash/
EOF
)"
```

---

## Self-review

**Spec coverage:**
- Spec §1.1 (POST /api/packs) → Task 1 ✓
- Spec §1.2 (DELETE) → Task 2 ✓
- Spec §1.3 (module structure: templates.py + packs_admin.py) → Tasks 1.1 + 1.4 ✓
- Spec §1.4 (backend tests: success / conflict / bad-slug / event emission / delete success / 404 / event) → Tasks 1.3 + 2.2 ✓
- Spec §2.1 (createPack, deletePack, Manifest interface, putManifest) → Tasks 3.1 + 4.1 ✓
- Spec §2.2 (useGlobalEvents) → Task 3.2 ✓
- Spec §2.3 (PackList live refresh + "+ New pack" button) → Task 3.6 ✓
- Spec §2.4 (NewPackDialog) → Task 3.4 ✓
- Spec §2.5 (ManifestForm + 5 section components + EntriesSection + TagInput + ExceptionsTable) → Task 4 ✓
- Spec §2.6 (DeletePackDialog + Danger zone) → Task 5 ✓
- Spec §2.7 (tests: Vitest per component + Playwright pack-lifecycle) → spread across Tasks 3–6 ✓
- Spec §3 (done-state) → Step 6.3 ✓
- Spec §4 (PR sequence) → matches Tasks 1–6 ✓

**Placeholder scan:** none. All code blocks complete. The "Brief sketches" in Step 4.6 are explicit shape descriptions for sibling components that all follow the `PackMetadataSection` pattern shown in full — that's repetition-elimination, not vagueness. Each section's interface (props + html ids + which TagInput/ExceptionsTable to compose) is fully specified.

**Type consistency:** `Manifest`/`PackInfo`/`Persona`/`Banished`/`Rules`/`PopCulture` types defined in Task 4.1 are referenced by every later component in Task 4. `createPack`/`deletePack` from Task 3.1 are called by NewPackDialog (3.4), DeletePackDialog (5.1). `GlobalEvent` from Task 3.2 used by PackList in 3.6. `putManifest` declared in 4.1, called in 4.7. ✓
