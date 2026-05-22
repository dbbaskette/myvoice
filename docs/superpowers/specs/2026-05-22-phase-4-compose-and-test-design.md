# Phase 4 — Compose & test (Design)

**Status:** Approved (brainstorm complete, awaiting implementation plan)
**Date:** 2026-05-22
**Author:** Dan Baskette (with Claude)
**Parent design:** [`2026-05-22-myvoice-design.md`](./2026-05-22-myvoice-design.md)

---

## Overview

Phase 4 turns myvoice from a pack browser/editor into a working tool. A writer with API keys can paste a draft into the **Compose & test** page, watch it stream back in their voice, see lint feedback on both sides, and one-click promote a great rewrite into a new sample.

This phase ships every dependency required to make that loop work:

- **LLM provider abstraction** with adapters for Anthropic, OpenAI, and Google.
- **Config & Settings** backend + full Settings UI (API keys, `pack_paths`, theme, defaults).
- **Job model + SSE** for streamed async work.
- **Routes:** `/api/rewrite`, `/api/compose`, `/api/lint`, `/api/config`, `/api/providers/{p}/models`, `/api/jobs/{id}` + SSE, `/api/packs/{slug}/samples`.
- **Compose & test UI** with selectors, streaming output, lint highlighting (both panes), positive-hit highlighting, View prompt modal, Diff toggle, Copy, Save-as-sample.
- **File watching** (`watchfiles` + `/api/events` SSE) — folded in because the SSE infrastructure is built anyway.

Out of scope: Extract from URLs (Phase 5), Manifest form editor (Phase 6), pack sharing/export, registry, SQLite cache.

---

## 1. Architecture

Rewrite is async and streaming. End-to-end flow:

```
UI POST /api/rewrite { pack, format?, samples[]?, draft, provider, model }
   │
   ├── server composes prompt (compose.py)
   ├── creates Job (status=pending, type=rewrite) in JobRegistry
   ├── schedules background task via FastAPI BackgroundTasks
   └── returns 202 { job_id }

UI opens EventSource /api/jobs/{job_id}/events  (SSE)

Background task:
   provider.stream(prompt, model) → AsyncIterator[StreamChunk]
     ├── for each delta chunk: append to job.partial_text, push {type:"token", delta}
     └── on final chunk: capture usage (in/out tokens, finish_reason)
   on stream end:
     ├── run lint.py over full output → violations + positive hits
     ├── compute cost via cost_calculator.usd(provider, model, in_tok, out_tok)
     └── push {type:"complete", result:{output, lint_violations, lint_hits, cost, tokens, finish_reason}}
   on error:
     └── mark job failed; push {type:"error", code, message, hint}
   on cancellation:
     └── asyncio.Event.is_set() check between chunks; mark cancelled
```

Two long-lived SSE streams:

- `/api/events` — global pack/config events (`pack:created|updated|deleted|invalid`, `config:updated`).
- `/api/jobs/{id}/events` — per-job lifecycle (`stage`, `token`, `complete`, `error`).

In-process state only. No Redis, no broker. Single-user local-first.

---

## 2. LLM provider abstraction

### 2.1 Protocol

```python
# packages/api/myvoice/llm/base.py

class ModelInfo(BaseModel):
    id: str
    label: str
    context_window: int
    supports_streaming: bool

class LLMResponse(BaseModel):
    text: str
    input_tokens: int
    output_tokens: int
    model: str
    finish_reason: Literal["stop", "length", "error"]

class StreamChunk(BaseModel):
    delta: str = ""              # incremental text
    usage: Usage | None = None   # only set on the final chunk
    finish_reason: str | None = None

class LLMProvider(Protocol):
    name: str  # "anthropic" | "openai" | "google"
    async def list_models(self) -> list[ModelInfo]: ...
    async def complete(self, *, model: str, prompt: str,
                       json_schema: dict | None = None) -> LLMResponse: ...
    async def stream(self, *, model: str, prompt: str) -> AsyncIterator[StreamChunk]: ...
```

### 2.2 Adapters

One file per provider in `packages/api/myvoice/llm/`, each ~80–120 lines wrapping the native SDK:

- `anthropic.py` — uses `anthropic` Python SDK. Streaming via `client.messages.stream`. Models via `client.models.list`.
- `openai.py` — uses `openai` SDK. Streaming via `client.chat.completions.create(stream=True)`. Models via `client.models.list`.
- `google.py` — uses `google-generativeai` SDK. Streaming via `model.generate_content(stream=True)`. Google has no live `models.list` for end-user keys, so `list_models()` reads a **curated allowlist** from `rates.yaml`.

### 2.3 Error mapping

Each adapter catches native exceptions and raises typed equivalents:

```python
class ProviderError(Exception):
    code: str        # "provider_error" by default
    message: str
    hint: str | None = None

class ProviderMissingKey(ProviderError): code = "provider_missing_key"
class ProviderRateLimit(ProviderError):
    code = "provider_rate_limit"
    retry_after_seconds: int | None
```

HTTP layer maps these to the design's error envelope. `provider_missing_key` includes a `hint` that deep-links to Settings.

### 2.4 Cost calculator + rate card

`llm/rates.yaml` ships in-repo, bundled into the wheel:

```yaml
anthropic:
  claude-sonnet-4-6:
    input_per_million_usd:  3.00
    output_per_million_usd: 15.00
    context_window: 200000
    supports_streaming: true
  claude-opus-4-7:
    # ...
openai:
  gpt-5:
    # ...
google:
  gemini-2.5-pro:
    # ...
```

```python
# llm/cost.py
def usd(provider: str, model: str, input_tokens: int, output_tokens: int) -> float: ...
```

Pure function, table-driven, no I/O. UI labels every figure "approximate."

`list_models()` for Google reads from `rates.yaml`; for Anthropic and OpenAI it calls the real endpoint and union-merges with `rates.yaml` (so we always have a pricing row even for newly-released models).

### 2.5 Result caching

`GET /api/providers/{provider}/models` caches its result in-process for 5 minutes per provider. Invalidated on `PUT /api/config` for the affected provider (key change → re-test next call).

---

## 3. Config & Settings backend

### 3.1 File

`~/.myvoice/config.yaml`, `chmod 0600`. Shape matches design 2.2 (`server.port`, `pack_paths[]`, `ui.{default_pack, theme}`, `providers.{name}.{api_key, default_model}`, `features.{default_compose_provider, default_extraction_provider}`).

### 3.2 Pydantic model

`config.py` defines `Config` with strict field validation. Loaded on FastAPI startup via lifespan; held in `app.state.config`.

### 3.3 Routes

```
GET /api/config       → Config with api_key fields rewritten to "sk-...***" sentinel if present, "" if absent.
PUT /api/config       → partial body; merges; validates; atomic write (temp + rename); emits config:updated SSE.
GET /api/providers/{provider}/models → ModelInfo[]
```

### 3.4 Roundtrip rules for API keys

Frontend never receives plaintext after first save:

| Server returns | UI shows | UI submits | Server behavior |
|---|---|---|---|
| `""` | placeholder "—" | `"sk-ant-real"` | sets key |
| `"sk-ant-***"` | masked, no plaintext | `"sk-ant-***"` (unchanged) | no-op, preserves existing |
| `"sk-ant-***"` | user types new | `"sk-ant-new"` | replaces |
| `"sk-ant-***"` | user clears | `""` | clears key |

### 3.5 Pack path changes

Editing `pack_paths[]` triggers `PackStore.rescan()` synchronously inside `PUT /api/config`; new packs surface in the next `/api/events` tick. Removed paths' packs are dropped from the index but files remain on disk.

---

## 4. Job model & SSE

### 4.1 Job

```python
class Job(BaseModel):
    id: str                                  # uuid4 hex
    type: Literal["rewrite", "extract"]      # "extract" reserved for Phase 5
    status: Literal["pending","running","succeeded","failed","cancelled"]
    stage: str                               # human-readable; e.g. "streaming"
    progress: float = 0.0                    # 0.0..1.0
    started_at: datetime
    finished_at: datetime | None = None
    partial_text: str = ""                   # accumulated stream tokens (replay buffer)
    result: dict | None = None
    error: dict | None = None
```

### 4.2 JobRegistry

In-process singleton: `dict[str, Job]` + `asyncio.Lock`. Capped at **50 recent jobs**, LRU evict by `finished_at`. Per-job `asyncio.Event` stored separately for cancellation signalling. Survives request boundaries but not server restart — acceptable for local-first.

### 4.3 SSE: `/api/jobs/{id}/events`

`text/event-stream`. On connect:

1. Emit current `stage` event.
2. If `partial_text` is non-empty, emit it as a single `{"type":"token","delta":"<all-of-it>"}` so a refreshed browser tab catches up.
3. Stream live events going forward.
4. If job already terminal, emit the final `complete` or `error` event and close.

### 4.4 Cancellation

`DELETE /api/jobs/{id}` sets the cancellation event. The streaming task checks `event.is_set()` between chunks (not mid-chunk). On detection: stop iterating the provider stream, mark `status=cancelled`, emit `{"type":"error","code":"cancelled"}` to subscribers, free the slot.

### 4.5 Global event stream: `/api/events`

Long-lived SSE. Emits:

```jsonl
{"type":"pack:created","slug":"foo","name":"Foo","path":"..."}
{"type":"pack:updated","slug":"dan","files_changed":["formats/blog-post.md"]}
{"type":"pack:invalid","slug":"alice","errors":[{...}]}
{"type":"pack:deleted","slug":"old"}
{"type":"config:updated","keys_changed":["providers.anthropic.api_key"]}
```

Source: `watchfiles` + `PUT /api/config`.

---

## 5. HTTP routes added in Phase 4

```
# Config & providers
GET    /api/config                        → ConfigResponse (keys redacted)
PUT    /api/config                        → ConfigResponse
GET    /api/providers/{provider}/models   → ModelInfo[]

# Compose (sync — assembles prompt; no LLM call)
POST   /api/compose                       → { prompt, char_count, samples_used }
                                            body: { pack, format?, samples[]?, draft? }

# Lint (sync)
POST   /api/lint                          → { violations: LintHit[] }
                                            body: { pack, text }

# Rewrite (async)
POST   /api/rewrite                       → 202 { job_id }
                                            body: { pack, format?, samples[]?, draft, provider, model }
GET    /api/jobs/{id}                     → Job
DELETE /api/jobs/{id}                     → 204
GET    /api/jobs/{id}/events              → SSE

# Global events
GET    /api/events                        → SSE (pack:*, config:*)

# Samples (Save-as-sample target)
POST   /api/packs/{slug}/samples          → 201 { id, file }
                                            body: { excerpt, source_url?, note? }
```

### 5.1 `LintHit` shape

```python
class LintHit(BaseModel):
    start: int                 # UTF-16 code-unit offset (matches JS String.length)
    end: int
    kind: Literal["banished_word", "banished_phrase", "rule", "positive_hit"]
    rule_id: str               # e.g. "banished:delve", "rule:no_em_dashes", "hit:conflict_opener"
    message: str
```

UTF-16 offsets, not byte or codepoint offsets — saves an entire class of highlighter bugs when content has emoji or accented characters.

### 5.2 `POST /api/packs/{slug}/samples`

Coupled write: appends to `samples[]` in manifest + writes `samples/<id>-<auto-slug>.md`. Single endpoint because the two operations must succeed or fail together.

- `id` auto-increments (`max(existing) + 1`, zero-padded to 2 digits: `"06"`).
- File body: blockquote of `excerpt`, optionally preceded by italic note line and source URL.
- Atomic manifest write (temp + rename) after file write succeeds; on file write failure, no manifest mutation.
- Emits `pack:updated` SSE on success.

---

## 6. Compose & test UI

### 6.1 Layout

Route: `/compose/:slug?`. Slug optional — defaults to `config.ui.default_pack`, falling back to the first valid pack.

```
┌─ Controls bar ───────────────────────────────────────────────────────────┐
│ [Pack ▾] [Format ▾] [Samples ☐☐☐] [Provider ▾] [Model ▾] [View prompt]  │
│                                                              [Rewrite ▶] │
└──────────────────────────────────────────────────────────────────────────┘
┌─ Input pane (left, flex) ────────┬─ Output pane (right, flex) ───────────┐
│ <textarea: draft>                │ <streamed output, highlights live>     │
│   live lint highlights:          │   live lint highlights (same colors)   │
│     orange = banished_word       │   + green = positive_hit               │
│     pink   = banished_phrase     │                                        │
│     purple = rule                │                                        │
│                                  │ [Diff ⇄] [Copy] [Save as sample]      │
│ ▼ 4 violations                   │ Receipt: claude-sonnet-4-6 · 4.2s ·    │
│   - "delve" (banished word) @42  │   1,847 in / 612 out · ~$0.012        │
└──────────────────────────────────┴───────────────────────────────────────┘
```

### 6.2 Behavior

- **Selectors.** Pack from `/api/packs`; format and samples from `/api/packs/{slug}/manifest`; provider from configured providers in `/api/config`; model from `/api/providers/{p}/models`. Provider/model default from `config.features.default_compose_provider` + `config.providers.{p}.default_model`.
- **Input lint.** `POST /api/lint` debounced 250ms on draft change. Highlights rendered via CodeMirror 6 decoration overlay (we already use CodeMirror in the existing markdown editor — reuse the extension setup).
- **View prompt.** Opens a modal. Calls `POST /api/compose` with current selections (and current draft if non-empty). Shows the assembled prompt in a `<pre>` with a Copy button.
- **Rewrite.** Validates provider/model selected. POSTs `/api/rewrite`. On 202, opens `EventSource` to the job's stream URL. On `token` events: append `delta` to output buffer (no highlights yet — too jittery during streaming). On `complete`: paint highlights from the result's `lint_violations` + `lint_hits`, render receipt.
- **Diff.** Toggle. When on, replaces output pane with a side-by-side diff (input vs output) using `react-diff-viewer-continued`. Highlights disabled in diff mode.
- **Copy.** Standard clipboard write of plaintext output.
- **Save as sample.** Opens a small dialog with prefilled `excerpt = output` (editable), optional `source_url` and `note` fields. Submit POSTs `/api/packs/{slug}/samples`. Toast: "Saved as sample 06." Selectors' samples list auto-refreshes from the next `pack:updated` event.
- **Error display.** Inline banner above output pane, shows `error.message` and `error.hint`. `provider_missing_key` includes a "Go to Settings" link.

### 6.3 Positive-hit heuristics (server-side in `lint.py`)

Three v1 detectors, all pure-Python regex:

| Hit | Match heuristic |
|---|---|
| `hit:conflict_opener` | First sentence (up to first `.`/`!`/`?`) contains any of: "For years", "Most teams struggle", "The problem with", "Anyone who's", "If you've ever". Case-insensitive. |
| `hit:speed_to_value` | Any of `unlock`, `powerhouse`, `tipping point`, `finally` within 80 chars of a numeric+time pattern (`\b\d+\s*(minute|hour|day|week|x|×|%)\b`). |
| `hit:golden_command` | 3 or 4 consecutive single-word capitalized sentences (`^[A-Z][a-z]+\.$` lines or `[A-Z][a-z]+\.` followed by another within 2 chars). |

These are feedback signals, not gates. False positives are fine — they only affect highlighting.

---

## 7. Settings page UI

One scrollable page (no sub-nav), five sections. Single "Save changes" button at top, "Discard" resets to last-loaded.

1. **API keys** — three masked password fields (Anthropic, OpenAI, Google). Each row has a "Test connection" button that calls `GET /api/providers/{p}/models` and shows ✓ (with model count) or ✗ (with error message).
2. **Pack paths** — list editor for `pack_paths[]`. Each row: path text input + folder picker (native `<input type="file" webkitdirectory>` for selection convenience) + remove button + reorder handles. Below each row: small "N packs discovered" badge updated after Save. "Add path" button at bottom.
3. **Theme** — radio: Light / Dark / System. Applied via Tailwind's `class` strategy on `<html>` toggled by a top-level effect.
4. **Defaults** — three selects:
   - `default_pack` — slug from currently-known packs.
   - `default_compose_provider` — anthropic / openai / google (only ones with configured keys are enabled).
   - `default_extraction_provider` — same, used by Phase 5.
5. **Server** — read-only display of `server.port` and `server.open_browser`, with a note "Edit `~/.myvoice/config.yaml` and restart to change."

---

## 8. File watching

Folded into Phase 4 because the SSE infrastructure (`/api/events`) is already being built and `watchfiles` is small.

- `watchfiles.awatch` task spawned at FastAPI startup via lifespan, watching every pack root in the active index + every `pack_paths[]` entry.
- 200ms per-path debounce.
- Path mapping:
  - `<root>/<slug>/stylepack.yaml` changed → re-validate; emit `pack:updated` (if still valid) or `pack:invalid`.
  - `<root>/<slug>/<file>` changed (not manifest) → emit `pack:updated` with `files_changed: [<file>]`.
  - New `<root>/<dir>/stylepack.yaml` appeared → emit `pack:created`.
  - `stylepack.yaml` removed → emit `pack:deleted`.
- UI: pack sidebar (`PackList`) and detail page listen on `/api/events`. Live badge updates. If a file open in the editor changes externally:
  - No unsaved local edits → silent reload.
  - Unsaved local edits → toast: "File changed on disk. Reload? (loses N unsaved changes) [Reload] [Keep mine]".

---

## 9. Testing

### 9.1 Python (pytest)

- `tests/llm/test_anthropic.py`, `test_openai.py`, `test_google.py` — each adapter: `complete`, `stream` chunk sequence, `list_models`, error mapping. HTTP mocked with `respx`. **No real API calls in CI.**
- `tests/llm/test_cost_calculator.py` — table-driven against `rates.yaml`.
- `tests/llm/test_recordings/` — opt-in live-API tests gated by `MYVOICE_LIVE_LLM_TESTS=1`. Recorded responses re-recorded on demand before each release to catch SDK contract drift.
- `tests/jobs/test_registry.py` — create / snapshot / cancel / LRU eviction at 50 / replay buffer.
- `tests/api/test_rewrite_route.py` — submit, assert 202 + job id; drive a fake provider yielding N chunks then completing; assert SSE sequence is `stage → token×N → complete` with lint + cost populated.
- `tests/api/test_config_route.py` — GET redacts keys; PUT with `"sk-ant-***"` sentinel preserves existing; empty clears; atomic write survives a simulated mid-write crash.
- `tests/api/test_samples_route.py` — POST writes file + appends manifest; id auto-increment; failure on file write leaves manifest untouched.
- `tests/lint/test_positive_hits.py` — 3 heuristics: positive + obvious-negative cases each.
- `tests/watch/test_watcher.py` — write a manifest into `tmp_path` pack root, assert `pack:updated` fires within 500ms.

### 9.2 Frontend (Vitest)

- `compose/ComposePage.test.tsx` — selector wiring; Rewrite opens EventSource; token deltas append; complete paints highlights; error event renders envelope.
- `compose/LintOverlay.test.tsx` — given a `LintHit[]`, decorations render at correct UTF-16 offsets (regression test for emoji-containing input).
- `settings/SettingsPage.test.tsx` — masked-key roundtrip; pack_paths add/remove; Test-connection happy + error paths.
- API client tests via MSW.

### 9.3 Playwright E2E

- `e2e/compose-rewrite.spec.ts` — start backend with `MYVOICE_TEST_PROVIDER=mock` that yields a scripted stream; full UI flow: pick pack/format/samples, click Rewrite, see streamed output, click Save-as-sample, verify file landed on disk and is included in next `GET /api/packs/dan/manifest`.
- `e2e/settings-keys.spec.ts` — paste key → save → reload → verify masked roundtrip; Test-connection against mock provider.

### 9.4 Static checks

Existing `ruff` + `mypy --strict` + `biome` + `tsc --noEmit` all pass. CI fails on any.

---

## 10. Done-state for Phase 4

- [ ] `make test` green (Python + TS + Playwright).
- [ ] `make lint` green.
- [ ] All 3 providers' mocked tests pass; opt-in live-LLM tests pass locally against real keys for at least one model per provider.
- [ ] On a fresh `~/.myvoice/` (delete config + restart): Settings page guides through key entry, Compose page works end-to-end with each of the 3 providers.
- [ ] External edit to `packs/dan/style-guide.md` in VS Code (while UI is open) reflects in the UI within 1 second.
- [ ] Cancelling a streaming rewrite mid-stream halts within ~1 chunk and frees the job slot.
- [ ] Save-as-sample on a real rewrite produces a valid manifest + file pair; `myvoice pack validate packs/dan` still passes.
- [ ] README updated with Compose & test screenshots and "Add an API key" first-run step.

---

## 11. PR sequence

Bottom-up by layer. Each PR targets <500 LOC diff and is reviewable in one sitting. Branch from main, merge back to main; the next branches from the merge.

```
PR1   feat(api): LLM provider abstraction + Anthropic adapter + rates.yaml + cost calc
PR2   feat(api): OpenAI adapter
PR3   feat(api): Google adapter (curated model allowlist)
PR4   feat(api): config backend — GET/PUT /api/config with key redaction + atomic writes
PR5   feat(api): JobRegistry + /api/jobs/{id} + /api/jobs/{id}/events SSE w/ replay buffer
PR6   feat(api): /api/rewrite (async) + /api/compose & /api/lint (sync) + positive-hit heuristics
PR7   feat(api): POST /api/packs/{slug}/samples + watchfiles + /api/events
PR8   feat(web): Settings page (keys + pack_paths + theme + defaults)
PR9   feat(web): Compose page — selectors + streaming + lint highlights + receipt
PR10  feat(web): Compose polish — View prompt, Diff, positive-hit colors, Save-as-sample
PR11  test(e2e): Playwright compose + settings; docs(README): Compose section + screenshots
```

---

## 12. Out of scope (deferred to later phases)

- **Extract from URLs** — Phase 5.
- **Manifest form editor** — Phase 6 (the read-only YAML preview from Phase 3 stays).
- **Pack export/share, registry, SQLite cache, Homebrew formula, Tauri wrapper, hosted SaaS** — Future work, per parent design.
