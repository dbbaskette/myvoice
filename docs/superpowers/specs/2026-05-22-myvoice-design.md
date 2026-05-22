# myvoice — Design

**Status:** Approved (brainstorm complete, awaiting implementation plan)
**Date:** 2026-05-22
**Author:** Dan Baskette (with Claude)

---

## Overview

`myvoice` is a local-first web app for creating, editing, and using **style packs** — portable bundles that capture a writer's voice (banished vocabulary, principles, samples, format add-ons, bios) and let an LLM rewrite drafts in that voice.

It exists for two reasons:

1. **Standardize what Dan-AI does today.** Dan-AI is a markdown style guide plus bash scripts. The format is fine but ad-hoc. Other writers can't easily build their own version without copy-pasting Dan's structure and inferring conventions.
2. **Make voice creation accessible.** Today, creating a Dan-AI-style pack means manually authoring a long markdown file. myvoice lets a writer point the app at their existing blog posts or upload drafts, and an LLM produces a draft pack the writer reviews and refines.

The output is a real directory of files (YAML + markdown) the user owns, can `git`-commit, and can share — not opaque records in a database.

### Scope

**In v1:**

- A portable **Style Pack Format spec** (v1.0) with a YAML manifest + markdown content files.
- A local-first web app (`myvoice serve`) that browses, views, creates, edits, and validates packs.
- AI-assisted pack creation from URLs and local file uploads.
- Compose & test: pick a pack, paste a draft, send it through Claude/OpenAI/Gemini, see the rewritten output with lint analysis on both sides.
- Multi-provider LLM support (Anthropic, OpenAI, Google), BYOK.
- The Dan-AI content converted to the spec as the reference pack (`packs/dan/`).

**Out of v1 (Future work):**

- Pack sharing/export (zip, shareable URL).
- A standalone "lint any draft" page.
- A pack registry / remote install.
- SQLite-backed cache for pack indexes.
- Hosted SaaS / multi-user mode.
- Homebrew formula, single-binary distribution, Tauri desktop wrapper.
- AI-assisted bio extraction (bios stay author-authored in v1 — placeholders only after extraction).

---

# Part 1: Style Pack Format (SPEC v1.0)

The underlying data model. Every consumer of myvoice (the app, the future extractor, Pencraft eventually) reads packs that conform to this spec.

## 1.1 Pack layout

A pack is a directory. Required and optional files:

```
packs/<slug>/
├── stylepack.yaml          # Required — manifest
├── style-guide.md          # Required — prose only (principles, examples, brand)
├── formats/                # Optional — format add-ons
│   ├── blog-post.md
│   ├── linkedin-post.md
│   └── ...
├── samples/                # Optional — voice exemplars
│   ├── 01-<slug>.md
│   └── ...
└── bios/                   # Optional — standing bio content
    ├── twitter.md
    ├── conference-speaker.md
    ├── linkedin-about.md
    └── book-jacket.md
```

A minimal valid pack: `stylepack.yaml` + a one-paragraph `style-guide.md`. Everything else is optional.

## 1.2 Manifest schema (`stylepack.yaml`)

YAML chosen because the manifest is human-curated, list-heavy, and the lingua franca for adjacent content tools (Hugo, Jekyll, GitHub Actions).

```yaml
spec_version: "1.0"

pack:
  slug: dan                       # filesystem-safe id; must match directory name
  name: "Dan Baskette"
  version: "3.0"                  # pack content version (independent of spec_version)
  author: "Dan Baskette"
  description: "The Builder Who Gets It. Energetic, definitive, transparent."
  homepage: "https://github.com/dbbaskette/dan-ai"   # optional

persona:
  identity: "The Builder Who Gets It"
  one_line: "Bridges high-level strategy and technical reality; maker who advocates for the developer."

banished:
  words:
    - delve
    - leverage
    # ... full list extracted from the current style guide's Section 1
  phrases:
    - "It's important to note that"
    - "In today's digital age"
    # ...
  permitted_exceptions:
    - term: "Pivotal"
      reason: "Proper noun (Pivotal Software, Pivotal Cloud Foundry)"
    - term: "unlock"
      reason: "Part of Speed-to-Value vocabulary"

rules:
  no_em_dashes: true
  no_ascii_double_hyphen_between_letters: true
  no_sentence_starters:
    - Absolutely
    - Certainly
    - Moreover
    - Furthermore
    - Additionally

pop_culture:
  allowed: [Marvel]
  banned: [Star Wars, Star Trek, "Lord of the Rings"]

formats:
  - name: blog-post
    file: formats/blog-post.md
    description: "Long-form blog with Conflict & Resolution opener"
  - name: linkedin-post
    file: formats/linkedin-post.md
    description: "Punchy LinkedIn post with hook + payoff"

samples:
  - id: "01"
    file: samples/01-database-ai-tool-opener.md
    description: "Database AI tooling opener — 1388 chars"

bios:
  - name: twitter
    file: bios/twitter.md
    max_chars: 160
    description: "Twitter/X profile bio"
  - name: conference-speaker
    file: bios/conference-speaker.md
    target_words: 75
    description: "CFP submissions and event programs"
  - name: linkedin-about
    file: bios/linkedin-about.md
    max_chars: 1700
    description: "LinkedIn About section"
  - name: book-jacket
    file: bios/book-jacket.md
    target_words: 150
    third_person: true
    description: "Book endorsements and foreword credits"
```

**Key design points:**

- `spec_version` and `pack.version` are deliberately separate. A pack can bump its content version (3.0 → 3.1) without changing spec.
- `persona.one_line` is the smallest thing a composer needs to render a `ROLE:` line. Fuller narrative lives in `style-guide.md`.
- `rules.*` is a fixed, finite set in v1.0. Adding a new rule key requires bumping `spec_version`. Catches typos via the validator.
- `permitted_exceptions[].reason` keeps the *why* attached to each exception so future readers (and linter messages) have context.
- `formats[]`, `samples[]`, `bios[]` are explicit lists, not auto-discovered. The pack declares what it offers; tools resolve names to file paths.

## 1.3 Pack contents

### `style-guide.md`

Prose only. After data extraction to the manifest, this file contains the parts of the original Dan-AI guide that aren't derivable from YAML:

- Writing Principles (Conflict & Resolution, Speed to Value, Better Together, Golden Command, Not a Science Project) with examples.
- Formatting & Visuals guidance.
- Video & Presentation Style.
- Personal Brand Signatures (Maker mindset, Marvel-only pop culture).
- Self-Check Before Output checklist.

No YAML frontmatter required. The composer treats this file as opaque prose to append after the data-generated header.

### `formats/*.md`

Free-form markdown describing how the format differs from the base voice (length, structure, opener style, etc.). One file per `formats[].name` in the manifest.

### `samples/*.md`

Markdown with at least one blockquote. The blockquote contains the verbatim excerpt; anything outside is author-facing meta (source, why this sample is good) and is stripped before the sample reaches the LLM.

### `bios/*.md`

Standing bio content the writer authored. Markdown body is the bio text; optional italic note at the top documents usage. The composer extracts the body when `--bio <name>` is requested.

## 1.4 Validation rules

A pack is valid if:

1. `stylepack.yaml` exists and parses as valid YAML.
2. `spec_version` is a supported version (currently `"1.0"`).
3. Required fields present: `pack.slug`, `pack.name`, `pack.version`, `persona.identity`, `persona.one_line`.
4. `pack.slug` matches the directory name.
5. `style-guide.md` exists and is non-empty.
6. Every file listed in `formats[]`, `samples[]`, `bios[]` exists and is non-empty.
7. Every `samples[*].file` contains at least one blockquote.
8. Every `bios[*]` with `max_chars` set: the body (after stripping author notes) fits.
9. `rules.*` keys are all known to spec v1.0.
10. `banished.words` and `banished.phrases` are arrays of non-empty strings.

## 1.5 Dan-AI → `packs/dan/` conversion

The existing `/Users/dbbaskette/Projects/Dan-ai/` is the source. Conversion produces `packs/dan/` inside myvoice. The old Dan-AI repo is left untouched; the new pack is the canonical Dan voice going forward.

**File mapping:**

| Source | Destination |
|---|---|
| `DB Style Guide 3.0.md` | Split into `stylepack.yaml` (data) + `style-guide.md` (prose) |
| `BIOS.md` | Split into 4 `bios/*.md` files |
| `formats/*.md` (8 files) | `formats/*.md` (verbatim) |
| `samples/*.md` (5 + README) | `samples/*.md` (verbatim, drop README) |
| `README.md` | Not migrated |
| `scripts/compose.sh`, `scripts/banished-lint.sh` | Reference for new Python implementations |

**Concrete decisions baked in:**

- `pack.version` starts at `3.0` to preserve continuity with "DB Style Guide v3.0".
- `pack.slug` is `dan` (matches dir name).
- Permitted-exception entries each get an explicit `reason`.
- `rules.no_sentence_starters`: `Absolutely`, `Certainly`, `Moreover`, `Furthermore`, `Additionally`.
- "In conclusion" / "In summary" go into `banished.phrases` (they're phrases, not single tokens).
- `pop_culture.banned`: `Star Wars`, `Star Trek`, `Lord of the Rings`. Anything unlisted is the LLM's discretion.
- **No content edits during conversion.** Every word of prose moves over unchanged. Guide updates are a separate change after migration, so the diff stays reviewable.

---

# Part 2: myvoice Application

The local-first web app that consumes the spec.

## 2.1 Architecture & repo layout

Single repo with three pieces: Python backend, React frontend, the reference pack.

```
myvoice/
├── README.md
├── SPEC.md                          # Part 1 of this design, extracted as a standalone doc
├── pyproject.toml                   # Python project; defines `myvoice` CLI entry point
├── Makefile
├── packages/
│   ├── api/                         # Python backend (FastAPI)
│   │   ├── myvoice/
│   │   │   ├── __init__.py
│   │   │   ├── cli.py               # `myvoice serve`, `myvoice version`
│   │   │   ├── server.py            # FastAPI app, mounts routes, serves built frontend
│   │   │   ├── packs/               # Discovery, CRUD, PackStore, validation
│   │   │   ├── compose.py           # Composer (replaces compose.sh)
│   │   │   ├── lint.py              # Linter (replaces banished-lint.sh)
│   │   │   ├── validate.py          # Validator (replaces validate.sh)
│   │   │   ├── llm/                 # Provider abstraction (anthropic, openai, google, base, rates.yaml)
│   │   │   ├── extractor/           # Fetch → clean → analyze → propose
│   │   │   │   ├── prompts/analyze.j2
│   │   │   │   └── schemas/analysis.json
│   │   │   ├── static/              # Built frontend assets (filled at build time)
│   │   │   └── config.py            # ~/.myvoice/config.yaml read/write
│   │   └── tests/
│   └── web/                         # React frontend
│       ├── package.json
│       ├── vite.config.ts
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── routes/              # /packs, /packs/:slug, /extract, /compose, /settings
│       │   ├── components/          # PackList, PackEditor, ManifestForm, BioEditor, ...
│       │   ├── editor/              # Tiptap config + markdown extensions
│       │   ├── api/                 # Typed fetch wrapper, generated from FastAPI's OpenAPI
│       │   └── styles/
│       └── tests/
├── packs/
│   └── dan/                         # The reference pack (Dan-AI converted)
└── .github/
    └── workflows/
        ├── api-tests.yml
        ├── web-tests.yml
        └── validate-packs.yml
```

**Why this shape:**

- One repo, frontend and backend evolve together. No package-versioning ceremony.
- `pyproject.toml` declares the `myvoice` CLI entry point. `pipx install myvoice` → `myvoice serve` works from anywhere.
- `packs/dan/` lives in-repo as both the reference pack (visible in the UI's library by default) and a CI fixture (`validate-packs.yml` enforces spec conformance on every PR).
- The bash tools from earlier brainstorming have been ported to pure Python (`compose.py`, `lint.py`, `validate.py`) so they're importable by FastAPI routes and unit-testable.

**Runtime behavior of `myvoice serve`:**

```
$ myvoice serve
[myvoice] starting on http://localhost:7878
[myvoice] watching ~/.myvoice/packs/ and ./packs/ for changes
[myvoice] opening browser...
```

Starts FastAPI on `127.0.0.1:7878` (configurable). Serves built React assets from `packages/api/myvoice/static/`. Watches pack directories with `watchfiles` for live UI refresh. Auto-opens browser unless `--no-browser`.

## 2.2 Pack storage & discovery

Packs are real directories on disk. The app reads them on demand, watches for external changes. No database for pack content — files are the source of truth.

### Discovery sources (priority order)

| Priority | Location | Purpose |
|---|---|---|
| 1 | `~/.myvoice/packs/` | User's personal packs (default create-target) |
| 2 | Paths in `~/.myvoice/config.yaml` under `pack_paths:` | Cloned shared packs, work-org packs |
| 3 | Bundled `packs/` shipped with the install | Reference packs (`dan/`, `_template/`) |

First match wins on slug conflicts; conflicts surface as warnings.

### Discovery flow

On startup:

1. Read `~/.myvoice/config.yaml` (create defaults if missing).
2. Walk each scan location one level deep for `stylepack.yaml`.
3. For each found pack, parse the manifest, build an in-memory index: `{slug, name, version, root_path, source_priority, valid, errors}`.
4. Validation errors are surfaced in the UI (red badge, "Invalid — click to see errors") but never crash discovery.

### File watching

`watchfiles` monitors every pack root. Events:

- **Manifest changed:** re-validate, re-index, push `pack:updated` via SSE.
- **Content file changed:** push `pack:content-updated` with path. If file is open in editor, UI prompts: "File changed on disk. Reload? (unsaved changes will be lost)."

This is what makes the file-based model feel good — VS Code edits and myvoice edits are equally first-class.

### Writes

All writes go through `PackStore`:

- `create_pack(slug, base_template)` — copies `_template/`, fills slug, fails if slug already exists.
- `save_manifest(slug, data)` — validate first, atomic write (temp + rename), re-index.
- `save_file(slug, relative_path, content)` — atomic write-through.
- `delete_pack(slug)` — moves to `~/.myvoice/trash/<timestamp>-<slug>/` (soft delete).

Every write triggers re-validation; UI shows live validation state.

### Config file shape

`~/.myvoice/config.yaml`, `chmod 0600`:

```yaml
version: 1
server:
  port: 7878
  open_browser: true
pack_paths:
  - ~/Code/work-style-packs
ui:
  default_pack: dan
  theme: system
providers:
  anthropic:
    api_key: sk-ant-...
    default_model: claude-sonnet-4-6
  openai:
    api_key: sk-...
    default_model: gpt-5
  google:
    api_key: ...
    default_model: gemini-2.5-pro
features:
  default_extraction_provider: anthropic
  default_compose_provider: anthropic
```

### Intentional non-features in v1

- No pack registry / remote install. "Install a shared pack" = `git clone` + add path to `pack_paths`.
- No SQLite cache. Pack index lives in memory; cold start re-reads all manifests.

## 2.3 UI screens & flows

### App shell

Three-pane layout: **library sidebar (200px) → pack sub-nav (200px) → editor canvas (flex)**. Library is always visible; pack switching is one click from anywhere.

Library sidebar contains:
- Navigation: Packs, Extract from URLs, Compose & test, Settings.
- "Your packs" list with colored badges.
- "+ New pack" action.

### Pack editor

Selected pack opens with sub-nav: Overview, Manifest, Style guide, Formats (N), Samples (N), Bios (N). Live validation indicator at the sub-nav footer (green dot = valid, red badge with count = invalid).

Editor canvas:
- Title + file path (reinforces "real files on disk").
- WYSIWYG/Raw toggle for markdown files.
- Tiptap toolbar (headings, bullets, blockquote, bold/italic, link, code).
- Save / Discard appear only when there are unsaved changes.
- Status bar: save state, char/word count, per-file lint warning count.

Manifest editing uses form components (not raw YAML): tag inputs for banished words, table for permitted exceptions, list editors for formats/samples/bios with reorder.

### Extract from URLs (3-step wizard)

**Step 1 — Inputs:**
- URL pasting area (add/remove rows).
- File upload dropzone (.md, .txt, .docx).
- Pack details: slug, display name, author, save location.
- Provider/model selection.
- Time + cost estimate before commit.
- "Analyze & extract →" disabled until at least one input + unique slug.

**Step 2 — Analyzing:**
- Persistent stepper showing current stage.
- Live progress messages from backend SSE: fetching, cleaning, analyzing, linting.

**Step 3 — Review draft:**
- Source summary (N URLs + N files, total word count, model used, time, cost).
- Sections, all editable/checkable: Persona, Banished words (with frequency), Permitted exceptions (with inferred reason), Style guide draft (preview with full editor), Samples (cards with source link, checkbox), Bios (explicitly skipped with placeholder note).
- Nothing writes to disk until "Save pack."

### Compose & test

Controls bar (top): pack, format, samples, provider, model, "View prompt" button, "Rewrite" button.

Two-column workspace:
- **Input pane** (left): paste draft, inline lint violations highlighted (orange = banished word, pink = banished phrase, purple = rule), violations list below.
- **Output pane** (right): rewritten draft with same highlighting + green highlighting for "principle hits" (Conflict & Resolution opener detected, Speed-to-Value vocabulary used, Golden Command structure found). Receipt with model/time/cost.
- Output pane actions: Diff toggle, Copy, **Save as sample** (closes the iteration loop — a great rewrite becomes a new sample with one click).

### Settings

Form for API keys (paste fields, masked once saved), pack_paths management, UI theme, default provider per feature.

## 2.4 Backend API surface & async job model

FastAPI. All endpoints under `/api/`. Built-in OpenAPI generation drives the typed frontend client via `openapi-typescript`.

### REST endpoints

```
# Packs
GET    /api/packs
POST   /api/packs
GET    /api/packs/{slug}
DELETE /api/packs/{slug}
POST   /api/packs/{slug}/validate
GET    /api/packs/{slug}/manifest
PUT    /api/packs/{slug}/manifest
GET    /api/packs/{slug}/files/{path:path}
PUT    /api/packs/{slug}/files/{path:path}

# Sync operations
POST   /api/compose                       # {pack, format?, samples[]?, draft?} → composed prompt
POST   /api/lint                          # {pack, text} → violations[]

# Async jobs
POST   /api/extract                       # {urls[], files[], pack_meta, provider, model} → {job_id}
POST   /api/rewrite                       # {pack, format?, samples[]?, draft, provider, model} → {job_id}
GET    /api/jobs/{job_id}                 # snapshot of state
DELETE /api/jobs/{job_id}                 # cancel

# Config & providers
GET    /api/config
PUT    /api/config
GET    /api/providers/{provider}/models

# SSE
GET    /api/events                        # long-lived: pack:*, config:*
GET    /api/jobs/{job_id}/events          # per-job: stage, token, complete, error
```

### Job model

Jobs are Python objects in an in-memory `JobRegistry` keyed by UUID. Run via FastAPI `BackgroundTasks`. State doesn't persist across server restarts — for local-first single-user use, this is fine.

```python
class Job:
    id: str
    type: Literal["extract", "rewrite"]
    status: Literal["pending", "running", "succeeded", "failed", "cancelled"]
    stage: str
    progress: float
    started_at: datetime
    finished_at: datetime | None
    result: dict | None
    error: dict | None
```

Cancellation works by setting a flag the job function checks at stage boundaries.

**No Celery, Redis, or broker.** Zero infrastructure dependencies in a local-first app.

### Event shapes

Pack events on `/api/events`:

```jsonl
{"type":"pack:created","slug":"dan-new","name":"Dan Baskette","path":"..."}
{"type":"pack:updated","slug":"dan","files_changed":["formats/blog-post.md"]}
{"type":"pack:invalid","slug":"alice","errors":[{"path":"persona.identity","message":"required"}]}
{"type":"pack:deleted","slug":"old-pack"}
{"type":"config:updated","keys_changed":["providers.anthropic.api_key"]}
```

Job events on `/api/jobs/{id}/events`:

```jsonl
{"type":"stage","name":"fetching","message":"Fetching 2 URLs","progress":0.05}
{"type":"stage","name":"analyzing","message":"Sending 8,400 words to Claude","progress":0.40}
{"type":"token","delta":"For years"}
{"type":"stage","name":"linting","message":"Linting output","progress":0.95}
{"type":"complete","result":{...}}
{"type":"error","code":"provider_rate_limit","message":"...","retry_after_seconds":30}
```

### Error envelope

All non-2xx:

```json
{
  "error": {
    "code": "pack_not_found",
    "message": "No pack with slug 'foo' in configured pack_paths.",
    "details": { "slug": "foo", "searched": ["~/.myvoice/packs", "..."] },
    "hint": "Run GET /api/packs to see available slugs."
  }
}
```

Standard codes: `pack_not_found`, `pack_invalid`, `slug_conflict`, `manifest_invalid`, `file_not_found`, `provider_missing_key`, `provider_rate_limit`, `provider_error`, `job_not_found`, `job_already_running`.

`provider_missing_key` deep-links the frontend to Settings.

### File watching

`watchfiles` task running at startup. Events debounced 200ms, mapped to slugs, pushed to `/api/events`. Files outside `<root>/<slug>/` are ignored.

### Not in v1

- No WebSockets. SSE is unidirectional, which is exactly what we need.
- No auth/CORS/HTTPS. Server binds to `127.0.0.1` only.

## 2.5 LLM provider abstraction + extractor pipeline

### Provider abstraction

`LLMProvider` Protocol with `complete()`, `stream()`, `list_models()`. Three implementations: Anthropic, OpenAI, Google — each ~80–120 lines wrapping the native SDK.

```python
class LLMResponse(BaseModel):
    text: str
    input_tokens: int
    output_tokens: int
    model: str
    finish_reason: Literal["stop", "length", "error"]
```

**JSON output convergence.** Each provider handles structured output differently (Anthropic tool use, OpenAI `response_format`, Google `response_mime_type`). The base interface accepts a `json_schema`; provider implementations route to the right native mechanism, validate against the schema, retry once on invalid output, then raise `provider_error`.

**Cost tracking.** Providers return tokens used. `cost_calculator` maps `(provider, model, tokens)` to USD via a static rate card (`llm/rates.yaml`, ships with releases). Labels in UI: "approximate."

### Extractor pipeline

Four stages, each a pure function:

```
[URLs + files] → FETCH → CLEAN → ANALYZE → PROPOSE
                  │       │        │         │
                  │       │        │         └─ PackProposal dataclass
                  │       │        └─ LLM call w/ JSON schema → AnalysisResult
                  │       └─ trafilatura (HTML) | utf8 (md/txt) | python-docx
                  └─ httpx async, parallel, 10s timeout, 3 retries, max 5 concurrent
```

**Fetch:** `User-Agent: myvoice/{version}`. Soft errors continue (pipeline reports "5 of 7 succeeded"). Zero successes → `extractor_no_sources`.

**Clean:** `trafilatura.extract(html, include_comments=False, include_tables=False, favor_precision=True)`. Files <200 bytes dropped as warnings.

**Analyze:** Corpus concatenated with `--- source: <url|file> ---` separators. Single LLM call with structured analysis prompt (Jinja template in `extractor/prompts/analyze.j2`). Asks for: persona inference, banished word analysis with frequency, permitted exceptions with reasoning, sample ranking, style-guide draft, pop-culture detection. Strict JSON schema enforces shape.

**Propose:** Maps `AnalysisResult` → `PackProposal` with source attributions and confidence indicators. No I/O. Files only written when user clicks "Save pack" on Step 3, which calls `POST /api/packs`.

### Rewrite pipeline

```
[pack, format, samples, draft, provider, model]
  → COMPOSE (compose.py renders full prompt)
  → STREAM (provider.stream → AsyncIterator[str], tokens pushed as SSE deltas)
  → LINT (lint.py against output)
  → SSE 'complete' with {output, lint_violations, lint_hits, cost, tokens}
```

**Lint hits** are positive matches — heuristic, not LLM-judged:

- Conflict-opener: first sentence contains "for years", "most teams struggle", "the problem with…", etc.
- Speed-to-Value: `unlock|powerhouse|tipping point|finally` near a specific time/effort claim.
- Golden Command: 3–4 capitalized single-word sentences in sequence.

Feedback signals, not gates.

### What gets ported from Dan-AI's existing bash tooling

Dan-AI today ships `scripts/compose.sh` and `scripts/banished-lint.sh`. Their logic ports directly into pure-Python equivalents that live in `packages/api/myvoice/`. There is no third pre-existing bash tool — `validate.py` is net-new (Dan-AI has no formal validator today).

- `Dan-ai/scripts/compose.sh` → `myvoice/compose.py` (same composition order; output matches modulo cosmetic header differences explained in 1.5).
- `Dan-ai/scripts/banished-lint.sh` → `myvoice/lint.py` (reads from manifest instead of hardcoded list, applies same matchers).
- `myvoice/validate.py` is new — enforces the SPEC v1.0 rules listed in 1.4.

The SPEC v1.0 document is the contract; myvoice is one consumer of it.

## 2.6 Build, run, test, distribute

### Local development

- Backend: `uv` (faster than pip, replaces poetry/venv/pyenv).
- Frontend: `pnpm`.

Two-process dev:

```bash
$ uv run myvoice serve --dev          # API on :7878, doesn't serve frontend
$ cd packages/web && pnpm dev         # Vite on :5173, proxies /api/* → :7878
```

`Makefile` wraps common commands: `dev`, `build`, `test`, `test-api`, `test-web`, `lint`, `fmt`, `validate-packs`, `clean`.

### Build

Single Python wheel with pre-built frontend bundled:

1. `pnpm install && pnpm build` → `packages/web/dist/`.
2. Copy `dist/*` → `packages/api/myvoice/static/`.
3. `uv build` → `dist/myvoice-1.0.0-py3-none-any.whl`.

`pyproject.toml` declares `myvoice/static/**` in package data. FastAPI mounts it at `/`. Users don't need Node installed.

### Testing

**Python (pytest):**
- `tests/packs/` — discovery, CRUD, watching (uses `tmp_path`).
- `tests/compose/` — golden files; one-time parity check against `Dan-ai/scripts/compose.sh` to verify the Python composer produces the same output (modulo whitelisted cosmetic differences), then golden output is captured as the source of truth for future regressions.
- `tests/lint/` — golden + assertion tests per rule type.
- `tests/validate/` — fixture packs (valid-minimal, missing-style-guide-fails, slug-mismatches-dir-fails…).
- `tests/llm/` — provider tests with `respx`-mocked HTTP. No real API calls in CI.
- `tests/extractor/` — pipeline tests with mocked LLM and recorded fixture HTML (WordPress, Hugo, Substack, Ghost).

**Frontend (Vitest):**
- Editor components (manifest form, Tiptap, sample card).
- API client tests with MSW.

**E2E (Playwright):**
- Create pack flow.
- Compose & test flow with mocked LLM.

**Static checks:**
- `ruff` + `mypy --strict` (Python).
- `biome` + `tsc --noEmit` (TypeScript).

CI fails on any.

### Distribution

**Primary install path:**

```bash
brew install pipx
pipx ensurepath
pipx install myvoice
myvoice serve
```

Also `pip install myvoice` inside a user-managed venv.

**Release:** Tag → GitHub Action → tests → build → publish to PyPI via OIDC trusted publishing → attach wheel to GitHub release.

### First-run experience

```bash
$ pipx install myvoice
$ myvoice serve
[myvoice] first run detected — seeding ~/.myvoice/
[myvoice] config created: ~/.myvoice/config.yaml
[myvoice] starting on http://localhost:7878
[myvoice] opening browser...
```

Browser opens. Pack library shows `dan` and `_template`. Banner: "Welcome — add an LLM API key in Settings to enable extraction and compose." One click to Settings, paste a key, banner dismisses. No accounts, no signup. The UI is the onboarding.

### Done-state checklist for v1

- [ ] `make test` passes locally and in CI.
- [ ] `validate-packs` green for `packs/dan/` and `packs/_template/`.
- [ ] Playwright E2E green against `myvoice serve --dev`.
- [ ] Wheel builds, includes static assets, `pipx install ./dist/myvoice-*.whl` works on a clean machine.
- [ ] `myvoice serve` on a clean install: boots, seeds `~/.myvoice/`, opens browser, all three flows (pack edit, extract from URLs, compose & test) work end-to-end against real Claude/OpenAI/Gemini keys.
- [ ] README covers install, first run, and the 3 main flows with screenshots.

---

## Future work (explicitly deferred from v1)

- **Pack sharing/export** (zip, shareable URL).
- **Standalone "lint any draft" page.**
- **Pack registry / remote install.**
- **SQLite-backed pack index** (only if startup gets slow with many packs).
- **AI-assisted bio extraction.**
- **Hosted SaaS** with multi-user accounts.
- **Homebrew formula, single static binary, Tauri desktop wrapper.**
- **WebSocket protocol** (only if we ever need bidirectional realtime).
- **Pencraft integration** — Pencraft (a separate project) will consume packs from this spec to power blog-post generation.
