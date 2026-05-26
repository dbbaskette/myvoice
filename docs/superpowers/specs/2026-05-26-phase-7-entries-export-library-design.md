# Phase 7 — Entry editing + zip export/import + library API (Design)

**Status:** Approved (brainstorm complete, awaiting implementation plan)
**Date:** 2026-05-26
**Author:** Dan Baskette (with Claude)
**Parent design:** [`2026-05-22-myvoice-design.md`](./2026-05-22-myvoice-design.md)

---

## Overview

Phase 7 closes three deferred items from the v1 design plus the Phase 5 "out of scope" list:

1. **Entry list editing** (Part A) — add/remove `formats[]`, `samples[]`, `bios[]` entries from the UI. Today users can edit the FILE CONTENT of an existing entry but cannot add a new format or remove a stale sample without filesystem surgery.
2. **Pack zip export/import** (Part B) — one-click `.zip` download of a pack + upload to import a pack from disk. The lightest path to "share my voice with a friend."
3. **Public library API + docs** (Part C) — clean `from myvoice import ...` surface so future Pencraft (or any other Python app) consumes packs without depending on private modules.

After Phase 7, the only original-v1 items still deferred are explicitly long-term (registry, hosted SaaS, Tauri, WebSockets, single-binary distribution) plus the Pencraft consumer itself (separate project, separate session).

---

# Part A — Entry list editing

## A.1 Where the editing lives

Add `+ New` and `Delete` actions **inside the existing Formats / Samples / Bios sub-tabs**, NOT on the Manifest tab. Rationale:

- The user is already on the Formats tab when they want to add a new format. Putting the action there matches the mental model.
- The Manifest tab's `EntriesSection` stays read-only with a "Edit on the Formats tab →" link (no UX change).
- Avoids two places to maintain the same list.

## A.2 Backend routes

Six new routes — three POSTs (mirroring the existing `POST /api/packs/{slug}/samples` from Phase 4) + three DELETEs.

```
POST   /api/packs/{slug}/formats
   body: { name: str, description?: str, content?: str = "" }
   → 201 { name, file }
   409 if name already exists in formats[]

POST   /api/packs/{slug}/bios
   body: { name, description?, max_chars?, target_words?, third_person?, content? }
   → 201 { name, file }
   409 if name already exists in bios[]

DELETE /api/packs/{slug}/formats/{name}    → 204; 404 if not found
DELETE /api/packs/{slug}/samples/{id}      → 204; 404 if not found
DELETE /api/packs/{slug}/bios/{name}       → 204; 404 if not found
```

(`POST /api/packs/{slug}/samples` already exists from Phase 4 — unchanged.)

## A.3 POST mechanics

Same coupled-write pattern as the existing samples POST:

1. Validate request (Pydantic 422). For formats/bios, `name` must match regex `^[a-z0-9][a-z0-9-_]*$` (filesystem-safe).
2. Look up pack. 404 if missing.
3. Check `manifest.{kind}[]` for existing entry with same `name`/`id`. 409 if duplicate.
4. Generate filename:
   - Formats: `formats/{name}.md`
   - Samples: `samples/{id}-{auto-slug}.md` (existing behavior)
   - Bios: `bios/{name}.md`
5. Write file FIRST: `Path.write_text(content)` (use empty `# {name}\n` placeholder if content empty so the file is non-empty per spec).
6. Append entry to manifest:
   - Formats: `{name, file, description?}`
   - Bios: `{name, file, max_chars?, target_words?, third_person, description?}` (omit None values)
7. Atomic manifest write via `PackStore.save_manifest(slug, data)`.
8. Emit `pack:updated` on `/api/events`.
9. Return 201 with `{name, file}` (or `{id, file}` for samples).

On any failure after the file is written: leave the orphan file (validator just ignores files not listed in manifest — harmless). On manifest-write failure, return 500 with details; user can retry.

## A.4 DELETE mechanics

1. Look up pack and entry. 404 if either missing.
2. Read file path from manifest entry.
3. Remove entry from `manifest.{kind}[]` (filter by `name`/`id`).
4. Atomic manifest write.
5. Delete file from disk (`Path.unlink(missing_ok=True)`).
6. Emit `pack:updated`.
7. Return 204.

File-delete failure (e.g., permission error) is logged but doesn't error the route — the manifest no longer references it, so the pack stays valid.

## A.5 Frontend — modifications to `FileGroup`

`FileGroup` is the existing component in `PackDetailPage.tsx` that handles formats/samples/bios sub-tabs. Modify in place (do not duplicate):

```
Current layout:
┌────────────┬──────────────────────────┐
│ file list  │ MarkdownEditor for       │
│            │ selected file            │
└────────────┴──────────────────────────┘

New layout:
┌────────────┬──────────────────────────┐
│ file list  │ MarkdownEditor (header   │
│            │   gets a "Delete" button │
│            │   next to Rich/Raw)      │
│            │                          │
│ + New      │                          │
└────────────┴──────────────────────────┘
```

- **"+ New" button** at the bottom of the sidebar. Opens `NewEntryDialog` parameterized by `kind`.
- **"Delete" button** in `MarkdownEditor`'s header — slug-typed confirm dialog like Phase 5's `DeletePackDialog`.

## A.6 `NewEntryDialog` component

`packages/web/src/components/manifest/NewEntryDialog.tsx`:

Props: `{ slug, kind: "formats" | "samples" | "bios", open, onClose }`.

Form fields (conditional by `kind`):

| Field | formats | samples | bios |
|---|---|---|---|
| `name` (slug regex) | ✓ | — | ✓ |
| `id` (auto-derived) | — | ✓ (display only) | — |
| `description` | optional | optional | optional |
| `max_chars` (int >0) | — | — | optional |
| `target_words` (int >0) | — | — | optional |
| `third_person` (bool) | — | — | default false |
| Initial content (textarea) | optional | required | optional |

For samples: the existing `POST /api/packs/{slug}/samples` from Phase 4 already takes `{excerpt, source_url?, note?}` — reuse that endpoint (don't duplicate). For formats/bios use the new endpoints.

On 201: close, emit nothing (pack-list refresh comes from the `pack:updated` SSE event the backend already emitted), and select the new file in the sidebar.

## A.7 `DeleteEntryDialog` component

Mirror of `DeletePackDialog` from Phase 5. Triggered by the new Delete button in `MarkdownEditor`'s header. Type-the-filename confirm; on success calls the appropriate DELETE route, closes, deselects the file (sidebar refreshes from SSE).

## A.8 Tests

Backend (pytest):
- `tests/api/test_formats_route.py` — POST happy path, POST conflict, DELETE happy path, DELETE not found.
- `tests/api/test_bios_route.py` — same plus the bios-specific fields (max_chars / target_words / third_person are stored on the manifest entry).
- `tests/api/test_samples_delete.py` — DELETE for samples (POST already covered by existing `test_samples_route.py`).

Frontend (Vitest):
- `components/manifest/NewEntryDialog.test.tsx` — renders different fields per `kind`, slug validation gating, POSTs to the right URL per kind.
- `components/manifest/DeleteEntryDialog.test.tsx` — slug-typed confirm gating, success path.

---

# Part B — Pack zip export / import

## B.1 Backend routes

```
GET  /api/packs/{slug}/export
   → 200 application/zip
   Content-Disposition: attachment; filename="pack-{slug}-{version}.zip"
   Body: zip of <pack-root>/, skipping dot-files and __pycache__

POST /api/packs/import
   multipart/form-data: file=<.zip>
   → 201 PackSummary on success
   → 409 slug_conflict if a pack with the inner slug already exists
   → 413 file_too_large if upload > 50 MB
   → 422 invalid_pack if zip doesn't contain exactly one pack
```

Both live in a new `packages/api/myvoice/api/pack_zip.py`.

## B.2 Export mechanics

1. Look up pack. 404 if missing.
2. `pack_root = info.root_path`. `pack_name = f"pack-{pack.slug}-{pack.version}"`.
3. In a `tempfile.TemporaryDirectory()`, call `shutil.make_archive(tmp/pack_name, 'zip', pack_root)`. This writes `{pack_name}.zip` containing the pack files at the archive root (NOT nested in a slug directory — flat).
4. Wait — to make import idempotent (one zip → one slug-named dir), nest content under `<slug>/`:
   - `shutil.make_archive(tmp/pack_name, 'zip', pack_root.parent, pack.slug)` — packs `<parent>/<slug>/*` so the zip's top-level is `<slug>/`.
5. Stream via `FileResponse(zip_path, media_type="application/zip", filename=f"{pack_name}.zip", background=BackgroundTask(cleanup))`.
6. Cleanup background task `rmtree`s the temp dir after the response is sent.

Skip filter via a custom `make_archive` alternative: zipfile.ZipFile directly with `os.walk`, excluding `.DS_Store`, `__pycache__`, `*.pyc`, dot-directories.

## B.3 Import mechanics

1. Multipart receive. 413 if size > 50 MB (check before reading body).
2. Write to `tempfile.NamedTemporaryFile(suffix=".zip")`.
3. Extract to `tempfile.TemporaryDirectory()`.
4. Find the inner pack root: walk one level deep, look for exactly one subdirectory containing `stylepack.yaml`. If zero or more than one: 422 `invalid_pack` with hint.
5. Read the manifest, validate slug (regex `^[a-z][a-z0-9-_]*$`). Read `pack.slug` from the manifest — this is the slug that lands on disk (NOT derived from filename, NOT from the inner dir name — the manifest is authoritative).
6. `target = resolve_write_root() / manifest.pack.slug`. If exists, 409 `slug_conflict` with the existing path.
7. `shutil.move(inner_pack_root, target)`.
8. `pack_store.reload()`.
9. Defensive `validate_pack(target)` — on failure rollback (rmtree target) and 500 `manifest_invalid`.
10. Emit `pack:created`.
11. Return 201 PackSummary.

## B.4 Frontend

**Export button** — in `ManifestForm` (Phase 5 component), add an "Export pack" button to a new "Distribute" section between Entries and Danger zone. Plain `<a href={\`/api/packs/${slug}/export\`} download className="...">Export pack as .zip</a>` — browser handles the download natively. No spinner needed.

**Import button** — at the top of `PackList` (sidebar), above "+ New pack". Opens `ImportPackDialog`:
- Native file picker (or drag-drop zone, optional).
- Submit: build `FormData` with the file, POST `/api/packs/import`.
- 201 → close dialog, toast "Imported pack {slug}.", sidebar refreshes via `pack:created` SSE.
- 409 → inline error "Slug already exists. Rename or delete the existing pack first."
- 422 → inline error with server's hint.

## B.5 New API client

`packages/web/src/api/pack_zip.ts`:
```typescript
export function exportPackUrl(slug: string): string;
export async function importPack(file: File): Promise<PackSummary>;
```

## B.6 Tests

Backend:
- `tests/api/test_pack_zip_export.py` — GET returns 200 + zip with manifest + content files; nested under `<slug>/` at archive root.
- `tests/api/test_pack_zip_import.py` — round-trip (export then import to a new slug via filesystem renaming), conflict 409, invalid-zip 422, oversized 413.

Frontend:
- `components/packs/ImportPackDialog.test.tsx` — file picker submission, 409 inline error, success closes.

---

# Part C — Public library API + docs

## C.1 The shim

`packages/api/myvoice/__init__.py` already contains:
```python
__version__ = "0.1.0"
```

Replace with the full public-surface re-export:

```python
"""myvoice — Local-first style-pack editor + library.

Public API for other apps (e.g., Pencraft):

    from myvoice import PackStore, compose_prompt, lint, validate_pack
    from myvoice import Manifest, Violation, LintHit

Imports outside the names listed in __all__ below are PRIVATE and may
change without notice. Pin a version of myvoice if you depend on
internal modules.
"""

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

`compose_prompt` is an alias for `compose()` because `from myvoice import compose` would shadow the `myvoice.compose` module name (Python lets it work but it's confusing).

## C.2 README section

Add to `README.md` between the existing "Style packs" and "Design" sections:

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
violations = lint(dan.manifest, "Let me delve into this.")
for v in violations:
    print(v.kind, v.match, v.message)
```

The names exported from `myvoice/__init__.py` (`PackStore`, `Manifest`, `compose_prompt`, `lint`, `lint_to_hits`, `detect_positive_hits`, `validate_pack`, `Violation`, `LintHit`, `__version__`) are the public API. Anything else is private and may change.

Install via `pipx install myvoice` (CLI + library) or `pip install myvoice` (library only inside a project venv).
````

## C.3 Smoke test

`packages/api/tests/test_public_api.py`:

```python
"""Smoke test: every public name imports + round-trips."""
from __future__ import annotations

from pathlib import Path

import pytest


def test_all_public_names_import() -> None:
    """Importing the public API should succeed without side effects."""
    import myvoice
    expected = {
        "__version__",
        "PackStore", "Manifest",
        "compose_prompt", "lint", "lint_to_hits",
        "detect_positive_hits", "validate_pack",
        "Violation", "LintHit",
    }
    assert set(myvoice.__all__) == expected
    for name in expected:
        assert hasattr(myvoice, name), f"myvoice.{name} missing"


def test_library_round_trip() -> None:
    """A typical library-consumer workflow: list packs, compose, lint."""
    from myvoice import PackStore, compose_prompt, lint, validate_pack

    repo_packs = Path(__file__).resolve().parents[3] / "packs"
    store = PackStore([repo_packs])
    assert "dan" in store.slugs()

    dan = store.get("dan")
    assert dan is not None and dan.valid

    result = validate_pack(dan.root_path)
    assert result.errors == []

    prompt = compose_prompt(dan.root_path, draft="A short draft.")
    assert "A short draft." in prompt
    assert len(prompt) > 100  # non-trivial

    violations = lint(dan.manifest, "Let me delve into this.")
    assert any("delve" in v.match for v in violations)
```

If any of the names move or the signatures drift, this test fails — that's the contract.

## C.4 PackStore + PackInfo as public surface

`PackStore` is already in `myvoice.packs.store`. `PackInfo` (which `PackStore.get()` returns) is in `myvoice.packs.discovery`. Both stay where they are; the `__init__.py` re-export gives them the canonical import path.

Do NOT also re-export `PackInfo` — consumers don't need to construct it, only consume what `store.get()` returns. Document the shape in a docstring comment but don't expand the public surface.

---

# PR sequence

6 PRs on `phase-7-entries-export-library`, each under 500 LOC:

```
PR1  feat(api): entry POST/DELETE routes for formats/samples/bios
PR2  feat(web): + New / Delete inside Formats/Samples/Bios sub-tabs
PR3  feat(api): GET /api/packs/{slug}/export + POST /api/packs/import
PR4  feat(web): Export pack button + Import pack dialog
PR5  feat(api): public library API exports + smoke test + README "Using as a library"
PR6  test(e2e): Playwright entry add/delete + zip round-trip + README updates
```

---

# Out of scope (explicit deferrals)

- Entry rename (delete + create is the v1 workaround).
- Bio metadata edit (change `max_chars` on an existing bio without recreating the file).
- Pack import overwrite-on-conflict (today: 409, user resolves manually).
- Signed/versioned pack bundles (zip is enough).
- Per-entry reorder UI (manifest list order is what the LLM sees; reorder by hand-editing the YAML for now via the Manifest tab — wait, the manifest tab doesn't expose entry lists, so reorder is a filesystem operation in Phase 7. Future phase if needed.).
- Library async API (everything sync today — fine for Pencraft).
- Pencraft itself (separate project, separate session — starts after this phase merges).

---

# Done-state

- [ ] `make test` green (backend + frontend + Playwright)
- [ ] mypy strict + ruff + biome + tsc clean
- [ ] In the UI: navigate to a pack's Formats tab, click "+ New", create `linkedin-post`, see it appear; click Delete on it, type the filename, confirm — gone. Same flow on Samples and Bios.
- [ ] Click Export pack on a real pack — `.zip` downloads. Click Import pack → file picker → upload that zip into a fresh `~/.myvoice/packs/` — pack appears in sidebar.
- [ ] `python -c "from myvoice import PackStore, compose_prompt, lint, validate_pack; print('ok')"` runs cleanly in a venv with myvoice installed.
- [ ] README has the "Using myvoice as a library" section with the example block.
