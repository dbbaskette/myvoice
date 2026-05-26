# Phase 6 — Extract from URLs (Design)

**Status:** Approved (brainstorm complete, awaiting implementation plan)
**Date:** 2026-05-22
**Author:** Dan Baskette (with Claude)
**Parent design:** [`2026-05-22-myvoice-design.md`](./2026-05-22-myvoice-design.md) (especially §2.3 and §2.5)

---

## Overview

Phase 6 ships AI-assisted pack creation — the second reason myvoice exists, per the parent design overview. A writer points the app at their existing blog URLs (and/or uploads `.md` / `.txt` / `.docx` drafts), the LLM analyses the corpus, and produces a populated pack proposal the writer reviews, edits, and saves as a new pack.

After Phase 6, every v1 capability from the parent design ships except deferred-by-design pieces (sharing/export, registry, SQLite cache, AI bio extraction, hosted SaaS, Homebrew/Tauri, WebSockets, Pencraft integration).

**In scope:**

- LLM structured-output (`json_schema`) wired across all 3 providers (Anthropic, OpenAI, Google).
- Extractor pipeline: FETCH (parallel httpx) → CLEAN (trafilatura HTML + utf8 text + python-docx) → ANALYZE (single LLM call w/ strict JSON schema) → PROPOSE (pure mapper).
- `POST /api/extract` (async, reuses Phase 4 JobRegistry + per-job SSE).
- `POST /api/packs/from-analysis` (create-new pack from approved proposal).
- File upload via base64-in-JSON (no multipart): up to 5 MB per file, 10 files per request.
- `/extract` 3-step wizard: inputs → progress → review.
- Full inline editing in Step 3 (persona text, TagInput for banished words/phrases/pop culture, ExceptionsTable for permitted exceptions, Tiptap markdown editor for style guide, checkbox+excerpt-edit per sample card).
- Cancellation between pipeline stages; mid-LLM-call cancel not supported.

**Out of scope (deferred):**

- Augmenting an existing pack with new extracts. Phase 6 always creates new.
- Per-aspect re-run / regenerate-section.
- AI-assisted bio extraction (per parent design — bios remain `_template` placeholders).
- Format add-ons auto-suggestion (out of v1 entirely).
- Persisting in-progress proposals to disk — close the browser, lose the result (same as Phase 4 rewrite jobs).
- Resume after the wizard's "Back" — Back to Step 1 clears the proposal; re-running Analyze is a fresh job.
- Multipart file upload — base64-in-JSON keeps the API style uniform.

---

# Part 1: Backend

## 1.1 Architecture

```
UI POST /api/extract { urls[], files[], pack_meta, provider, model }
   │
   ├── create Job(type="extract") in JobRegistry, schedule via FastAPI BackgroundTasks
   └── 202 { job_id }

UI EventSource /api/jobs/{job_id}/events  (SSE — Phase 4 infra, unchanged)

Background task:
   1. stage=fetching   FETCH all URLs in parallel (httpx + retries + concurrency cap)
   2. stage=cleaning   CLEAN each fetched HTML (trafilatura) and each uploaded file by ext
   3. stage=analyzing  ANALYZE — concatenate corpus, single LLM call w/ JSON schema
   4. stage=proposing  PROPOSE — pure mapper AnalysisResult → PackProposal
   5. complete with { proposal: PackProposal, sources, cost_usd, tokens, model }

UI Step 3: user edits proposal in place, clicks Save Pack
   ↓
UI POST /api/packs/from-analysis { slug, name, author, persona_*, proposal, selected_sample_indexes }
   ├── copy _template, patch manifest from proposal, append style_guide_markdown to style-guide.md
   └── write selected_sample_indexes' samples to samples/<id>-<auto>.md, emit pack:created
```

Two new endpoints. No new SSE plumbing — Job/SSE reused from Phase 4 with a new `Job.type = "extract"` value.

## 1.2 Structured output in all 3 providers

`LLMProvider.complete(..., json_schema=None)` already exists; Phase 6 makes it functional everywhere.

### Anthropic (`packages/api/myvoice/llm/anthropic.py`)

When `json_schema` is set: switch to tool-use. Define a single tool whose `input_schema` is the passed schema, force `tool_choice = {"type": "tool", "name": "record_analysis"}`. The provider's `text` return value is the tool input encoded as JSON.

```python
if json_schema is not None:
    body["tools"] = [{"name": "record_analysis", "input_schema": json_schema}]
    body["tool_choice"] = {"type": "tool", "name": "record_analysis"}
    # response.content[0].input is the structured object; serialize back to JSON for the .text field
```

On parse/validation failure: retry once with a follow-up message appending the validator error. Second failure → `ProviderError("analyze_invalid_json")`.

### OpenAI (`packages/api/myvoice/llm/openai.py`)

Existing hook from Phase 4 — finalize:
```python
if json_schema is not None:
    body["response_format"] = {
        "type": "json_schema",
        "json_schema": {"name": "record_analysis", "schema": json_schema, "strict": True},
    }
```
Retry-on-invalid-json once, same pattern as Anthropic.

### Google (`packages/api/myvoice/llm/google.py`)

Existing hook from Phase 4 — finalize. Google's schema dialect is a JSON-Schema subset (no `$ref`, no `oneOf`, limited type combinators). Add a small `to_google_schema(schema: dict) -> dict` helper that:
- Drops `$schema`, `$id`, `$ref`.
- Converts `{"type": ["string", "null"]}` → `{"type": "string", "nullable": True}`.
- Rejects unsupported features with a clear error rather than passing through.

```python
if json_schema is not None:
    body["generationConfig"] = {
        "response_mime_type": "application/json",
        "response_schema": to_google_schema(json_schema),
    }
```

### Common: invalid-JSON retry

Implemented in each adapter's `complete()`: parse `text` as JSON; if parse fails OR validation against the passed schema fails, append a system message "The previous output was not valid JSON against the schema. Error: {err}. Re-emit only valid JSON." and retry once. Validation uses `jsonschema.validate()` (add `jsonschema>=4` to deps).

## 1.3 Extractor pipeline modules

```
packages/api/myvoice/extractor/
  __init__.py
  models.py         # Pydantic: Source, FetchedDoc, CleanedDoc, AnalysisResult, PackProposal, ProposedSample, BanishedWord, BanishedPhrase
  fetch.py          # async fetch_all(urls, *, concurrency=5) -> list[FetchedDoc]
  clean.py          # clean(doc: FetchedDoc | UploadedFile) -> CleanedDoc — dispatches by content-type/extension
  analyze.py        # async analyze(corpus, provider, model) -> AnalysisResult
  propose.py        # propose(analysis, sources, model, provider, in_tok, out_tok, elapsed) -> PackProposal
  prompts/
    analyze.j2      # Jinja template
  schemas/
    analysis.json   # JSON schema for AnalysisResult
  exceptions.py     # ExtractorError(code, message)
  pipeline.py       # orchestrate the 4 stages + push stage events
```

### Data shapes (`models.py`)

```python
class Source(BaseModel):
    kind: Literal["url", "file"]
    location: str        # URL or filename
    bytes: int = 0
    word_count: int = 0
    succeeded: bool = True
    error: str | None = None

class FetchedDoc(BaseModel):
    source: Source
    content_type: str    # e.g. "text/html" or "text/markdown" or "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    raw_bytes: bytes

class CleanedDoc(BaseModel):
    source: Source
    text: str            # extracted plain text

class BanishedWord(BaseModel):
    word: str
    frequency: int

class BanishedPhrase(BaseModel):
    phrase: str
    frequency: int

class PermittedExceptionProposal(BaseModel):
    term: str
    reason: str

class ProposedSample(BaseModel):
    excerpt: str
    source_location: str
    why: str
    rank: int            # 1 = best

class AnalysisResult(BaseModel):
    """Strict shape returned by the LLM."""
    persona_identity: str
    persona_one_line: str
    banished_words: list[BanishedWord]
    banished_phrases: list[BanishedPhrase]
    permitted_exceptions: list[PermittedExceptionProposal]
    style_guide_markdown: str
    samples: list[ProposedSample]
    pop_culture_allowed: list[str]
    pop_culture_banned: list[str]

class PackProposal(BaseModel):
    analysis: AnalysisResult
    sources: list[Source]
    model: str
    provider: str
    cost_usd: float
    input_tokens: int
    output_tokens: int
    elapsed_seconds: float
```

### FETCH (`fetch.py`)

```python
async def fetch_all(urls: list[str], *, concurrency: int = 5) -> list[FetchedDoc]:
    """Fetch URLs in parallel. Soft errors return FetchedDoc with source.succeeded=False."""
    semaphore = asyncio.Semaphore(concurrency)
    async with httpx.AsyncClient(
        timeout=10.0,
        headers={"User-Agent": f"myvoice/{__version__}"},
        follow_redirects=True,
    ) as client:
        return await asyncio.gather(*[_fetch_one(client, url, semaphore) for url in urls])
```

`_fetch_one`: 3 retries on connection errors with exponential backoff (1s, 2s, 4s). On success: `FetchedDoc(content_type=resp.headers.get("content-type", "text/html"), raw_bytes=resp.content, source=Source(kind="url", location=url, bytes=len(resp.content), succeeded=True))`. On failure after retries: `Source(succeeded=False, error="...")`.

### CLEAN (`clean.py`)

Dispatches by content-type or extension:
- `text/html` (or `.html`) → `trafilatura.extract(html, include_comments=False, include_tables=False, favor_precision=True)`. If result is `None` or <200 chars → soft drop with warning logged into `source.error`.
- `text/markdown` / `text/plain` (or `.md` / `.txt`) → `bytes.decode("utf-8", errors="replace")`. Strip front-matter (optional — between two `---` lines at top).
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (or `.docx`) → `python-docx`: iterate `doc.paragraphs`, join with `\n\n`. Skip empty paragraphs.
- Anything else → `source.succeeded = False, error = "unsupported_content_type"`.

Returns `CleanedDoc(source, text)`. Sets `source.word_count = len(text.split())`.

### ANALYZE (`analyze.py`)

```python
async def analyze(cleaned_docs: list[CleanedDoc], provider: LLMProvider, model: str) -> AnalysisResult:
    successful = [d for d in cleaned_docs if d.source.succeeded and d.text.strip()]
    if not successful:
        raise ExtractorError("extractor_no_sources", "All sources failed to fetch or clean.")
    corpus = _build_corpus(successful)
    prompt = _render_template(corpus)
    schema = json.loads((Path(__file__).parent / "schemas" / "analysis.json").read_text())
    resp = await provider.complete(model=model, prompt=prompt, json_schema=schema)
    return AnalysisResult.model_validate_json(resp.text)
```

`_build_corpus`: joins with `\n\n--- source: <location> ---\n\n` separators. `_render_template`: `jinja2.Template((Path / "prompts" / "analyze.j2").read_text()).render(corpus=corpus)`.

The Jinja template's body (text in `analyze.j2`):

```
You are analyzing a corpus of writing to extract its author's voice into a structured Style Pack.

Read the entire corpus below, then emit a JSON object matching the provided schema exactly.

Guidance:
- persona_identity: a short tagline (e.g. "The Builder Who Gets It")
- persona_one_line: one sentence of the writer's stance / what they advocate for
- banished_words: tokens the writer NEVER uses (single words, lowercase), with their frequency in the corpus (0 if absent and you're confidently inferring avoidance)
- banished_phrases: multi-word patterns the writer avoids
- permitted_exceptions: words that LOOK banished but are intentional (e.g. "Pivotal" as a proper noun) — include the reason
- style_guide_markdown: 200-500 words of prose summarizing the writer's principles, examples, and brand signatures. This will be appended to the pack's style guide.
- samples: 5-10 ranked exemplars — verbatim excerpts (60-400 words each) that best showcase the voice, with a one-line `why` for each
- pop_culture_allowed / pop_culture_banned: franchises the writer does or never references

CORPUS:
{{ corpus }}
```

`schemas/analysis.json` is the JSON-Schema form of `AnalysisResult` (generated once via `AnalysisResult.model_json_schema()` and committed).

### PROPOSE (`propose.py`)

Pure function. Combines `AnalysisResult` + `list[Source]` + meta into `PackProposal`. No I/O.

```python
def propose(
    analysis: AnalysisResult,
    sources: list[Source],
    *,
    model: str,
    provider: str,
    input_tokens: int,
    output_tokens: int,
    elapsed_seconds: float,
) -> PackProposal:
    cost = usd(provider, model, input_tokens, output_tokens)
    return PackProposal(
        analysis=analysis, sources=sources,
        model=model, provider=provider,
        input_tokens=input_tokens, output_tokens=output_tokens,
        cost_usd=cost, elapsed_seconds=elapsed_seconds,
    )
```

### Pipeline orchestration (`pipeline.py`)

```python
async def run_extract_job(
    job_id: str, reg: JobRegistry, *,
    urls: list[str], uploads: list[UploadedFile],
    provider_name: str, api_key: str, model: str,
) -> None:
    cancel_evt = reg.cancellation_event(job_id)
    started = time.monotonic()
    try:
        await reg.set_stage(job_id, "fetching", progress=0.05)
        fetched_url_docs = await fetch_all(urls) if urls else []
        if cancel_evt.is_set(): return
        await reg.set_stage(job_id, "cleaning", progress=0.30)
        cleaned: list[CleanedDoc] = []
        for d in fetched_url_docs:
            cleaned.append(clean(d))
        for u in uploads:
            cleaned.append(clean_upload(u))
        if cancel_evt.is_set(): return
        await reg.set_stage(job_id, "analyzing", progress=0.50)
        provider = get_provider(provider_name, api_key)
        schema = json.loads((Path(__file__).parent / "schemas" / "analysis.json").read_text())
        analysis_resp = await provider.complete(
            model=model, prompt=_render_template(_build_corpus(cleaned)),
            json_schema=schema,
        )  # LLMResponse already exposes .text, .input_tokens, .output_tokens
        analysis = AnalysisResult.model_validate_json(analysis_resp.text)
        if cancel_evt.is_set(): return
        await reg.set_stage(job_id, "proposing", progress=0.90)
        proposal = propose(
            analysis,
            [d.source for d in cleaned],
            model=model, provider=provider_name,
            input_tokens=analysis_resp.input_tokens,
            output_tokens=analysis_resp.output_tokens,
            elapsed_seconds=time.monotonic() - started,
        )
        await reg.complete(job_id, proposal.model_dump(mode="json"))
    except ExtractorError as e:
        await reg.fail(job_id, e.code, e.message)
    except ProviderError as e:
        await reg.fail(job_id, e.code, e.message, e.hint)
    except Exception as e:
        await reg.fail(job_id, "internal_error", f"Unexpected: {e}")
```

(`complete_with_usage` is what `complete()` already does — keeps tokens; method name reflects existing `LLMResponse` shape.)

## 1.4 HTTP routes

```
POST /api/extract                        → 202 { job_id }
  body: {
    urls: string[],
    files: { name: string, content_b64: string, mime: string }[],
    pack_meta: { slug?: string, name?: string, author?: string },  // hints; Step 3 carries final values
    provider: "anthropic" | "openai" | "google",
    model: string
  }
  413 if total file bytes > 50 MB or any single file > 5 MB or files.length > 10
  400 if zero urls AND zero files
  400 if provider has no configured API key

POST /api/packs/from-analysis            → 201 PackSummary
  body: {
    slug: string,                          // regex ^[a-z][a-z0-9-_]*$
    name: string,
    author: string,
    persona_identity: string,
    persona_one_line: string,
    version?: string = "0.1.0",
    description?: string,
    proposal: AnalysisResult,              // editable copy from Step 3 (full shape from /api/extract result)
    selected_sample_indexes: number[]      // indexes into proposal.samples that get written to disk
  }
  409 on slug conflict (same as POST /api/packs)
```

Both routes live in `packages/api/myvoice/api/extract.py`. Mount via `create_app`.

## 1.5 `POST /api/packs/from-analysis` mechanics

1. Validate request (Pydantic 422). Validate slug regex. Verify selected_sample_indexes are in range.
2. Reuse `resolve_write_root()` (from Phase 5). 409 if `<root>/<slug>/` exists.
3. `shutil.copytree(_locate_template(), target)`.
4. Patch manifest:
   - `pack.{slug,name,author,version}` and optional `description`
   - `persona.{identity, one_line}` from request
   - `banished.words` ← `[w.word for w in proposal.banished_words]` (deduped, lower-case)
   - `banished.phrases` ← `[p.phrase for p in proposal.banished_phrases]`
   - `banished.permitted_exceptions` ← list of `{term, reason}`
   - `pop_culture.allowed` / `banned`
   - `samples[]` ← entries for the selected samples: `[{id: "01", file: "samples/01-<auto>.md"}, ...]`
   - leave `rules.*` at template defaults; leave `formats[]` empty; leave `bios[]` from template.
5. Append `proposal.style_guide_markdown` to `_template/style-guide.md`'s prose. The composed file:
   ```
   <template prose, unchanged>

   ---

   <proposal.style_guide_markdown>
   ```
6. Write selected samples as `samples/<id>-<auto>.md` — body is the excerpt wrapped in a blockquote (same format as Phase 4's Save-as-sample).
7. Atomic manifest write via `PackStore.save_manifest`.
8. `validate_pack(target)` — on failure (unlikely), rollback (rmtree) and 500 `manifest_invalid`.
9. Emit `pack:created` on `/api/events`.
10. Return 201 PackSummary.

## 1.6 Cancellation

Job's `asyncio.Event` is checked between stages (FETCH/CLEAN/ANALYZE/PROPOSE boundaries) AND inside `fetch_all`'s per-URL gather (using `asyncio.wait` with `return_when=FIRST_COMPLETED` + cancel-others pattern). Mid-LLM-call cancel is NOT implemented — the `provider.complete()` call is awaited and only cancelled after it returns. The wizard's "Cancel" button surfaces this caveat: "Cancelling… waiting for current stage." On detection: stop processing, mark cancelled, emit error event with `code: "cancelled"`.

## 1.7 Error envelope

Phase 4 codes still apply (`provider_missing_key`, `provider_rate_limit`, `provider_error`). New codes:
- `extractor_no_sources` — 400 — all inputs failed to fetch/clean
- `analyze_invalid_json` — 502 — LLM returned malformed JSON twice
- `file_too_large` — 413
- `too_many_files` — 413
- `unsupported_file_type` — 400
- `extract_invalid_request` — 400 (zero inputs, etc.)
- `slug_conflict` (existing) on `from-analysis`

---

# Part 2: Frontend

## 2.1 Route + state

Add `/extract` route to `App.tsx`. AppShell sidebar gains "Extract from URLs" nav link between "Compose & test" and "Settings".

`routes/ExtractPage.tsx` owns:
```typescript
type Step = 1 | 2 | 3;
interface ExtractState {
  step: Step;
  inputs: Step1Inputs;     // URLs, files, pack_meta, provider, model
  jobId: string | null;
  proposal: PackProposal | null;     // raw from server
  editedProposal: AnalysisResult | null;  // mutable copy for Step 3
  selectedSampleIndexes: Set<number>;
  error: { message: string; hint?: string } | null;
}
```

State machine:
```
Idle (step=1)
  ──Analyze──▶ Running (step=2, jobId set)
                 │ ──complete(result)──▶ Reviewing (step=3, proposal+editedProposal+selectedSampleIndexes=all)
                 │                          ├──Save Pack──▶ navigate /packs/<slug>
                 │                          └──Back──▶ Idle (jobId cleared, proposal cleared, inputs preserved)
                 │ ──error(code,message)──▶ Idle (step=1, error banner)
                 └──Cancel button──▶ Idle (step=1, toast "Cancelled")
```

## 2.2 Step 1 — Inputs

`components/extract/Step1Inputs.tsx`:

**URLs section.** Growing list. Each row: text input + ✕ button. "+ Add URL" at the bottom. Validate: starts with `http://` or `https://`. Client-side dedup before submit.

**Files section.** Drag-and-drop dropzone + file picker (`<input type="file" multiple accept=".md,.txt,.docx">`). Accepted files appear as chips. Reject + inline error for: wrong extension, >5 MB per file, >10 files total. Read each file via `FileReader.readAsArrayBuffer` → base64 (via `btoa(String.fromCharCode(...new Uint8Array(buf)))`) for the request body.

**Pack details.** Three text inputs: slug (regex `^[a-z][a-z0-9-_]*$` — same as Phase 5), name, author. Slug pre-fills from `name → kebab-case`; user can override. Same live validation pattern as `NewPackDialog`.

**Provider/model.** Same selectors as Compose page (Phase 4). Only providers with non-empty API keys are enabled; greyed entries show "(no API key)" + link to Settings.

**Cost estimate.** Below the form, live-updates as inputs change:
```
Estimated: ~12,800 input tokens (4 URLs · 0 files) → ~$0.038 with claude-sonnet-4-6
```
Heuristic: `chars / 4` for input tokens, `600` for output. Calls `cost_calculator.usd(provider, model, est_in, est_out)` server-side via a thin `/api/cost-estimate` route OR client-side from a small `rates.ts` mirror. **Decision:** ship a tiny client-side rates table in `packages/web/src/api/rates.ts` (mirror of `llm/rates.yaml`'s key fields) — avoids a network call per keystroke. Drift risk is acceptable because every label says "approximate".

**Analyze button.** Disabled until: (a) at least one URL or file, (b) slug valid, (c) name non-empty, (d) author non-empty, (e) provider + model selected. Clicking POSTs `/api/extract`, transitions to Step 2 with `jobId` set.

## 2.3 Step 2 — Analyzing

`components/extract/Step2Progress.tsx`:

Vertical stepper with four rows:
```
✓ Fetching     4 URLs in 1.2s
✓ Cleaning     5 docs, 8,400 words
●  Analyzing    Sending 8,400 words to Claude…
○ Proposing
```

Each `stage` event from the job-events SSE updates the corresponding row. Currently-running row shows a spinner + the event's `message`. Failed stage shows a red ✗ + the error message.

Always-visible **Cancel** button: calls `DELETE /api/jobs/{job_id}`, transitions back to Step 1 with toast "Cancelled."

On `complete`: parse `result` as `PackProposal`, transition to Step 3.
On `error`: surface envelope's `message + hint` with a "Back" button (returns to Step 1, preserving inputs).

Uses a thin `useExtractJob(jobId, handlers)` hook wrapping the same EventSource pattern from `useJobEventStream`.

## 2.4 Step 3 — Review

`components/extract/Step3Review.tsx`:

**Header.** Source summary + receipt:
```
4 URLs · 1 file · 12,400 words · claude-sonnet-4-6 · 8.4s · ~$0.041
```

**Sections** (each is a small component in `components/extract/review/`):

1. **PersonaReview** — two text inputs (identity, one-line) pre-filled from `proposal.analysis.persona_identity` + `persona_one_line`. (Same UX as Phase 5 `PersonaSection`.)
2. **BanishedWordsReview** — `TagInput` (Phase 5 reuse), each chip shows `word (Nx)` where N is the LLM's frequency count.
3. **BanishedPhrasesReview** — same.
4. **ExceptionsReview** — `ExceptionsTable` (Phase 5 reuse), pre-filled.
5. **StyleGuideReview** — Tiptap markdown editor (Phase 3 reuse, the one in `components/MarkdownEditor.tsx`). Editable. Final value will be appended to the template's `style-guide.md`.
6. **SamplesReview** — Card per `ProposedSample`. Each card:
   - Checkbox (default checked) — toggles inclusion in `selectedSampleIndexes`
   - Excerpt preview (collapsed to first 200 chars + "Show more")
   - Source link (opens in new tab if URL)
   - "why" text (LLM's reasoning)
   - When expanded: a small markdown editor for the excerpt
7. **PopCultureReview** — two `TagInput`s (allowed + banned).
8. **BiosReview** — read-only note: "Bios are kept from the `_template` placeholders. Edit them on the Bios tab after saving."

**Footer.** Two buttons:
- **Cancel** (left, secondary) — transitions to Step 1, clears proposal.
- **Save Pack** (right, primary, emerald) — POSTs `/api/packs/from-analysis`.

**Save flow.** On 201: navigate `/packs/<slug>/manifest`, toast "Created pack {name} from {N} sources." On 409: inline banner "Slug taken — change in Step 1 and re-analyze." On 422: map server's field errors to inline highlights (same pattern as Phase 5 `ManifestForm`).

## 2.5 API clients

`packages/web/src/api/extract.ts`:
```typescript
export interface ProposedSample { excerpt: string; source_location: string; why: string; rank: number; }
export interface BanishedWord { word: string; frequency: number; }
export interface AnalysisResult { ... }  // mirrors backend Pydantic exactly
export interface Source { kind: "url" | "file"; location: string; bytes: number; word_count: number; succeeded: boolean; error: string | null; }
export interface PackProposal { analysis: AnalysisResult; sources: Source[]; model: string; provider: string; cost_usd: number; input_tokens: number; output_tokens: number; elapsed_seconds: number; }

export interface ExtractRequest {
  urls: string[];
  files: { name: string; content_b64: string; mime: string }[];
  pack_meta: { slug?: string; name?: string; author?: string };
  provider: "anthropic" | "openai" | "google";
  model: string;
}

export async function startExtract(req: ExtractRequest): Promise<{ job_id: string }>;
export async function saveFromAnalysis(req: {
  slug: string; name: string; author: string;
  persona_identity: string; persona_one_line: string;
  version?: string; description?: string;
  proposal: AnalysisResult;
  selected_sample_indexes: number[];
}): Promise<PackSummary>;
```

`packages/web/src/api/rates.ts`:
```typescript
export interface ModelRate { input_per_million_usd: number; output_per_million_usd: number; }
export const RATES: Record<string, Record<string, ModelRate>> = { ... };  // mirrors llm/rates.yaml
export function estimateCost(provider: string, model: string, inputTokens: number, outputTokens: number): number;
```

`packages/web/src/hooks/useExtractJob.ts`:
```typescript
export interface ExtractJobHandlers {
  onStage: (stage: string, message: string, progress: number) => void;
  onComplete: (proposal: PackProposal) => void;
  onError: (code: string, message: string, hint?: string) => void;
}
export function useExtractJob(jobId: string | null, handlers: ExtractJobHandlers): void;
```

---

# Part 3: Testing

## 3.1 Backend (pytest)

- `tests/llm/test_anthropic_structured.py` — json_schema → tool-use path; invalid-JSON retry succeeds on 2nd attempt; second failure raises `ProviderError("analyze_invalid_json")`.
- `tests/llm/test_openai_structured.py` — `response_format: json_schema, strict: true` shape; retry-on-invalid-json.
- `tests/llm/test_google_structured.py` — `to_google_schema()` transformations; `response_schema` shape; retry-on-invalid-json.
- `tests/extractor/test_fetch.py` — respx-mocked: success / retry-then-succeed / all-fail-raises / concurrency cap respected.
- `tests/extractor/test_clean.py` — fixture HTML (WordPress + Substack + Ghost snippets), fixture `.md`, fixture `.docx` → expected cleaned text.
- `tests/extractor/test_analyze.py` — mock provider returning canned JSON; AnalysisResult parses; corpus separator format verified.
- `tests/extractor/test_propose.py` — pure function tests for the mapping.
- `tests/extractor/test_pipeline.py` — end-to-end with mock provider + fixture HTML: 3 URLs → fetched → cleaned → analyzed → PackProposal.
- `tests/api/test_extract_route.py` — POST returns 202 + job_id; SSE drain yields `fetching → cleaning → analyzing → proposing → complete`; complete payload is PackProposal.
- `tests/api/test_packs_from_analysis_route.py` — happy path writes pack with samples + appended style guide; slug conflict 409; bad request (zero inputs) 400.

## 3.2 Frontend (Vitest)

- `components/extract/Step1Inputs.test.tsx` — URL add/remove/dedup, file dropzone size + type rejection, cost-estimate updates on input change, Analyze button gating.
- `components/extract/Step2Progress.test.tsx` — stepper updates on stage events; cancel calls DELETE /api/jobs/<id> and transitions back.
- `components/extract/Step3Review.test.tsx` — all sections render from a sample PackProposal; checkbox toggles update `selectedSampleIndexes`; Save calls API with edited proposal.
- `api/rates.test.ts` — estimateCost values for sample inputs.

## 3.3 E2E (Playwright)

`e2e/extract-flow.spec.ts`:
- Set Anthropic key in Settings (reuses mock provider as in compose-rewrite.spec).
- Navigate to /extract.
- Add URL `https://example.com/post`. Type slug `e2e-extracted-{stamp}`, name, author.
- Pick Anthropic + a mock model.
- Click Analyze.
- Wait for Step 3.
- Toggle one sample checkbox off.
- Click Save Pack.
- Verify pack appears in sidebar and at `/packs/{slug}/manifest`.

Requires extending `MockProvider` (Phase 4) with a JSON-output mode: when `MYVOICE_MOCK_OUTPUT_JSON` env var is set, `complete()` returns that fixture JSON as `text`. Trivial extension.

Mock HTTP for URL fetching: the Playwright config's backend env can include `MYVOICE_EXTRACT_FAKE_FETCH=1` which causes `fetch_all` to short-circuit and return canned `FetchedDoc`s with deterministic content. (Avoids actually hitting `example.com` in CI/local.)

---

# Part 4: Done-state

- [ ] `make test` green (backend + frontend + Playwright)
- [ ] mypy strict + ruff + biome + tsc all clean
- [ ] All 3 providers' structured-output paths pass mocked tests
- [ ] On a fresh install with a real Claude key: paste a real blog URL, Analyze (real HTTP fetch), edit two banished words in Review, Save Pack — pack appears in sidebar with valid manifest + ≥1 sample on disk.
- [ ] Cancel mid-fetch halts within ~1 stage boundary and returns to Step 1.
- [ ] README updated with "Extract a pack from URLs" section + screenshot placeholder.

---

# Part 5: PR sequence

```
PR1   feat(api): wire json_schema in all 3 LLM providers (structured output + retry)
PR2   feat(api): extractor FETCH stage (httpx parallel + retries + UA)
PR3   feat(api): extractor CLEAN stage (trafilatura + utf8 + python-docx)
PR4   feat(api): extractor ANALYZE stage + analyze.j2 + schemas/analysis.json
PR5   feat(api): POST /api/extract (async job) + POST /api/packs/from-analysis
PR6   feat(web): /extract route + Step 1 inputs (URLs + dropzone + meta + cost estimate)
PR7   feat(web): Step 2 progress UI (job SSE, stage stepper, cancel)
PR8   feat(web): Step 3 review (reuse Tiptap + TagInput + ExceptionsTable + sample cards)
PR9   test(e2e): extract-flow Playwright spec + README "Extract a pack" section + PR
```

Target: <500 LOC diff per PR. Each is reviewable in one sitting.

---

# Part 6: Out of scope (explicitly deferred)

- Augmenting an existing pack with new extracts (always create-new in Phase 6).
- Per-aspect re-run from Step 3 (re-analyze the whole corpus only).
- AI-assisted bio extraction (per parent design — bios remain template placeholders).
- Format add-ons auto-suggestion (out of v1).
- Persisting in-progress proposals to disk (close browser = lost).
- Multipart file upload (base64-in-JSON keeps API uniform).
- Mid-LLM-call cancellation (between-stage only).
- "Pause and resume" inside the wizard (Back from Step 3 clears the proposal).
