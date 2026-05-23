# Phase 5 — New pack creation + Manifest form editor (Design)

**Status:** Approved (brainstorm complete, awaiting implementation plan)
**Date:** 2026-05-22
**Author:** Dan Baskette (with Claude)
**Parent design:** [`2026-05-22-myvoice-design.md`](./2026-05-22-myvoice-design.md)

---

## Overview

Phase 5 closes the editing experience promised by Phase 3 and the create flow promised by the parent design.

Today a user can browse packs, edit prose files (style-guide, formats, samples, bios), and rewrite drafts through any pack. They cannot:

1. Create a new pack from the UI (the AppShell placeholder mentions a "+ New pack" button that doesn't exist).
2. Edit the manifest itself — the Manifest tab still shows read-only YAML with a "P3-T9" stub note.
3. Delete a pack from the UI.

Phase 5 ships all three, scoped tightly: only **declarative** manifest fields become form-editable. List entries (`formats[]`, `samples[]`, `bios[]`) stay read-only on the Manifest tab and surface as small "Edit on …tab" hints. Entry add/remove (file + manifest coordination beyond the existing "Save as sample") is deferred to Phase 6+.

**In scope:**

- `POST /api/packs` — create from `_template`
- `DELETE /api/packs/{slug}` — soft-delete to trash
- "+ New pack" sidebar button + dialog
- `ManifestForm` (replaces `ManifestStub`) with 5 section components for pack metadata, persona, banished, rules, pop_culture
- Read-only entries summary section linking to existing sub-tabs
- "Delete pack" action with confirmation dialog
- Wire `/api/events` SSE in the sidebar (`PackList`) so create/delete/update reflect live

**Out of scope (deferred):**

- Slug rename (would require a directory move — defer to a "Rename pack" flow)
- Entry editing for `formats[]` / `samples[]` / `bios[]` (Phase 6)
- Restore-from-trash UI (deleted packs sit on disk; recovery via filesystem)
- Manifest spec migration / upgrade (Phase 5 only handles `spec_version: "1.0"`)

---

## Part 1: Backend

### 1.1 `POST /api/packs`

**Request:**

```python
class CreatePackRequest(BaseModel):
    slug: str = Field(min_length=1, pattern=r"^[a-z0-9][a-z0-9-_]*$")
    name: str = Field(min_length=1)
    author: str = Field(min_length=1)
    persona_identity: str = Field(min_length=1)
    persona_one_line: str = Field(min_length=1)
    version: str = "0.1.0"
    description: str | None = None
```

**Flow:**

1. **Validate request.** Pydantic 422 on bad slug pattern or missing required field. Slug pattern matches filesystem-safe identifiers (lowercase alphanum + `-_`, must start with alphanum) so the directory name is always safe.
2. **Resolve write root.** `MYVOICE_PACKS_ROOT` if set (test/dev override), else `~/.myvoice/packs/`. Create the parent dir if missing.
3. **Compute target.** `<write_root>/<slug>/`. If it exists → 409:
   ```json
   {"error": {"code": "slug_conflict",
              "message": "A pack with slug 'foo' already exists.",
              "details": {"slug": "foo", "path": "<existing path>"}}}
   ```
4. **Locate template.** `_locate_template()` returns the path to `_template/` by walking up from `myvoice/__file__` (matches the existing `_resolve_pack_roots` convention) and checking `<repo>/packs/_template` and `<wheel_data>/packs/_template`. If neither exists → 500 `template_missing`.
5. **`shutil.copytree(template_root, target_root)`.**
6. **Patch the manifest in place.** Load `<target>/stylepack.yaml`, set:
   - `pack.slug = req.slug`
   - `pack.name = req.name`
   - `pack.author = req.author`
   - `pack.version = req.version`
   - `pack.description = req.description` (drop key if None)
   - `persona.identity = req.persona_identity`
   - `persona.one_line = req.persona_one_line`
   Atomic write via `PackStore.save_manifest(slug, data)` — but the store doesn't know about the pack yet; first add the directory to discovery via `pack_store.reload()` so `save_manifest` can find it, OR just write directly with `_atomic_write_text` and then `reload()`. Plan picks one in T1.
7. **Re-index.** `pack_store.reload()`. The new pack appears via the existing discovery walk.
8. **Validate.** Call `validate_pack(target_root)`. The `_template/` is CI-validated as known-good, so this should always pass; if it doesn't (corrupt copy, disk error), return 500 with the validation errors as details.
9. **Emit event.** `event_bus.emit({"type": "pack:created", "slug": req.slug, "name": req.name, "path": str(target_root)})`.
10. **Return 201** with the same shape as `GET /api/packs/{slug}` for that pack.

**Error envelope** matches Phase 4: `{"error": {"code", "message", "hint?", "details?"}}`. Codes used: `slug_conflict`, `template_missing`, `manifest_invalid` (defensive).

### 1.2 `DELETE /api/packs/{slug}`

**Flow:**

1. Look up the pack via `pack_store.get(slug)`. 404 if missing.
2. **Compute trash target.** Default: `~/.myvoice/trash/<UTC-iso-timestamp>-<slug>/`. If `MYVOICE_PACKS_ROOT` is set (test isolation): `<MYVOICE_PACKS_ROOT_PARENT>/trash/<ts>-<slug>/`. Create parent dirs.
3. **Move.** `shutil.move(pack.root_path, trash_target)`. If `OSError` (cross-device), fall back to `shutil.copytree` + `shutil.rmtree(pack.root_path)`. This is fine because the only consumer of the original path is the watch task, which will receive the deletion event.
4. **Re-index.** `pack_store.rescan_one(slug)` — the existing implementation detects the missing `stylepack.yaml` and removes the entry.
5. **Emit event.** `event_bus.emit({"type": "pack:deleted", "slug": slug})`.
6. **Return 204** (no body).

Trash never auto-cleans. Users delete the dir manually if they want to. A future "View deleted packs" UI could restore by moving back — out of scope.

### 1.3 Module structure

New file: `packages/api/myvoice/api/packs_admin.py` (or extend `api/packs.py` — implementer's call based on file size). Adds the two endpoints. Mount in `server.py::create_app` alongside the existing packs router.

New helper module: `packages/api/myvoice/packs/templates.py` exposing `_locate_template() -> Path` so the create endpoint and any future code share the same lookup.

### 1.4 Tests

- `tests/api/test_packs_create.py`:
  - Success: returns 201 with new pack info; pack appears in `GET /api/packs`; manifest fields match request; directory exists.
  - Slug conflict: pre-create a pack, POST same slug → 409 with `slug_conflict`.
  - Bad slug pattern (`"Foo Bar"`, `"123"`, empty) → 422.
  - Missing required field → 422.
  - Emits `pack:created` (subscribe to `/api/events` then trigger).
- `tests/api/test_packs_delete.py`:
  - Success: pre-create or fixture-copy a pack, DELETE → 204; GET 404 after; original dir gone; trash dir exists with copied contents.
  - 404 for unknown slug.
  - Emits `pack:deleted`.

All tests use isolated fixture roots (copy `_template` to a tmp dir via the existing `samples_client`-style fixture pattern) so checked-in packs never get mutated.

---

## Part 2: Frontend

### 2.1 API clients

Extend `packages/web/src/api/packs.ts` (existing) with:

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

export async function createPack(req: CreatePackRequest): Promise<PackSummary>;
export async function deletePack(slug: string): Promise<void>;
```

Add `packages/web/src/api/manifest.ts` with a typed `Manifest` interface mirroring the Pydantic schema (`spec_version`, `Pack`, `Persona`, `Banished`, `Rules`, `PopCulture`, plus readonly `Format[]`, `Sample[]`, `Bio[]`). Add `putManifest(slug, manifest) → PackSummary` (the endpoint already exists from Phase 3).

### 2.2 `useGlobalEvents` hook

`packages/web/src/hooks/useGlobalEvents.ts`:

```typescript
export interface GlobalEvent {
  type: "pack:created" | "pack:updated" | "pack:deleted" | "pack:invalid" | "config:updated";
  slug?: string;
  [key: string]: unknown;
}

export function useGlobalEvents(onEvent: (e: GlobalEvent) => void): void;
```

Opens an `EventSource("/api/events")` on mount, dispatches JSON-parsed events. Close on unmount.

### 2.3 `PackList` sidebar updates

`components/PackList.tsx`:

- Adds a "+ New pack" button (full width, dashed border, at the bottom of the list above the divider). Clicking opens `NewPackDialog`.
- Subscribes to `useGlobalEvents`. On `pack:created` / `pack:deleted` / `pack:updated`, re-fetches `/api/packs` (debounced 100ms if multiple events land in a burst).

### 2.4 `NewPackDialog`

`components/packs/NewPackDialog.tsx`:

- Modal dialog (same overlay pattern as `SaveSampleDialog`).
- Fields: slug (required), name (required), author (required), persona.identity (required), persona.one_line (required), description (optional).
- Helper text under slug: "lowercase, hyphens, no spaces". Live regex validation (`/^[a-z0-9][a-z0-9-_]*$/`) — disable Submit until valid.
- Submit:
  - POST `/api/packs`.
  - 201 → close, `navigate(\`/packs/${slug}\`)`, toast "Created pack {name}."
  - 409 → inline error on slug field: "A pack with this slug already exists."
  - 422 → map server's field errors to the corresponding input.
  - Other 5xx → banner with the error message + hint.

### 2.5 `ManifestForm`

`routes/PackDetailPage.tsx` — replace `ManifestStub` with `<ManifestForm slug={slug} />`.

`components/manifest/ManifestForm.tsx`:

- Mount: GET `/api/packs/{slug}/manifest` → `loaded` and `draft`.
- Loading state until both arrive.
- Sticky top bar with Save / Discard buttons. Dirty = `JSON.stringify(loaded) !== JSON.stringify(draft)`. Same pattern as `SettingsPage` from Phase 4.
- Renders five editable section components + one read-only entries section, each receiving a slice of `draft` and a typed `onChange`.
- Save: PUT `/api/packs/{slug}/manifest` with full `draft`.
  - 200 → set `loaded` and `draft` from response (server re-reads from disk, normalizes), clear errors.
  - 422 `{detail: {errors: [{path, message}]}}` → store errors keyed by path. Sections read errors for their field paths and render inline. Top-of-form banner: "Validation failed: {N} errors below."
- Bottom of form: "Danger zone" divider + Delete pack button → opens `DeletePackDialog`.

#### Section components

All live in `components/manifest/`. Each is a "controlled" component taking a draft slice + onChange. Pure presentational — no state of its own beyond ephemeral input state (e.g., new tag being typed).

- **`PackMetadataSection.tsx`** — fields for `name`, `version`, `author`, `description` (textarea), `homepage` (URL). `slug` shown as disabled input with helper "Slug renaming not yet supported".
- **`PersonaSection.tsx`** — single-line text inputs for `identity` and `one_line` (textareas if you want — design's prose says they're one-line each, so plain text inputs).
- **`BanishedSection.tsx`** — uses `TagInput` for `words` and `phrases`. Uses `ExceptionsTable` for `permitted_exceptions[]`.
- **`RulesSection.tsx`** — two toggle switches (`no_em_dashes`, `no_ascii_double_hyphen_between_letters`). `TagInput` for `no_sentence_starters`.
- **`PopCultureSection.tsx`** — two `TagInput`s for `allowed` and `banned`.
- **`EntriesSection.tsx`** — read-only summary. Three small cards in a row: "Formats (N) — Edit on the Formats tab →", "Samples (N) — Edit on the Samples tab →", "Bios (N) — Edit on the Bios tab →". Links navigate within the existing sub-nav. No entry-add UI in this phase.

#### Shared components

- **`TagInput.tsx`** (`components/manifest/`) — Chip-style input. Renders existing items as removable chips; a text input below where Enter adds a new chip. Duplicates rejected silently. Props: `{label, values, onChange, placeholder}`.
- **`ExceptionsTable.tsx`** (`components/manifest/`) — Table with rows `[term, reason, ✕]`, plus an inline "add row" at the bottom (two empty inputs + "Add"). Props: `{values: PermittedException[], onChange}`.

### 2.6 `DeletePackDialog`

`components/packs/DeletePackDialog.tsx`:

- Modal. Body: "This will move `{slug}` to `~/.myvoice/trash/`. The pack will be gone from your library. You can recover the files manually from the trash dir."
- "Type the slug to confirm:" text input. Delete button disabled until input exactly matches slug.
- On confirm: DELETE `/api/packs/{slug}` → on 204, `navigate("/packs")`, toast "Moved {slug} to trash."
- On error: banner.

### 2.7 Tests

Vitest:
- `components/manifest/TagInput.test.tsx` — add, remove, duplicate rejection, Enter key.
- `components/manifest/ExceptionsTable.test.tsx` — add row, edit, remove.
- `components/manifest/ManifestForm.test.tsx` — load manifest, edit a field, dirty state, save calls API, 422 maps errors inline.
- `components/packs/NewPackDialog.test.tsx` — slug regex gating, 409 inline error, 201 navigates.
- `components/packs/DeletePackDialog.test.tsx` — type-to-confirm gating, 204 navigates.
- `hooks/useGlobalEvents.test.ts` — opens EventSource, dispatches parsed events, closes on unmount.

Playwright (extend existing `e2e/`):
- `e2e/pack-lifecycle.spec.ts` — create pack via dialog → edit banished words in Manifest tab → save → delete pack → verify gone from sidebar.

---

## Part 3: Done-state for Phase 5

- [ ] `make test` green (backend + frontend + Playwright)
- [ ] `make lint` + `mypy --strict` + `biome check` + `tsc --noEmit` clean
- [ ] On a fresh `~/.myvoice/`: click "+ New pack", fill the dialog, see new pack in sidebar; navigate to Manifest tab, edit banished words, save, see ✓; click Delete, confirm by typing slug, pack gone from sidebar; verify the pack dir landed in `~/.myvoice/trash/`.
- [ ] External edit (VS Code) to a newly-created pack's manifest reflects in the UI within 1s (Phase 4's watchfiles still works for new packs).
- [ ] README updated with brief "Create a pack from the UI" note in the existing Packs section.

---

## Part 4: PR sequence

6 small PRs on `phase-5-new-pack-and-manifest-forms`:

```
PR1  feat(api): POST /api/packs — create from _template, emit pack:created
PR2  feat(api): DELETE /api/packs/{slug} — soft-delete to trash, emit pack:deleted
PR3  feat(web): "+ New pack" dialog + sidebar button + useGlobalEvents hook for live PackList
PR4  feat(web): ManifestForm — replaces ManifestStub; 5 editable sections + read-only entries summary
PR5  feat(web): Delete pack dialog (slug-typed confirmation) + Danger zone in ManifestForm
PR6  test(e2e): pack-lifecycle Playwright spec + README update
```

Each PR target: <500 LOC diff. PR4 is the biggest because of the section components — if it overshoots, split BanishedSection/RulesSection/PopCultureSection into PR4a and PR4b.

---

## Part 5: Out of scope (explicitly)

- Slug rename (deferred to Phase 6+ — needs directory move + watchfiles handling).
- Entry-list editing for `formats[]`, `samples[]`, `bios[]` (add/remove/rename entries on the Manifest tab) — Phase 6.
- Restore from trash UI — filesystem-level recovery only.
- Pack export / sharing — already deferred in parent design.
- Spec migrations (only `spec_version: "1.0"` supported).
