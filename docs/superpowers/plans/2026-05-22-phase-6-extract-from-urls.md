# Phase 6 — Extract from URLs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI-assisted pack creation — analyze blog URLs + uploaded drafts, present an editable proposal, save as a new pack.

**Architecture:** Reuse Phase 4 JobRegistry + SSE. New 4-stage extractor pipeline (fetch/clean/analyze/propose) producing a `PackProposal`. New `POST /api/extract` (async) and `POST /api/packs/from-analysis` (create from approved proposal). 3-step wizard at `/extract` reusing Phase 3 Tiptap + Phase 5 TagInput/ExceptionsTable.

**Tech Stack:**
- Backend: FastAPI, httpx, trafilatura (HTML), python-docx (.docx), jsonschema (LLM-output validation), Jinja2 (prompt template), Pydantic v2
- Frontend: React 18, Vite, EventSource (existing pattern), Tiptap (existing), TagInput/ExceptionsTable (existing from Phase 5)
- LLM: structured output via tool-use (Anthropic), `response_format: json_schema` (OpenAI), `response_schema` (Google)

**Spec:** [`docs/superpowers/specs/2026-05-22-phase-6-extract-from-urls-design.md`](../specs/2026-05-22-phase-6-extract-from-urls-design.md)

**Branch:** All work on `phase-6-extract-from-urls` (already checked out). 9 commits, one per task. Open one PR at the end.

---

## File Structure

### New backend files
```
packages/api/myvoice/extractor/
  __init__.py
  models.py           # Pydantic shapes
  exceptions.py       # ExtractorError
  fetch.py            # async fetch_all
  clean.py            # clean_fetched, clean_upload
  analyze.py          # async analyze
  propose.py          # propose (pure)
  pipeline.py         # run_extract_job orchestrator
  prompts/
    analyze.j2
  schemas/
    analysis.json     # JSON Schema generated from AnalysisResult.model_json_schema()

packages/api/myvoice/api/
  extract.py          # POST /api/extract + POST /api/packs/from-analysis
```

### New backend test files
```
packages/api/tests/
  llm/
    test_anthropic_structured.py
    test_openai_structured.py
    test_google_structured.py
  extractor/
    __init__.py
    test_fetch.py
    test_clean.py
    test_analyze.py
    test_propose.py
    test_pipeline.py
    fixtures/
      sample.html         # representative blog post HTML
      sample.docx
      sample.md
  api/
    test_extract_route.py
    test_packs_from_analysis_route.py
```

### Modified backend files
```
packages/api/myvoice/
  llm/anthropic.py                  # tool-use json_schema path + invalid-JSON retry
  llm/openai.py                     # finalize json_schema path + retry
  llm/google.py                     # to_google_schema helper + retry
  llm/exceptions.py                 # (no change expected; reuse ProviderError code)
  server.py                         # mount extract router
  test_helpers/mock_provider.py     # add JSON-output mode via MYVOICE_MOCK_OUTPUT_JSON
pyproject.toml                      # add trafilatura, python-docx, jinja2, jsonschema
```

### New frontend files
```
packages/web/src/
  routes/ExtractPage.tsx
  api/
    extract.ts            # startExtract, saveFromAnalysis + typed AnalysisResult/PackProposal
    rates.ts              # mirror of llm/rates.yaml for client-side estimate
  hooks/
    useExtractJob.ts      # job-events subscription specialized for extract
  components/extract/
    Step1Inputs.tsx
    Step2Progress.tsx
    Step3Review.tsx
    UrlList.tsx
    FileDropzone.tsx
    CostEstimate.tsx
    review/
      PersonaReview.tsx
      BanishedReview.tsx          # words + phrases combined since UI is similar
      ExceptionsReview.tsx
      StyleGuideReview.tsx
      SampleCard.tsx
      PopCultureReview.tsx
```

### New frontend test files
```
packages/web/tests/
  components/extract/
    Step1Inputs.test.tsx
    Step2Progress.test.tsx
    Step3Review.test.tsx
  api/
    rates.test.ts
  hooks/
    useExtractJob.test.ts
```

### Modified frontend files
```
packages/web/src/
  App.tsx                       # add /extract route
  components/AppShell.tsx       # add "Extract from URLs" sidebar nav link
```

### New e2e
```
e2e/extract-flow.spec.ts
```

### Modified docs
```
README.md                       # add "Extract a pack from URLs" section
```

---

## Task 1 — LLM structured output in all 3 providers

**Files:**
- Modify: `packages/api/myvoice/llm/anthropic.py` (tool-use path + retry)
- Modify: `packages/api/myvoice/llm/openai.py` (finalize + retry)
- Modify: `packages/api/myvoice/llm/google.py` (`to_google_schema` + retry)
- Modify: `pyproject.toml` (add `jsonschema>=4`)
- Create: `packages/api/tests/llm/test_anthropic_structured.py`
- Create: `packages/api/tests/llm/test_openai_structured.py`
- Create: `packages/api/tests/llm/test_google_structured.py`

- [ ] **Step 1.1: Add jsonschema dep**

Edit `pyproject.toml` `dependencies` to add (at the end):
```
    "jsonschema>=4",
```

Run: `uv sync`

- [ ] **Step 1.2: Write failing Anthropic structured-output tests**

`packages/api/tests/llm/test_anthropic_structured.py`:
```python
"""Anthropic adapter — json_schema (tool-use) path."""
from __future__ import annotations

import httpx
import pytest
import respx

from myvoice.llm.anthropic import AnthropicProvider
from myvoice.llm.exceptions import ProviderError

_SIMPLE_SCHEMA = {
    "type": "object",
    "properties": {"value": {"type": "string"}},
    "required": ["value"],
    "additionalProperties": False,
}


@pytest.mark.asyncio
@respx.mock
async def test_complete_with_schema_uses_tool_use() -> None:
    provider = AnthropicProvider(api_key="sk-test")
    route = respx.post("https://api.anthropic.com/v1/messages").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "msg_1",
                "type": "message",
                "role": "assistant",
                "model": "claude-sonnet-4-6",
                "content": [
                    {
                        "type": "tool_use",
                        "id": "tu_1",
                        "name": "record_analysis",
                        "input": {"value": "hello"},
                    }
                ],
                "stop_reason": "tool_use",
                "usage": {"input_tokens": 5, "output_tokens": 3},
            },
        )
    )
    resp = await provider.complete(
        model="claude-sonnet-4-6", prompt="give me a value", json_schema=_SIMPLE_SCHEMA
    )
    assert resp.text == '{"value":"hello"}' or resp.text == '{"value": "hello"}'
    # Request body should include tools + tool_choice
    sent = route.calls.last.request.content
    import json as _json
    body = _json.loads(sent.decode())
    assert "tools" in body
    assert body["tools"][0]["name"] == "record_analysis"
    assert body["tools"][0]["input_schema"] == _SIMPLE_SCHEMA
    assert body["tool_choice"] == {"type": "tool", "name": "record_analysis"}


@pytest.mark.asyncio
@respx.mock
async def test_complete_with_schema_retries_on_invalid_json() -> None:
    """If LLM emits text instead of tool_use, retry once with a corrective hint."""
    provider = AnthropicProvider(api_key="sk-test")
    bad_then_good = [
        httpx.Response(
            200,
            json={
                "id": "msg_1", "type": "message", "role": "assistant",
                "model": "claude-sonnet-4-6",
                "content": [{"type": "text", "text": "I cannot use the tool"}],
                "stop_reason": "end_turn",
                "usage": {"input_tokens": 5, "output_tokens": 5},
            },
        ),
        httpx.Response(
            200,
            json={
                "id": "msg_2", "type": "message", "role": "assistant",
                "model": "claude-sonnet-4-6",
                "content": [{
                    "type": "tool_use", "id": "tu_1", "name": "record_analysis",
                    "input": {"value": "fixed"},
                }],
                "stop_reason": "tool_use",
                "usage": {"input_tokens": 10, "output_tokens": 4},
            },
        ),
    ]
    respx.post("https://api.anthropic.com/v1/messages").mock(side_effect=bad_then_good)
    resp = await provider.complete(
        model="claude-sonnet-4-6", prompt="give me a value", json_schema=_SIMPLE_SCHEMA
    )
    assert '"value"' in resp.text
    assert '"fixed"' in resp.text


@pytest.mark.asyncio
@respx.mock
async def test_complete_with_schema_fails_after_two_invalid_attempts() -> None:
    provider = AnthropicProvider(api_key="sk-test")
    text_resp = httpx.Response(
        200,
        json={
            "id": "msg", "type": "message", "role": "assistant",
            "model": "claude-sonnet-4-6",
            "content": [{"type": "text", "text": "no tool"}],
            "stop_reason": "end_turn",
            "usage": {"input_tokens": 5, "output_tokens": 2},
        },
    )
    respx.post("https://api.anthropic.com/v1/messages").mock(side_effect=[text_resp, text_resp])
    with pytest.raises(ProviderError) as exc:
        await provider.complete(
            model="claude-sonnet-4-6", prompt="give me", json_schema=_SIMPLE_SCHEMA
        )
    assert exc.value.code == "analyze_invalid_json"
```

Run: `uv run pytest packages/api/tests/llm/test_anthropic_structured.py -v`
Expected: FAIL — current adapter ignores `json_schema`.

- [ ] **Step 1.3: Implement Anthropic tool-use path + retry**

Replace `complete` in `packages/api/myvoice/llm/anthropic.py` (the existing method body, lines 50-72 approximately). Keep the same signature. New body:

```python
    async def complete(
        self, *, model: str, prompt: str, json_schema: dict[str, object] | None = None
    ) -> LLMResponse:
        return await self._complete_with_retry(model=model, prompt=prompt, json_schema=json_schema)

    async def _complete_with_retry(
        self,
        *,
        model: str,
        prompt: str,
        json_schema: dict[str, object] | None,
        attempt: int = 0,
    ) -> LLMResponse:
        body: dict[str, object] = {
            "model": model,
            "max_tokens": 4096,
            "messages": [{"role": "user", "content": prompt}],
        }
        if json_schema is not None:
            body["tools"] = [
                {"name": "record_analysis", "input_schema": json_schema}
            ]
            body["tool_choice"] = {"type": "tool", "name": "record_analysis"}
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.post(f"{_BASE_URL}/messages", headers=self._headers, json=body)
        self._raise_for_status(r)
        data = r.json()
        usage = data.get("usage", {})
        in_tok = int(usage.get("input_tokens", 0))
        out_tok = int(usage.get("output_tokens", 0))
        finish = _map_stop_reason(data.get("stop_reason"))

        if json_schema is None:
            text = "".join(
                b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"
            )
            return LLMResponse(
                text=text, input_tokens=in_tok, output_tokens=out_tok,
                model=data.get("model", model), finish_reason=finish,
            )

        # Structured-output path: extract tool_use input
        tool_block = next(
            (b for b in data.get("content", []) if b.get("type") == "tool_use"),
            None,
        )
        if tool_block is None:
            if attempt == 0:
                # One retry with corrective hint appended.
                hint = (
                    "\n\nYour previous response did not call the `record_analysis` tool. "
                    "You MUST call the tool with valid arguments matching the schema."
                )
                return await self._complete_with_retry(
                    model=model, prompt=prompt + hint, json_schema=json_schema, attempt=1,
                )
            raise ProviderError(
                "Anthropic did not emit tool_use after retry.",
            )._with_code("analyze_invalid_json")
        return LLMResponse(
            text=json.dumps(tool_block.get("input", {})),
            input_tokens=in_tok, output_tokens=out_tok,
            model=data.get("model", model), finish_reason=finish,
        )
```

Also add a small helper to `packages/api/myvoice/llm/exceptions.py` to attach a code post-hoc (since `ProviderError`'s constructor sets the default `code = "provider_error"`). Add inside the `ProviderError` class:

```python
    def _with_code(self, code: str) -> "ProviderError":
        self.code = code
        return self
```

Run: `uv run pytest packages/api/tests/llm/test_anthropic_structured.py -v`
Expected: PASS (3 tests).

- [ ] **Step 1.4: Failing OpenAI structured-output tests**

`packages/api/tests/llm/test_openai_structured.py`:
```python
"""OpenAI adapter — json_schema (response_format) path."""
from __future__ import annotations

import json as _json

import httpx
import pytest
import respx

from myvoice.llm.exceptions import ProviderError
from myvoice.llm.openai import OpenAIProvider

_SIMPLE_SCHEMA = {
    "type": "object",
    "properties": {"value": {"type": "string"}},
    "required": ["value"],
    "additionalProperties": False,
}


@pytest.mark.asyncio
@respx.mock
async def test_complete_with_schema_sends_response_format() -> None:
    provider = OpenAIProvider(api_key="sk-test")
    route = respx.post("https://api.openai.com/v1/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "c1",
                "model": "gpt-5",
                "choices": [{
                    "message": {"content": '{"value": "ok"}'},
                    "finish_reason": "stop",
                }],
                "usage": {"prompt_tokens": 5, "completion_tokens": 3},
            },
        )
    )
    resp = await provider.complete(
        model="gpt-5", prompt="give me a value", json_schema=_SIMPLE_SCHEMA
    )
    assert _json.loads(resp.text) == {"value": "ok"}
    body = _json.loads(route.calls.last.request.content.decode())
    assert body["response_format"]["type"] == "json_schema"
    assert body["response_format"]["json_schema"]["strict"] is True
    assert body["response_format"]["json_schema"]["schema"] == _SIMPLE_SCHEMA


@pytest.mark.asyncio
@respx.mock
async def test_complete_with_schema_retries_on_invalid_json() -> None:
    provider = OpenAIProvider(api_key="sk-test")
    bad = httpx.Response(
        200,
        json={
            "id": "c1", "model": "gpt-5",
            "choices": [{"message": {"content": "not json"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 5, "completion_tokens": 2},
        },
    )
    good = httpx.Response(
        200,
        json={
            "id": "c2", "model": "gpt-5",
            "choices": [{
                "message": {"content": '{"value": "fixed"}'},
                "finish_reason": "stop",
            }],
            "usage": {"prompt_tokens": 8, "completion_tokens": 4},
        },
    )
    respx.post("https://api.openai.com/v1/chat/completions").mock(side_effect=[bad, good])
    resp = await provider.complete(
        model="gpt-5", prompt="x", json_schema=_SIMPLE_SCHEMA
    )
    assert _json.loads(resp.text) == {"value": "fixed"}


@pytest.mark.asyncio
@respx.mock
async def test_complete_with_schema_fails_after_two_invalid() -> None:
    provider = OpenAIProvider(api_key="sk-test")
    bad = httpx.Response(
        200,
        json={
            "id": "c1", "model": "gpt-5",
            "choices": [{"message": {"content": "still not json"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 5, "completion_tokens": 2},
        },
    )
    respx.post("https://api.openai.com/v1/chat/completions").mock(side_effect=[bad, bad])
    with pytest.raises(ProviderError) as exc:
        await provider.complete(model="gpt-5", prompt="x", json_schema=_SIMPLE_SCHEMA)
    assert exc.value.code == "analyze_invalid_json"
```

Run: `uv run pytest packages/api/tests/llm/test_openai_structured.py -v`
Expected: FAIL.

- [ ] **Step 1.5: Implement OpenAI retry**

Replace the `complete` method in `packages/api/myvoice/llm/openai.py`. Keep the existing `_BASE_URL` etc. New body:

```python
    async def complete(
        self, *, model: str, prompt: str, json_schema: dict[str, object] | None = None
    ) -> LLMResponse:
        return await self._complete_with_retry(model=model, prompt=prompt, json_schema=json_schema)

    async def _complete_with_retry(
        self,
        *,
        model: str,
        prompt: str,
        json_schema: dict[str, object] | None,
        attempt: int = 0,
    ) -> LLMResponse:
        body: dict[str, object] = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
        }
        if json_schema is not None:
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "result", "schema": json_schema, "strict": True},
            }
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.post(
                f"{_BASE_URL}/chat/completions", headers=self._headers, json=body
            )
        self._raise_for_status(r)
        data = r.json()
        choice = data["choices"][0]
        text = choice["message"]["content"] or ""
        in_tok = int(data.get("usage", {}).get("prompt_tokens", 0))
        out_tok = int(data.get("usage", {}).get("completion_tokens", 0))
        finish = _map_finish(choice.get("finish_reason"))

        if json_schema is not None:
            try:
                json.loads(text)
            except json.JSONDecodeError:
                if attempt == 0:
                    hint = (
                        "\n\nYour previous response was not valid JSON. "
                        "Re-emit ONLY a JSON object matching the schema."
                    )
                    return await self._complete_with_retry(
                        model=model, prompt=prompt + hint,
                        json_schema=json_schema, attempt=1,
                    )
                raise ProviderError("OpenAI returned invalid JSON after retry.")._with_code(
                    "analyze_invalid_json"
                )
        return LLMResponse(
            text=text, input_tokens=in_tok, output_tokens=out_tok,
            model=data.get("model", model), finish_reason=finish,
        )
```

Add the missing `import json` at the top of the file if not already present.

Run: `uv run pytest packages/api/tests/llm/test_openai_structured.py -v`

- [ ] **Step 1.6: Failing Google structured-output tests + to_google_schema**

`packages/api/tests/llm/test_google_structured.py`:
```python
"""Google adapter — response_schema path + dialect adapter."""
from __future__ import annotations

import json as _json

import httpx
import pytest
import respx

from myvoice.llm.exceptions import ProviderError
from myvoice.llm.google import GoogleProvider, to_google_schema

_SIMPLE_SCHEMA = {
    "type": "object",
    "properties": {"value": {"type": "string"}},
    "required": ["value"],
    "additionalProperties": False,
}


def test_to_google_schema_drops_metadata() -> None:
    src = {"$schema": "http://json-schema.org/draft-07/schema#", "type": "object"}
    out = to_google_schema(src)
    assert "$schema" not in out
    assert out["type"] == "object"


def test_to_google_schema_converts_nullable() -> None:
    src = {"type": ["string", "null"]}
    out = to_google_schema(src)
    assert out["type"] == "string"
    assert out["nullable"] is True


def test_to_google_schema_drops_additional_properties() -> None:
    """Google's schema dialect doesn't support additionalProperties."""
    src = {"type": "object", "properties": {"a": {"type": "string"}}, "additionalProperties": False}
    out = to_google_schema(src)
    assert "additionalProperties" not in out
    assert out["properties"]["a"]["type"] == "string"


@pytest.mark.asyncio
@respx.mock
async def test_complete_with_schema_sends_response_schema() -> None:
    provider = GoogleProvider(api_key="g-test")
    route = respx.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent"
    ).mock(return_value=httpx.Response(
        200,
        json={
            "candidates": [{
                "content": {"parts": [{"text": '{"value": "ok"}'}]},
                "finishReason": "STOP",
            }],
            "usageMetadata": {"promptTokenCount": 4, "candidatesTokenCount": 3},
        },
    ))
    resp = await provider.complete(
        model="gemini-2.5-pro", prompt="give me", json_schema=_SIMPLE_SCHEMA
    )
    assert _json.loads(resp.text) == {"value": "ok"}
    body = _json.loads(route.calls.last.request.content.decode())
    assert body["generationConfig"]["response_mime_type"] == "application/json"
    # additionalProperties should have been stripped by to_google_schema
    assert "additionalProperties" not in body["generationConfig"]["response_schema"]


@pytest.mark.asyncio
@respx.mock
async def test_complete_with_schema_fails_after_two_invalid() -> None:
    provider = GoogleProvider(api_key="g-test")
    bad = httpx.Response(
        200,
        json={
            "candidates": [{
                "content": {"parts": [{"text": "not json"}]},
                "finishReason": "STOP",
            }],
            "usageMetadata": {"promptTokenCount": 3, "candidatesTokenCount": 2},
        },
    )
    respx.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent"
    ).mock(side_effect=[bad, bad])
    with pytest.raises(ProviderError) as exc:
        await provider.complete(
            model="gemini-2.5-pro", prompt="x", json_schema=_SIMPLE_SCHEMA
        )
    assert exc.value.code == "analyze_invalid_json"
```

Run: `uv run pytest packages/api/tests/llm/test_google_structured.py -v`
Expected: FAIL — `to_google_schema` doesn't exist and retry path missing.

- [ ] **Step 1.7: Implement to_google_schema + retry**

Add to `packages/api/myvoice/llm/google.py` (above the class definition):

```python
def to_google_schema(schema: dict[str, object]) -> dict[str, object]:
    """Convert a JSON Schema dict to Google's response_schema dialect (subset).

    Drops $schema/$id/$ref + additionalProperties. Converts {type:["string","null"]}
    to {type:"string", nullable:True}.
    """
    if not isinstance(schema, dict):
        return schema
    out: dict[str, object] = {}
    for k, v in schema.items():
        if k in ("$schema", "$id", "$ref", "additionalProperties"):
            continue
        if k == "type" and isinstance(v, list):
            non_null = [t for t in v if t != "null"]
            if len(non_null) == 1 and "null" in v:
                out["type"] = non_null[0]
                out["nullable"] = True
                continue
            out[k] = v
            continue
        if isinstance(v, dict):
            out[k] = to_google_schema(v)
        elif isinstance(v, list):
            out[k] = [to_google_schema(x) if isinstance(x, dict) else x for x in v]
        else:
            out[k] = v
    return out
```

Replace the `complete` method with a retry-aware version (same pattern as OpenAI):

```python
    async def complete(
        self, *, model: str, prompt: str, json_schema: dict[str, object] | None = None
    ) -> LLMResponse:
        return await self._complete_with_retry(model=model, prompt=prompt, json_schema=json_schema)

    async def _complete_with_retry(
        self,
        *,
        model: str,
        prompt: str,
        json_schema: dict[str, object] | None,
        attempt: int = 0,
    ) -> LLMResponse:
        url = f"{_BASE}/models/{model}:generateContent"
        body: dict[str, object] = {"contents": [{"parts": [{"text": prompt}]}]}
        if json_schema is not None:
            body["generationConfig"] = {
                "response_mime_type": "application/json",
                "response_schema": to_google_schema(json_schema),
            }
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.post(url, params={"key": self._api_key}, json=body)
        self._raise_for_status(r)
        data = r.json()
        candidate = (data.get("candidates") or [{}])[0]
        parts = candidate.get("content", {}).get("parts", [])
        text = "".join(p.get("text", "") for p in parts)
        usage = data.get("usageMetadata", {})
        in_tok = int(usage.get("promptTokenCount", 0))
        out_tok = int(usage.get("candidatesTokenCount", 0))
        finish = _map_finish(candidate.get("finishReason"))

        if json_schema is not None:
            try:
                import json as _json
                _json.loads(text)
            except _json.JSONDecodeError:
                if attempt == 0:
                    hint = (
                        "\n\nYour previous response was not valid JSON. "
                        "Re-emit ONLY a JSON object matching the schema."
                    )
                    return await self._complete_with_retry(
                        model=model, prompt=prompt + hint,
                        json_schema=json_schema, attempt=1,
                    )
                raise ProviderError("Google returned invalid JSON after retry.")._with_code(
                    "analyze_invalid_json"
                )
        return LLMResponse(
            text=text, input_tokens=in_tok, output_tokens=out_tok,
            model=model, finish_reason=finish,
        )
```

Run: `uv run pytest packages/api/tests/llm/ -v` — all green (existing 23 + 8-ish new).

- [ ] **Step 1.8: Lint/mypy/commit**

```bash
uv run ruff check packages/api
uv run mypy packages/api
uv run pytest packages/api/tests/ -q
git add packages/api pyproject.toml uv.lock
git commit -m "$(cat <<'EOF'
feat(api): structured output in all 3 LLM providers + invalid-JSON retry

Anthropic uses tool-use with a "record_analysis" tool whose
input_schema is the passed json_schema; returns the tool input
JSON-encoded as LLMResponse.text. OpenAI uses
response_format: json_schema (strict). Google uses response_schema
with a small to_google_schema() adapter that drops unsupported keys
($schema, additionalProperties) and converts nullable type unions.
All three retry once on invalid output with a corrective hint
appended to the prompt; second failure raises
ProviderError("analyze_invalid_json"). ProviderError gains a
_with_code(code) helper for post-construction code attachment.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Extractor FETCH stage

**Files:**
- Create: `packages/api/myvoice/extractor/__init__.py` (empty)
- Create: `packages/api/myvoice/extractor/models.py`
- Create: `packages/api/myvoice/extractor/exceptions.py`
- Create: `packages/api/myvoice/extractor/fetch.py`
- Create: `packages/api/tests/extractor/__init__.py` (empty)
- Create: `packages/api/tests/extractor/test_fetch.py`

- [ ] **Step 2.1: Create exceptions + initial models**

`packages/api/myvoice/extractor/__init__.py`: empty.

`packages/api/myvoice/extractor/exceptions.py`:
```python
"""Typed errors for the extractor pipeline."""
from __future__ import annotations


class ExtractorError(Exception):
    """Pipeline failure with a stable code for the error envelope."""

    def __init__(self, code: str, message: str, *, hint: str | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.hint = hint
```

`packages/api/myvoice/extractor/models.py` (only the shapes needed in Task 2 — full shapes added in Task 4):
```python
"""Pydantic shapes for the extractor pipeline."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class Source(BaseModel):
    kind: Literal["url", "file"]
    location: str
    bytes: int = 0
    word_count: int = 0
    succeeded: bool = True
    error: str | None = None


class FetchedDoc(BaseModel):
    source: Source
    content_type: str = "text/html"
    raw_bytes: bytes = b""
```

- [ ] **Step 2.2: Failing fetch tests**

`packages/api/tests/extractor/__init__.py`: empty.

`packages/api/tests/extractor/test_fetch.py`:
```python
"""Extractor FETCH stage — respx-mocked HTTP."""
from __future__ import annotations

import asyncio

import httpx
import pytest
import respx

from myvoice.extractor.fetch import fetch_all


@pytest.mark.asyncio
@respx.mock
async def test_fetch_all_success() -> None:
    respx.get("https://example.com/a").mock(return_value=httpx.Response(200, text="<html>A</html>"))
    respx.get("https://example.com/b").mock(return_value=httpx.Response(200, text="<html>B</html>"))
    docs = await fetch_all(["https://example.com/a", "https://example.com/b"])
    assert len(docs) == 2
    assert all(d.source.succeeded for d in docs)
    assert docs[0].source.location == "https://example.com/a"
    assert docs[0].raw_bytes == b"<html>A</html>"


@pytest.mark.asyncio
@respx.mock
async def test_fetch_all_retries_then_succeeds() -> None:
    """3 retries: fail, fail, succeed."""
    responses = [
        httpx.ConnectError("boom"),
        httpx.ConnectError("boom"),
        httpx.Response(200, text="<html>OK</html>"),
    ]
    respx.get("https://flaky.example/").mock(side_effect=responses)
    docs = await fetch_all(["https://flaky.example/"])
    assert docs[0].source.succeeded
    assert docs[0].raw_bytes == b"<html>OK</html>"


@pytest.mark.asyncio
@respx.mock
async def test_fetch_all_soft_failure_after_retries() -> None:
    """All retries fail → Source.succeeded=False, error set; no exception."""
    respx.get("https://fail.example/").mock(side_effect=httpx.ConnectError("nope"))
    docs = await fetch_all(["https://fail.example/"])
    assert docs[0].source.succeeded is False
    assert docs[0].source.error is not None


@pytest.mark.asyncio
@respx.mock
async def test_fetch_all_sets_user_agent() -> None:
    route = respx.get("https://ua.example/").mock(return_value=httpx.Response(200, text="x"))
    await fetch_all(["https://ua.example/"])
    ua = route.calls.last.request.headers.get("user-agent")
    assert ua and ua.startswith("myvoice/")


@pytest.mark.asyncio
@respx.mock
async def test_fetch_all_concurrency_cap() -> None:
    """Verify max-concurrent: spawn 8 with cap 3; in-flight count never exceeds 3."""
    in_flight = 0
    peak = 0
    lock = asyncio.Lock()

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal in_flight, peak
        async with lock:
            in_flight += 1
            peak = max(peak, in_flight)
        await asyncio.sleep(0.05)
        async with lock:
            in_flight -= 1
        return httpx.Response(200, text="x")

    for i in range(8):
        respx.get(f"https://cc.example/{i}").mock(side_effect=handler)
    urls = [f"https://cc.example/{i}" for i in range(8)]
    await fetch_all(urls, concurrency=3)
    assert peak <= 3
```

Run: `uv run pytest packages/api/tests/extractor/test_fetch.py -v`
Expected: FAIL — module missing.

- [ ] **Step 2.3: Implement fetch.py**

`packages/api/myvoice/extractor/fetch.py`:
```python
"""FETCH stage: async parallel HTTP gather with retries."""
from __future__ import annotations

import asyncio

import httpx

from myvoice import __version__
from myvoice.extractor.models import FetchedDoc, Source

_USER_AGENT = f"myvoice/{__version__}"
_RETRY_BACKOFFS = (1.0, 2.0, 4.0)  # 3 retries with exponential backoff


async def fetch_all(urls: list[str], *, concurrency: int = 5) -> list[FetchedDoc]:
    """Fetch all URLs in parallel. Soft errors return docs with source.succeeded=False."""
    semaphore = asyncio.Semaphore(concurrency)
    async with httpx.AsyncClient(
        timeout=10.0,
        headers={"User-Agent": _USER_AGENT},
        follow_redirects=True,
    ) as client:
        return list(
            await asyncio.gather(*[_fetch_one(client, url, semaphore) for url in urls])
        )


async def _fetch_one(
    client: httpx.AsyncClient, url: str, semaphore: asyncio.Semaphore
) -> FetchedDoc:
    last_err: Exception | None = None
    async with semaphore:
        for backoff in _RETRY_BACKOFFS:
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                return FetchedDoc(
                    source=Source(
                        kind="url", location=url,
                        bytes=len(resp.content), succeeded=True,
                    ),
                    content_type=resp.headers.get("content-type", "text/html"),
                    raw_bytes=resp.content,
                )
            except (httpx.HTTPError, httpx.RequestError) as e:
                last_err = e
                await asyncio.sleep(backoff)
    return FetchedDoc(
        source=Source(
            kind="url", location=url,
            succeeded=False, error=f"{type(last_err).__name__}: {last_err}",
        ),
    )
```

Note: this sleeps the backoff AFTER each attempt including the last one (extra sleep), but tests don't care about timing. To be tighter: only sleep on attempts that retry — replace the loop with explicit attempt counts. Simpler version that's also fine:

```python
async def _fetch_one(...):
    last_err: Exception | None = None
    async with semaphore:
        for attempt in range(3):
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                return FetchedDoc(...)
            except (httpx.HTTPError, httpx.RequestError) as e:
                last_err = e
                if attempt < 2:
                    await asyncio.sleep(2 ** attempt)
    return FetchedDoc(source=Source(succeeded=False, error=...))
```

Use the second variant. Run: `uv run pytest packages/api/tests/extractor/test_fetch.py -v` — all 5 pass.

- [ ] **Step 2.4: Lint/commit**

```bash
uv run ruff check packages/api
uv run mypy packages/api
git add packages/api
git commit -m "$(cat <<'EOF'
feat(api): extractor FETCH stage — async parallel httpx with retries

fetch_all(urls, concurrency=5) gathers HTTP GETs under an
asyncio.Semaphore, 10s timeout, follows redirects, sets the
User-Agent: myvoice/<version>. Each URL gets 3 attempts with
1s/2s exponential backoff on connection errors. Soft failures
return a FetchedDoc with source.succeeded=False — the pipeline
keeps going. No exceptions on per-URL failure.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Extractor CLEAN stage

**Files:**
- Modify: `pyproject.toml` (add `trafilatura>=1.10`, `python-docx>=1.1`)
- Modify: `packages/api/myvoice/extractor/models.py` (add `CleanedDoc`, `UploadedFile`)
- Create: `packages/api/myvoice/extractor/clean.py`
- Create: `packages/api/tests/extractor/test_clean.py`
- Create: `packages/api/tests/extractor/fixtures/sample.html`
- Create: `packages/api/tests/extractor/fixtures/sample.md`
- Create: `packages/api/tests/extractor/fixtures/sample.docx` (generated in step 3.1)

- [ ] **Step 3.1: Add deps + generate docx fixture**

Edit `pyproject.toml` deps:
```
    "trafilatura>=1.10",
    "python-docx>=1.1",
    "jinja2>=3.1",
```

Run: `uv sync`

Create fixture files:

`packages/api/tests/extractor/fixtures/sample.md`:
```
# My Post

This is a markdown sample. It should pass through cleanly.

Second paragraph with **bold** and _italics_.
```

`packages/api/tests/extractor/fixtures/sample.html`:
```html
<!doctype html>
<html><head><title>Post</title></head>
<body>
<header>Site nav</header>
<article>
  <h1>Post Title</h1>
  <p>This is the article body. It should survive cleaning.</p>
  <p>Second paragraph in the article.</p>
</article>
<footer>© 2026</footer>
</body></html>
```

Generate `sample.docx` programmatically. Run this one-liner:
```bash
uv run python -c "
from docx import Document
d = Document()
d.add_heading('Sample DOCX', 0)
d.add_paragraph('First paragraph of the document.')
d.add_paragraph('Second paragraph.')
d.save('packages/api/tests/extractor/fixtures/sample.docx')
"
```

- [ ] **Step 3.2: Extend models + write failing clean tests**

Append to `packages/api/myvoice/extractor/models.py`:
```python
class UploadedFile(BaseModel):
    name: str
    content_type: str
    raw_bytes: bytes


class CleanedDoc(BaseModel):
    source: Source
    text: str
```

`packages/api/tests/extractor/test_clean.py`:
```python
"""Extractor CLEAN stage."""
from __future__ import annotations

from pathlib import Path

import pytest

from myvoice.extractor.clean import clean_fetched, clean_upload
from myvoice.extractor.models import FetchedDoc, Source, UploadedFile

_FIXTURES = Path(__file__).parent / "fixtures"


def test_clean_html_extracts_article_body() -> None:
    raw = (_FIXTURES / "sample.html").read_bytes()
    doc = FetchedDoc(
        source=Source(kind="url", location="https://e.com/", bytes=len(raw), succeeded=True),
        content_type="text/html",
        raw_bytes=raw,
    )
    cleaned = clean_fetched(doc)
    assert cleaned.source.succeeded
    assert "Post Title" in cleaned.text or "article body" in cleaned.text
    assert "Site nav" not in cleaned.text
    assert "© 2026" not in cleaned.text
    assert cleaned.source.word_count > 0


def test_clean_html_too_small_soft_fails() -> None:
    doc = FetchedDoc(
        source=Source(kind="url", location="https://e.com/", succeeded=True),
        content_type="text/html",
        raw_bytes=b"<html><body><p>hi</p></body></html>",
    )
    cleaned = clean_fetched(doc)
    assert cleaned.source.succeeded is False
    assert "too_short" in (cleaned.source.error or "")


def test_clean_upload_markdown() -> None:
    raw = (_FIXTURES / "sample.md").read_bytes()
    up = UploadedFile(name="sample.md", content_type="text/markdown", raw_bytes=raw)
    cleaned = clean_upload(up)
    assert cleaned.source.kind == "file"
    assert cleaned.source.location == "sample.md"
    assert "My Post" in cleaned.text


def test_clean_upload_docx() -> None:
    raw = (_FIXTURES / "sample.docx").read_bytes()
    up = UploadedFile(name="sample.docx", content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document", raw_bytes=raw)
    cleaned = clean_upload(up)
    assert cleaned.source.succeeded
    assert "First paragraph" in cleaned.text
    assert "Second paragraph" in cleaned.text


def test_clean_upload_unsupported_type() -> None:
    up = UploadedFile(name="x.bin", content_type="application/octet-stream", raw_bytes=b"\x00\x01")
    cleaned = clean_upload(up)
    assert cleaned.source.succeeded is False
    assert "unsupported" in (cleaned.source.error or "")


def test_clean_fetched_unsupported_type() -> None:
    doc = FetchedDoc(
        source=Source(kind="url", location="https://e.com/", succeeded=True),
        content_type="application/pdf",
        raw_bytes=b"%PDF-",
    )
    cleaned = clean_fetched(doc)
    assert cleaned.source.succeeded is False
```

Run: `uv run pytest packages/api/tests/extractor/test_clean.py -v` — FAIL (module missing).

- [ ] **Step 3.3: Implement clean.py**

`packages/api/myvoice/extractor/clean.py`:
```python
"""CLEAN stage: extract plain text from fetched HTML / uploaded md/txt/docx."""
from __future__ import annotations

import io

import trafilatura

from myvoice.extractor.models import CleanedDoc, FetchedDoc, Source, UploadedFile

_HTML_MIN_CHARS = 200

_DOCX_MIME = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)


def clean_fetched(doc: FetchedDoc) -> CleanedDoc:
    """Extract text from a URL-fetched document."""
    if not doc.source.succeeded:
        return CleanedDoc(source=doc.source, text="")
    ct = (doc.content_type or "").lower()
    if "html" in ct or ct.startswith("text/html"):
        return _clean_html(doc)
    if ct.startswith("text/markdown") or ct.startswith("text/plain"):
        return _clean_text(doc.raw_bytes, doc.source)
    return CleanedDoc(
        source=_mark_failed(doc.source, f"unsupported_content_type:{ct}"),
        text="",
    )


def clean_upload(up: UploadedFile) -> CleanedDoc:
    """Extract text from a base64-uploaded file (md/txt/docx)."""
    source = Source(
        kind="file", location=up.name,
        bytes=len(up.raw_bytes), succeeded=True,
    )
    name = up.name.lower()
    ct = (up.content_type or "").lower()
    if name.endswith(".md") or name.endswith(".txt") or ct.startswith("text/"):
        return _clean_text(up.raw_bytes, source)
    if name.endswith(".docx") or ct == _DOCX_MIME:
        return _clean_docx(up.raw_bytes, source)
    return CleanedDoc(
        source=_mark_failed(source, f"unsupported:{ct or 'unknown'}"),
        text="",
    )


def _clean_html(doc: FetchedDoc) -> CleanedDoc:
    try:
        html = doc.raw_bytes.decode("utf-8", errors="replace")
    except Exception as e:
        return CleanedDoc(source=_mark_failed(doc.source, f"decode:{e}"), text="")
    text = trafilatura.extract(
        html,
        include_comments=False,
        include_tables=False,
        favor_precision=True,
    ) or ""
    if len(text) < _HTML_MIN_CHARS:
        return CleanedDoc(
            source=_mark_failed(doc.source, "too_short"),
            text=text,
        )
    return CleanedDoc(
        source=_with_word_count(doc.source, text),
        text=text,
    )


def _clean_text(raw: bytes, source: Source) -> CleanedDoc:
    text = raw.decode("utf-8", errors="replace")
    text = _strip_frontmatter(text)
    return CleanedDoc(source=_with_word_count(source, text), text=text)


def _clean_docx(raw: bytes, source: Source) -> CleanedDoc:
    from docx import Document

    try:
        doc = Document(io.BytesIO(raw))
    except Exception as e:
        return CleanedDoc(source=_mark_failed(source, f"docx_parse:{e}"), text="")
    paras = [p.text.strip() for p in doc.paragraphs if p.text and p.text.strip()]
    text = "\n\n".join(paras)
    return CleanedDoc(source=_with_word_count(source, text), text=text)


def _strip_frontmatter(text: str) -> str:
    lines = text.splitlines()
    if len(lines) >= 3 and lines[0].strip() == "---":
        for i in range(1, len(lines)):
            if lines[i].strip() == "---":
                return "\n".join(lines[i + 1 :]).lstrip("\n")
    return text


def _mark_failed(source: Source, error: str) -> Source:
    return source.model_copy(update={"succeeded": False, "error": error})


def _with_word_count(source: Source, text: str) -> Source:
    return source.model_copy(update={"word_count": len(text.split())})
```

Run: `uv run pytest packages/api/tests/extractor/test_clean.py -v` — all 6 pass.

- [ ] **Step 3.4: Lint/commit**

```bash
uv run ruff check packages/api
uv run mypy packages/api
git add packages/api pyproject.toml uv.lock
git commit -m "$(cat <<'EOF'
feat(api): extractor CLEAN stage — trafilatura + utf8 + python-docx

clean_fetched(doc) dispatches by content-type: text/html via
trafilatura.extract (favor_precision, drop comments+tables), text/*
via utf-8 decode + optional front-matter strip. clean_upload(file)
dispatches by extension/mime: .md/.txt via decode, .docx via
python-docx walking paragraphs. HTML results under 200 chars soft-
fail with error="too_short". Unsupported content-types soft-fail.
All paths set source.word_count.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — Extractor ANALYZE stage + prompt + schema

**Files:**
- Modify: `packages/api/myvoice/extractor/models.py` (add `AnalysisResult` + `PackProposal` + sub-models)
- Create: `packages/api/myvoice/extractor/prompts/analyze.j2`
- Create: `packages/api/myvoice/extractor/schemas/__init__.py` (empty)
- Create: `packages/api/myvoice/extractor/schemas/analysis.json` (generated)
- Create: `packages/api/myvoice/extractor/analyze.py`
- Modify: `packages/api/myvoice/test_helpers/mock_provider.py` (JSON output mode)
- Create: `packages/api/tests/extractor/test_analyze.py`

- [ ] **Step 4.1: Extend models for AnalysisResult + PackProposal**

Append to `packages/api/myvoice/extractor/models.py`:
```python
from pydantic import Field


class BanishedWord(BaseModel):
    word: str
    frequency: int = 0


class BanishedPhrase(BaseModel):
    phrase: str
    frequency: int = 0


class PermittedExceptionProposal(BaseModel):
    term: str
    reason: str


class ProposedSample(BaseModel):
    excerpt: str
    source_location: str = ""
    why: str = ""
    rank: int = 99


class AnalysisResult(BaseModel):
    """Strict JSON returned by the LLM."""
    persona_identity: str
    persona_one_line: str
    banished_words: list[BanishedWord] = Field(default_factory=list)
    banished_phrases: list[BanishedPhrase] = Field(default_factory=list)
    permitted_exceptions: list[PermittedExceptionProposal] = Field(default_factory=list)
    style_guide_markdown: str = ""
    samples: list[ProposedSample] = Field(default_factory=list)
    pop_culture_allowed: list[str] = Field(default_factory=list)
    pop_culture_banned: list[str] = Field(default_factory=list)


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

- [ ] **Step 4.2: Generate analysis.json from the Pydantic model**

`packages/api/myvoice/extractor/schemas/__init__.py`: empty.

Generate the schema and write it to `packages/api/myvoice/extractor/schemas/analysis.json`:
```bash
uv run python -c "
import json
from myvoice.extractor.models import AnalysisResult
schema = AnalysisResult.model_json_schema()
with open('packages/api/myvoice/extractor/schemas/analysis.json', 'w') as f:
    json.dump(schema, f, indent=2)
"
```

Verify the file is committed.

- [ ] **Step 4.3: Create the Jinja prompt template**

`packages/api/myvoice/extractor/prompts/__init__.py`: empty.

`packages/api/myvoice/extractor/prompts/analyze.j2`:
```
You are analyzing a corpus of writing to extract its author's voice into a structured Style Pack.

Read the entire corpus below, then emit a JSON object matching the provided schema exactly.

Guidance:
- persona_identity: a short tagline (e.g. "The Builder Who Gets It")
- persona_one_line: one sentence of the writer's stance / what they advocate for
- banished_words: tokens the writer NEVER uses (single words, lowercase), with their frequency in the corpus (0 if absent and you're confidently inferring avoidance based on patterns)
- banished_phrases: multi-word patterns the writer avoids
- permitted_exceptions: words that LOOK banished but are intentional (e.g. "Pivotal" as a proper noun) — include the reason
- style_guide_markdown: 200-500 words of prose summarizing the writer's principles, examples, and brand signatures. This will be appended to the pack's style guide.
- samples: 5-10 ranked exemplars — verbatim excerpts (60-400 words each) that best showcase the voice, with a one-line `why` for each
- pop_culture_allowed / pop_culture_banned: franchises the writer does or never references

CORPUS:
{{ corpus }}
```

- [ ] **Step 4.4: Extend MockProvider for JSON output**

Edit `packages/api/myvoice/test_helpers/mock_provider.py`. After the existing `__init__` body, add a check for `MYVOICE_MOCK_OUTPUT_JSON` env var:

```python
class MockProvider:
    name = "mock"

    def __init__(self, api_key: str = "mock") -> None:
        self._text = os.environ.get("MYVOICE_MOCK_OUTPUT", "Hello from the mock.")
        self._json = os.environ.get("MYVOICE_MOCK_OUTPUT_JSON")  # if set, complete() returns this verbatim

    async def list_models(self) -> list[ModelInfo]:
        return [ModelInfo(id="mock-1", label="Mock Model", context_window=8000, supports_streaming=True)]

    async def complete(self, *, model: str, prompt: str, json_schema: dict[str, object] | None = None) -> LLMResponse:
        text = self._json if (json_schema is not None and self._json) else self._text
        return LLMResponse(
            text=text,
            input_tokens=len(prompt.split()),
            output_tokens=len(text.split()),
            model=model,
            finish_reason="stop",
        )

    # stream() unchanged
```

Update the existing `complete` method on `MockProvider` to this body. Keep `stream` unchanged.

- [ ] **Step 4.5: Write failing analyze tests**

`packages/api/tests/extractor/test_analyze.py`:
```python
"""Extractor ANALYZE stage — uses MockProvider with JSON output."""
from __future__ import annotations

import json

import pytest

from myvoice.extractor.analyze import _build_corpus, _render_template, analyze
from myvoice.extractor.models import CleanedDoc, Source
from myvoice.llm.registry import get_provider

_CANNED_ANALYSIS = {
    "persona_identity": "The Builder",
    "persona_one_line": "Ships often.",
    "banished_words": [{"word": "delve", "frequency": 0}],
    "banished_phrases": [],
    "permitted_exceptions": [],
    "style_guide_markdown": "Some prose about voice.",
    "samples": [
        {"excerpt": "A great sample.", "source_location": "https://e.com/", "why": "captures the voice", "rank": 1}
    ],
    "pop_culture_allowed": ["Marvel"],
    "pop_culture_banned": [],
}


def test_build_corpus_joins_with_separators() -> None:
    docs = [
        CleanedDoc(source=Source(kind="url", location="https://e.com/a", succeeded=True), text="post A body"),
        CleanedDoc(source=Source(kind="file", location="draft.md", succeeded=True), text="draft body"),
    ]
    corpus = _build_corpus(docs)
    assert "--- source: https://e.com/a ---" in corpus
    assert "--- source: draft.md ---" in corpus
    assert "post A body" in corpus
    assert "draft body" in corpus


def test_render_template_includes_corpus_and_guidance() -> None:
    out = _render_template("THE CORPUS")
    assert "THE CORPUS" in out
    assert "persona_identity" in out
    assert "samples" in out


@pytest.mark.asyncio
async def test_analyze_with_mock_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MYVOICE_TEST_PROVIDER", "mock")
    monkeypatch.setenv("MYVOICE_MOCK_OUTPUT_JSON", json.dumps(_CANNED_ANALYSIS))
    provider = get_provider("anthropic", "sk-mock")
    docs = [
        CleanedDoc(source=Source(kind="url", location="https://e.com/", succeeded=True), text="body"),
    ]
    result = await analyze(docs, provider, model="mock-1")
    assert result.persona_identity == "The Builder"
    assert result.banished_words[0].word == "delve"
    assert len(result.samples) == 1
```

Run: `uv run pytest packages/api/tests/extractor/test_analyze.py -v` — FAIL.

- [ ] **Step 4.6: Implement analyze.py**

`packages/api/myvoice/extractor/analyze.py`:
```python
"""ANALYZE stage: build corpus, render prompt, call LLM with json_schema."""
from __future__ import annotations

import json
from pathlib import Path

from jinja2 import Template

from myvoice.extractor.exceptions import ExtractorError
from myvoice.extractor.models import AnalysisResult, CleanedDoc
from myvoice.llm.base import LLMProvider

_PROMPT_PATH = Path(__file__).parent / "prompts" / "analyze.j2"
_SCHEMA_PATH = Path(__file__).parent / "schemas" / "analysis.json"


def _build_corpus(docs: list[CleanedDoc]) -> str:
    """Concatenate cleaned docs with --- source: <location> --- separators."""
    parts: list[str] = []
    for d in docs:
        parts.append(f"--- source: {d.source.location} ---\n\n{d.text}")
    return "\n\n".join(parts)


def _render_template(corpus: str) -> str:
    template = Template(_PROMPT_PATH.read_text(encoding="utf-8"))
    return template.render(corpus=corpus)


def _load_schema() -> dict[str, object]:
    return json.loads(_SCHEMA_PATH.read_text(encoding="utf-8"))


async def analyze(
    docs: list[CleanedDoc], provider: LLMProvider, *, model: str,
) -> tuple[AnalysisResult, int, int]:
    """Run analysis. Returns (result, input_tokens, output_tokens)."""
    successful = [d for d in docs if d.source.succeeded and d.text.strip()]
    if not successful:
        raise ExtractorError(
            "extractor_no_sources",
            "All sources failed to fetch or clean.",
        )
    corpus = _build_corpus(successful)
    prompt = _render_template(corpus)
    schema = _load_schema()
    resp = await provider.complete(model=model, prompt=prompt, json_schema=schema)
    try:
        result = AnalysisResult.model_validate_json(resp.text)
    except Exception as e:
        raise ExtractorError(
            "analyze_invalid_json",
            f"LLM output failed AnalysisResult validation: {e}",
        ) from e
    return result, resp.input_tokens, resp.output_tokens
```

Note: the test calls `analyze(docs, provider, model="mock-1")` and only reads `.persona_identity` from the first tuple element. Update the test to unpack:

Edit `test_analyze.py` `test_analyze_with_mock_provider`:
```python
    result, in_tok, out_tok = await analyze(docs, provider, model="mock-1")
    assert result.persona_identity == "The Builder"
    assert result.banished_words[0].word == "delve"
    assert len(result.samples) == 1
    assert in_tok > 0
```

Run: `uv run pytest packages/api/tests/extractor/test_analyze.py -v` — all pass.

- [ ] **Step 4.7: Lint/commit**

```bash
uv run ruff check packages/api
uv run mypy packages/api
git add packages/api
git commit -m "$(cat <<'EOF'
feat(api): extractor ANALYZE stage + analyze.j2 + analysis.json

analyze(docs, provider, model) concatenates the cleaned docs with
'--- source: <location> ---' separators, renders the Jinja prompt
in extractor/prompts/analyze.j2, calls provider.complete with the
JSON Schema generated from AnalysisResult.model_json_schema(),
parses the result. Empty/all-failed input raises
ExtractorError("extractor_no_sources"). Malformed LLM output that
slips past the provider's retry raises analyze_invalid_json.
MockProvider gains a JSON-output mode via MYVOICE_MOCK_OUTPUT_JSON
so the test suite (and Playwright) can exercise the schema path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — Extract route + from-analysis route + pipeline orchestrator

**Files:**
- Create: `packages/api/myvoice/extractor/propose.py`
- Create: `packages/api/myvoice/extractor/pipeline.py`
- Create: `packages/api/myvoice/api/extract.py`
- Modify: `packages/api/myvoice/server.py` (mount new router)
- Create: `packages/api/tests/extractor/test_propose.py`
- Create: `packages/api/tests/extractor/test_pipeline.py`
- Create: `packages/api/tests/api/test_extract_route.py`
- Create: `packages/api/tests/api/test_packs_from_analysis_route.py`

- [ ] **Step 5.1: Implement propose.py (pure)**

`packages/api/myvoice/extractor/propose.py`:
```python
"""PROPOSE stage: pure mapper AnalysisResult → PackProposal."""
from __future__ import annotations

from myvoice.extractor.models import AnalysisResult, PackProposal, Source
from myvoice.llm.cost import usd


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
    return PackProposal(
        analysis=analysis,
        sources=sources,
        model=model,
        provider=provider,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=usd(provider, model, input_tokens, output_tokens),
        elapsed_seconds=elapsed_seconds,
    )
```

`packages/api/tests/extractor/test_propose.py`:
```python
from myvoice.extractor.models import AnalysisResult, Source
from myvoice.extractor.propose import propose


def test_propose_computes_cost_and_carries_meta() -> None:
    analysis = AnalysisResult(persona_identity="x", persona_one_line="y")
    sources = [Source(kind="url", location="https://e.com/", succeeded=True)]
    proposal = propose(
        analysis, sources,
        model="claude-sonnet-4-6", provider="anthropic",
        input_tokens=1000, output_tokens=500, elapsed_seconds=2.5,
    )
    assert proposal.provider == "anthropic"
    assert proposal.model == "claude-sonnet-4-6"
    assert proposal.elapsed_seconds == 2.5
    # Sonnet rates from rates.yaml: $3/M in, $15/M out → 0.003 + 0.0075 = 0.0105
    assert abs(proposal.cost_usd - 0.0105) < 1e-6
    assert proposal.sources == sources
```

Run: `uv run pytest packages/api/tests/extractor/test_propose.py -v` — PASS.

- [ ] **Step 5.2: Implement pipeline.py orchestrator**

`packages/api/myvoice/extractor/pipeline.py`:
```python
"""Pipeline orchestrator: drive FETCH → CLEAN → ANALYZE → PROPOSE and push stage events."""
from __future__ import annotations

import time

from myvoice.extractor.analyze import analyze
from myvoice.extractor.clean import clean_fetched, clean_upload
from myvoice.extractor.exceptions import ExtractorError
from myvoice.extractor.fetch import fetch_all
from myvoice.extractor.models import CleanedDoc, UploadedFile
from myvoice.extractor.propose import propose
from myvoice.jobs.registry import JobRegistry
from myvoice.llm.exceptions import ProviderError
from myvoice.llm.registry import get_provider


async def run_extract_job(
    job_id: str,
    reg: JobRegistry,
    *,
    urls: list[str],
    uploads: list[UploadedFile],
    provider_name: str,
    api_key: str,
    model: str,
) -> None:
    """Background-task entry point. Runs the 4 stages, pushes stage events, completes/fails the job."""
    cancel_evt = reg.cancellation_event(job_id)
    started = time.monotonic()
    try:
        # FETCH
        await reg.set_stage(job_id, "fetching", progress=0.05)
        fetched = await fetch_all(urls) if urls else []
        if cancel_evt.is_set():
            return

        # CLEAN
        await reg.set_stage(job_id, "cleaning", progress=0.30)
        cleaned: list[CleanedDoc] = [clean_fetched(d) for d in fetched]
        cleaned.extend(clean_upload(u) for u in uploads)
        if cancel_evt.is_set():
            return

        # ANALYZE
        await reg.set_stage(job_id, "analyzing", progress=0.50)
        provider = get_provider(provider_name, api_key)
        analysis, in_tok, out_tok = await analyze(cleaned, provider, model=model)
        if cancel_evt.is_set():
            return

        # PROPOSE
        await reg.set_stage(job_id, "proposing", progress=0.90)
        proposal = propose(
            analysis,
            [d.source for d in cleaned],
            model=model, provider=provider_name,
            input_tokens=in_tok, output_tokens=out_tok,
            elapsed_seconds=time.monotonic() - started,
        )
        await reg.complete(job_id, proposal.model_dump(mode="json"))

    except ExtractorError as e:
        await reg.fail(job_id, e.code, e.message, e.hint)
    except ProviderError as e:
        await reg.fail(job_id, e.code, e.message, e.hint)
    except Exception as e:
        await reg.fail(job_id, "internal_error", f"Unexpected: {e}")
```

- [ ] **Step 5.3: Pipeline test**

`packages/api/tests/extractor/test_pipeline.py`:
```python
"""End-to-end pipeline test: 1 URL → fetched → cleaned → analyzed → PackProposal."""
from __future__ import annotations

import json

import httpx
import pytest
import respx

from myvoice.extractor.pipeline import run_extract_job
from myvoice.jobs.models import JobType
from myvoice.jobs.registry import JobRegistry

_CANNED = {
    "persona_identity": "The Builder",
    "persona_one_line": "Ships.",
    "banished_words": [],
    "banished_phrases": [],
    "permitted_exceptions": [],
    "style_guide_markdown": "prose",
    "samples": [],
    "pop_culture_allowed": [],
    "pop_culture_banned": [],
}


@pytest.mark.asyncio
@respx.mock
async def test_run_extract_job_end_to_end(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MYVOICE_TEST_PROVIDER", "mock")
    monkeypatch.setenv("MYVOICE_MOCK_OUTPUT_JSON", json.dumps(_CANNED))

    html = b"<html><body><article>" + (b"long body " * 50) + b"</article></body></html>"
    respx.get("https://e.com/post").mock(return_value=httpx.Response(200, content=html, headers={"content-type": "text/html"}))

    reg = JobRegistry()
    job = await reg.create(JobType.EXTRACT)
    await run_extract_job(
        job.id, reg,
        urls=["https://e.com/post"], uploads=[],
        provider_name="anthropic", api_key="sk-mock", model="mock-1",
    )

    final = await reg.get(job.id)
    assert final is not None
    assert final.status == "succeeded"
    assert final.result is not None
    assert final.result["analysis"]["persona_identity"] == "The Builder"
    assert final.result["provider"] == "anthropic"
```

Wait — `JobType.EXTRACT` may not exist yet. Check `packages/api/myvoice/jobs/models.py` from Phase 4: it should have `EXTRACT = "extract"`. If it doesn't (only `REWRITE`), add it:

```python
class JobType(StrEnum):
    REWRITE = "rewrite"
    EXTRACT = "extract"
```

(Phase 4 plan said EXTRACT was reserved; verify it landed.)

Run: `uv run pytest packages/api/tests/extractor/test_pipeline.py -v`.

- [ ] **Step 5.4: Implement extract route + from-analysis route**

`packages/api/myvoice/api/extract.py`:
```python
"""POST /api/extract + POST /api/packs/from-analysis."""
from __future__ import annotations

import asyncio
import base64
import shutil
from typing import Any

import yaml
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel, Field

from myvoice.extractor.models import AnalysisResult, UploadedFile
from myvoice.extractor.pipeline import run_extract_job
from myvoice.jobs.models import JobType
from myvoice.packs.templates import locate_template, resolve_write_root
from myvoice.validate import validate_pack

router = APIRouter(tags=["extract"])

_MAX_BYTES_PER_FILE = 5 * 1024 * 1024
_MAX_FILES = 10
_MAX_TOTAL_BYTES = 50 * 1024 * 1024


class _UploadIn(BaseModel):
    name: str
    content_b64: str
    mime: str = "application/octet-stream"


class _PackMeta(BaseModel):
    slug: str | None = None
    name: str | None = None
    author: str | None = None


class ExtractRequest(BaseModel):
    urls: list[str] = Field(default_factory=list)
    files: list[_UploadIn] = Field(default_factory=list)
    pack_meta: _PackMeta = Field(default_factory=_PackMeta)
    provider: str
    model: str


@router.post("/api/extract", status_code=202)
async def start_extract(
    req: ExtractRequest, request: Request, background_tasks: BackgroundTasks,
) -> dict[str, str]:
    if not req.urls and not req.files:
        raise HTTPException(
            400,
            detail={"error": {"code": "extract_invalid_request",
                              "message": "At least one URL or file is required."}},
        )
    if len(req.files) > _MAX_FILES:
        raise HTTPException(
            413,
            detail={"error": {"code": "too_many_files",
                              "message": f"At most {_MAX_FILES} files."}},
        )
    total = 0
    uploads: list[UploadedFile] = []
    for f in req.files:
        try:
            raw = base64.b64decode(f.content_b64, validate=True)
        except Exception as e:
            raise HTTPException(
                400,
                detail={"error": {"code": "extract_invalid_request",
                                  "message": f"Invalid base64 for {f.name}: {e}"}},
            ) from e
        if len(raw) > _MAX_BYTES_PER_FILE:
            raise HTTPException(
                413,
                detail={"error": {"code": "file_too_large",
                                  "message": f"{f.name} exceeds 5 MB."}},
            )
        total += len(raw)
        uploads.append(UploadedFile(name=f.name, content_type=f.mime, raw_bytes=raw))
    if total > _MAX_TOTAL_BYTES:
        raise HTTPException(
            413,
            detail={"error": {"code": "file_too_large",
                              "message": "Total upload exceeds 50 MB."}},
        )

    cfg = request.app.state.config
    prov_cfg = getattr(cfg.providers, req.provider, None)
    if prov_cfg is None or not prov_cfg.api_key:
        raise HTTPException(
            400,
            detail={"error": {"code": "provider_missing_key",
                              "message": f"No API key for {req.provider}",
                              "hint": "Add the key in Settings."}},
        )

    reg = request.app.state.job_registry
    job = await reg.create(JobType.EXTRACT)
    background_tasks.add_task(
        run_extract_job, job.id, reg,
        urls=list(req.urls), uploads=uploads,
        provider_name=req.provider, api_key=prov_cfg.api_key, model=req.model,
    )
    return {"job_id": job.id}


class FromAnalysisRequest(BaseModel):
    slug: str = Field(min_length=1, pattern=r"^[a-z][a-z0-9\-_]*$")
    name: str = Field(min_length=1)
    author: str = Field(min_length=1)
    persona_identity: str = Field(min_length=1)
    persona_one_line: str = Field(min_length=1)
    version: str = "0.1.0"
    description: str | None = None
    proposal: AnalysisResult
    selected_sample_indexes: list[int] = Field(default_factory=list)


@router.post("/api/packs/from-analysis", status_code=201)
async def create_from_analysis(
    req: FromAnalysisRequest, request: Request,
) -> dict[str, Any]:
    write_root = resolve_write_root()
    target = write_root / req.slug
    if target.exists():
        raise HTTPException(
            409,
            detail={"error": {"code": "slug_conflict",
                              "message": f"A pack with slug '{req.slug}' already exists.",
                              "details": {"slug": req.slug, "path": str(target)}}},
        )
    template = locate_template()
    write_root.mkdir(parents=True, exist_ok=True)
    shutil.copytree(template, target)

    # Patch manifest from proposal
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
    data["banished"]["words"] = sorted({w.word.lower() for w in req.proposal.banished_words})
    data["banished"]["phrases"] = [p.phrase for p in req.proposal.banished_phrases]
    data["banished"]["permitted_exceptions"] = [
        {"term": e.term, "reason": e.reason} for e in req.proposal.permitted_exceptions
    ]
    data["pop_culture"]["allowed"] = list(req.proposal.pop_culture_allowed)
    data["pop_culture"]["banned"] = list(req.proposal.pop_culture_banned)

    # Write selected samples
    selected = [req.proposal.samples[i] for i in req.selected_sample_indexes
                if 0 <= i < len(req.proposal.samples)]
    samples_meta: list[dict[str, str]] = []
    for idx, sample in enumerate(selected, start=1):
        sid = f"{idx:02d}"
        slug_part = _slugify(sample.excerpt)[:40] or "sample"
        rel = f"samples/{sid}-{slug_part}.md"
        file_path = target / rel
        file_path.parent.mkdir(parents=True, exist_ok=True)
        body_parts: list[str] = []
        if sample.source_location:
            body_parts.append(f"_Source: {sample.source_location}_\n")
        if sample.why:
            body_parts.append(f"_{sample.why}_\n")
        if body_parts:
            body_parts.append("")
        body_parts.append(_blockquote(sample.excerpt))
        file_path.write_text("\n".join(body_parts) + "\n", encoding="utf-8")
        samples_meta.append({"id": sid, "file": rel, "description": sample.why or ""})
    data["samples"] = samples_meta

    # Append style_guide_markdown to style-guide.md
    if req.proposal.style_guide_markdown:
        sg = target / "style-guide.md"
        existing = sg.read_text(encoding="utf-8")
        sg.write_text(
            existing.rstrip() + "\n\n---\n\n" + req.proposal.style_guide_markdown + "\n",
            encoding="utf-8",
        )

    # Atomic manifest write + reload
    manifest_path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")
    store = request.app.state.pack_store
    store.reload()

    # Validate defensively
    result = validate_pack(target)
    if result.errors:
        shutil.rmtree(target, ignore_errors=True)
        store.reload()
        raise HTTPException(
            500,
            detail={"error": {"code": "manifest_invalid",
                              "message": "Created pack failed validation",
                              "details": {"errors": [
                                  {"path": e.path, "message": e.message} for e in result.errors
                              ]}}},
        )

    bus = request.app.state.event_bus
    await bus.emit({"type": "pack:created", "slug": req.slug, "name": req.name, "path": str(target)})

    info = store.get(req.slug)
    assert info is not None
    return {
        "slug": info.slug,
        "name": info.name,
        "version": info.version,
        "valid": info.valid,
        "error_count": len(info.errors),
    }


def _slugify(text: str) -> str:
    import re
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", text.lower()).strip("-")
    return cleaned[:60]


def _blockquote(text: str) -> str:
    return "\n".join(f"> {line}" if line.strip() else ">" for line in text.splitlines())
```

- [ ] **Step 5.5: Mount router**

Edit `packages/api/myvoice/server.py`, add import + mount:
```python
from myvoice.api.extract import router as extract_router
# ...
app.include_router(extract_router)
```

- [ ] **Step 5.6: Route tests**

`packages/api/tests/api/test_extract_route.py`:
```python
"""POST /api/extract — async job + SSE."""
from __future__ import annotations

import json
import shutil
from collections.abc import Iterator
from pathlib import Path

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from myvoice.server import create_app

_REPO_ROOT = Path(__file__).resolve().parents[4]
_TEMPLATE_SRC = _REPO_ROOT / "packs" / "_template"

_CANNED = {
    "persona_identity": "The Builder",
    "persona_one_line": "Ships.",
    "banished_words": [],
    "banished_phrases": [],
    "permitted_exceptions": [],
    "style_guide_markdown": "prose",
    "samples": [],
    "pop_culture_allowed": [],
    "pop_culture_banned": [],
}


@pytest.fixture
def extract_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[tuple[TestClient, Path]]:
    packs_root = tmp_path / "packs"
    packs_root.mkdir()
    shutil.copytree(_TEMPLATE_SRC, packs_root / "_template")
    monkeypatch.setenv("MYVOICE_PACKS_ROOT", str(packs_root))
    monkeypatch.setenv("MYVOICE_CONFIG_PATH", str(tmp_path / "config.yaml"))
    monkeypatch.setenv("MYVOICE_TEST_PROVIDER", "mock")
    monkeypatch.setenv("MYVOICE_MOCK_OUTPUT_JSON", json.dumps(_CANNED))
    app = create_app()
    with TestClient(app) as c:
        # Pre-set anthropic key so the route accepts it
        c.put("/api/config", json={"providers": {"anthropic": {"api_key": "sk-mock"}}})
        yield c, packs_root


@respx.mock
def test_start_extract_returns_job_and_completes(extract_client: tuple[TestClient, Path]) -> None:
    client, _ = extract_client
    html = b"<html><body><article>" + (b"plenty of body " * 50) + b"</article></body></html>"
    respx.get("https://e.com/post").mock(
        return_value=httpx.Response(200, content=html, headers={"content-type": "text/html"})
    )
    r = client.post(
        "/api/extract",
        json={
            "urls": ["https://e.com/post"],
            "files": [],
            "pack_meta": {},
            "provider": "anthropic",
            "model": "mock-1",
        },
    )
    assert r.status_code == 202
    job_id = r.json()["job_id"]
    with client.stream("GET", f"/api/jobs/{job_id}/events") as resp:
        body = b"".join(resp.iter_bytes()).decode()
    assert '"type":"stage"' in body
    assert '"type":"complete"' in body
    assert '"persona_identity":"The Builder"' in body


def test_start_extract_zero_inputs_400(extract_client: tuple[TestClient, Path]) -> None:
    client, _ = extract_client
    r = client.post(
        "/api/extract",
        json={"urls": [], "files": [], "pack_meta": {}, "provider": "anthropic", "model": "mock-1"},
    )
    assert r.status_code == 400


def test_start_extract_file_too_large_413(extract_client: tuple[TestClient, Path]) -> None:
    import base64 as _b64
    client, _ = extract_client
    big = b"x" * (6 * 1024 * 1024)
    r = client.post(
        "/api/extract",
        json={
            "urls": [],
            "files": [{"name": "big.md", "content_b64": _b64.b64encode(big).decode(), "mime": "text/markdown"}],
            "pack_meta": {}, "provider": "anthropic", "model": "mock-1",
        },
    )
    assert r.status_code == 413
```

`packages/api/tests/api/test_packs_from_analysis_route.py`:
```python
"""POST /api/packs/from-analysis."""
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
def from_analysis_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[tuple[TestClient, Path]]:
    packs_root = tmp_path / "packs"
    packs_root.mkdir()
    shutil.copytree(_TEMPLATE_SRC, packs_root / "_template")
    monkeypatch.setenv("MYVOICE_PACKS_ROOT", str(packs_root))
    monkeypatch.setenv("MYVOICE_CONFIG_PATH", str(tmp_path / "config.yaml"))
    app = create_app()
    with TestClient(app) as c:
        yield c, packs_root


def _proposal_payload() -> dict:
    return {
        "persona_identity": "The Builder",
        "persona_one_line": "Ships often.",
        "banished_words": [{"word": "delve", "frequency": 0}],
        "banished_phrases": [],
        "permitted_exceptions": [{"term": "Pivotal", "reason": "Proper noun"}],
        "style_guide_markdown": "Some new prose about voice.",
        "samples": [
            {"excerpt": "First sample.", "source_location": "https://e.com/a", "why": "good", "rank": 1},
            {"excerpt": "Second sample.", "source_location": "https://e.com/b", "why": "ok", "rank": 2},
        ],
        "pop_culture_allowed": ["Marvel"],
        "pop_culture_banned": ["Star Wars"],
    }


def test_from_analysis_writes_pack(from_analysis_client: tuple[TestClient, Path]) -> None:
    client, packs_root = from_analysis_client
    r = client.post(
        "/api/packs/from-analysis",
        json={
            "slug": "alice",
            "name": "Alice Voice",
            "author": "Alice",
            "persona_identity": "Override Identity",
            "persona_one_line": "Override one line.",
            "proposal": _proposal_payload(),
            "selected_sample_indexes": [0],  # only the first sample
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["slug"] == "alice"
    assert body["valid"] is True

    manifest = yaml.safe_load((packs_root / "alice" / "stylepack.yaml").read_text())
    assert manifest["persona"]["identity"] == "Override Identity"
    assert manifest["banished"]["words"] == ["delve"]
    assert manifest["pop_culture"]["allowed"] == ["Marvel"]
    assert len(manifest["samples"]) == 1
    assert manifest["samples"][0]["file"].startswith("samples/01-")
    # Style guide was appended
    sg = (packs_root / "alice" / "style-guide.md").read_text()
    assert "Some new prose about voice." in sg


def test_from_analysis_slug_conflict(from_analysis_client: tuple[TestClient, Path]) -> None:
    client, _ = from_analysis_client
    payload = {
        "slug": "alice", "name": "A", "author": "A",
        "persona_identity": "i", "persona_one_line": "o",
        "proposal": _proposal_payload(), "selected_sample_indexes": [],
    }
    r1 = client.post("/api/packs/from-analysis", json=payload)
    assert r1.status_code == 201
    r2 = client.post("/api/packs/from-analysis", json=payload)
    assert r2.status_code == 409
```

Run: `uv run pytest packages/api/tests/ -q` — full suite should pass (151 baseline + ~30 new = ~180).

- [ ] **Step 5.7: Lint/commit**

```bash
uv run ruff check packages/api
uv run mypy packages/api
git add packages/api
git commit -m "$(cat <<'EOF'
feat(api): POST /api/extract (async) + POST /api/packs/from-analysis

Extract route validates input (≥1 url-or-file, ≤10 files, ≤5 MB each,
≤50 MB total), base64-decodes uploads, creates a JobRegistry job of
type extract, schedules run_extract_job via BackgroundTasks, returns
202 + job_id. Pipeline pushes fetching/cleaning/analyzing/proposing
stage events to the existing per-job SSE, then completes with the
serialized PackProposal.

from-analysis copies _template to <write_root>/<slug>, patches the
manifest from the request (slug/name/author/version/description +
persona + banished + pop_culture), writes selected samples as
samples/<id>-<auto>.md (same blockquote format as Phase 4's Save-as-
sample), appends proposal.style_guide_markdown to style-guide.md,
re-validates, emits pack:created.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — Frontend: /extract route + Step 1 inputs

**Files:**
- Create: `packages/web/src/api/extract.ts`
- Create: `packages/web/src/api/rates.ts`
- Create: `packages/web/tests/api/rates.test.ts`
- Create: `packages/web/src/routes/ExtractPage.tsx`
- Create: `packages/web/src/components/extract/Step1Inputs.tsx`
- Create: `packages/web/src/components/extract/UrlList.tsx`
- Create: `packages/web/src/components/extract/FileDropzone.tsx`
- Create: `packages/web/src/components/extract/CostEstimate.tsx`
- Create: `packages/web/tests/components/extract/Step1Inputs.test.tsx`
- Modify: `packages/web/src/App.tsx` (add `/extract` route)
- Modify: `packages/web/src/components/AppShell.tsx` (add Extract nav link)

- [ ] **Step 6.1: Types + API clients**

`packages/web/src/api/extract.ts`:
```typescript
import { apiFetch } from "./client";
import type { PackSummary } from "./packs";

export interface ProposedSample {
  excerpt: string;
  source_location: string;
  why: string;
  rank: number;
}

export interface BanishedWord { word: string; frequency: number; }
export interface BanishedPhrase { phrase: string; frequency: number; }
export interface PermittedExceptionProposal { term: string; reason: string; }

export interface AnalysisResult {
  persona_identity: string;
  persona_one_line: string;
  banished_words: BanishedWord[];
  banished_phrases: BanishedPhrase[];
  permitted_exceptions: PermittedExceptionProposal[];
  style_guide_markdown: string;
  samples: ProposedSample[];
  pop_culture_allowed: string[];
  pop_culture_banned: string[];
}

export interface ExtractSource {
  kind: "url" | "file";
  location: string;
  bytes: number;
  word_count: number;
  succeeded: boolean;
  error: string | null;
}

export interface PackProposal {
  analysis: AnalysisResult;
  sources: ExtractSource[];
  model: string;
  provider: string;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  elapsed_seconds: number;
}

export interface UploadFile {
  name: string;
  content_b64: string;
  mime: string;
}

export interface ExtractRequest {
  urls: string[];
  files: UploadFile[];
  pack_meta: { slug?: string; name?: string; author?: string };
  provider: "anthropic" | "openai" | "google";
  model: string;
}

export async function startExtract(req: ExtractRequest): Promise<{ job_id: string }> {
  return apiFetch("/api/extract", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export interface FromAnalysisRequest {
  slug: string;
  name: string;
  author: string;
  persona_identity: string;
  persona_one_line: string;
  version?: string;
  description?: string;
  proposal: AnalysisResult;
  selected_sample_indexes: number[];
}

export async function saveFromAnalysis(req: FromAnalysisRequest): Promise<PackSummary> {
  return apiFetch("/api/packs/from-analysis", {
    method: "POST",
    body: JSON.stringify(req),
  });
}
```

- [ ] **Step 6.2: rates.ts mirror**

`packages/web/src/api/rates.ts`:
```typescript
/** Client-side mirror of llm/rates.yaml — used for the cost estimate.
 * Drift is acceptable since labels always say "approximate". Update on backend rate changes. */
export interface ModelRate {
  input_per_million_usd: number;
  output_per_million_usd: number;
  label: string;
}

export const RATES: Record<string, Record<string, ModelRate>> = {
  anthropic: {
    "claude-opus-4-7": { label: "Claude Opus 4.7", input_per_million_usd: 15.0, output_per_million_usd: 75.0 },
    "claude-sonnet-4-6": { label: "Claude Sonnet 4.6", input_per_million_usd: 3.0, output_per_million_usd: 15.0 },
    "claude-haiku-4-5-20251001": { label: "Claude Haiku 4.5", input_per_million_usd: 0.8, output_per_million_usd: 4.0 },
  },
  openai: {
    "gpt-5": { label: "GPT-5", input_per_million_usd: 5.0, output_per_million_usd: 15.0 },
    "gpt-5-mini": { label: "GPT-5 Mini", input_per_million_usd: 0.5, output_per_million_usd: 1.5 },
  },
  google: {
    "gemini-2.5-pro": { label: "Gemini 2.5 Pro", input_per_million_usd: 3.5, output_per_million_usd: 10.5 },
    "gemini-2.5-flash": { label: "Gemini 2.5 Flash", input_per_million_usd: 0.3, output_per_million_usd: 1.2 },
  },
};

export function estimateCost(
  provider: string, model: string, inputTokens: number, outputTokens: number,
): number {
  const entry = RATES[provider]?.[model];
  if (!entry) return 0;
  return (inputTokens / 1_000_000) * entry.input_per_million_usd +
         (outputTokens / 1_000_000) * entry.output_per_million_usd;
}

/** Crude input-token estimator: chars / 4 (English). */
export function estimateInputTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

`packages/web/tests/api/rates.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { estimateCost, estimateInputTokens } from "../../src/api/rates";

describe("rates", () => {
  it("estimateInputTokens returns chars/4", () => {
    expect(estimateInputTokens("a".repeat(400))).toBe(100);
  });

  it("estimateCost computes USD for known model", () => {
    const cost = estimateCost("anthropic", "claude-sonnet-4-6", 1000, 500);
    // 1k @ $3/M = 0.003; 500 @ $15/M = 0.0075; total = 0.0105
    expect(cost).toBeCloseTo(0.0105, 6);
  });

  it("estimateCost returns 0 for unknown", () => {
    expect(estimateCost("nope", "model", 1000, 1000)).toBe(0);
  });
});
```

- [ ] **Step 6.3: UrlList component**

`packages/web/src/components/extract/UrlList.tsx`:
```tsx
import { type ChangeEvent } from "react";

interface UrlListProps {
  urls: string[];
  onChange: (next: string[]) => void;
}

export function UrlList({ urls, onChange }: UrlListProps): JSX.Element {
  const update = (i: number, value: string): void => {
    onChange(urls.map((u, idx) => (idx === i ? value : u)));
  };
  const remove = (i: number): void => onChange(urls.filter((_, idx) => idx !== i));
  const add = (): void => onChange([...urls, ""]);

  return (
    <div className="space-y-2">
      {urls.map((url, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="url"
            value={url}
            onChange={(e: ChangeEvent<HTMLInputElement>) => update(i, e.target.value)}
            placeholder="https://example.com/post"
            aria-label={`URL ${i + 1}`}
            className="flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            aria-label={`Remove URL ${i + 1}`}
            className="text-slate-500 hover:text-red-400 px-2"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="text-sm text-emerald-400 hover:text-emerald-300"
      >
        + Add URL
      </button>
    </div>
  );
}
```

- [ ] **Step 6.4: FileDropzone component**

`packages/web/src/components/extract/FileDropzone.tsx`:
```tsx
import { type ChangeEvent, type DragEvent, useRef, useState } from "react";

import type { UploadFile } from "../../api/extract";

interface FileDropzoneProps {
  files: UploadFile[];
  onChange: (next: UploadFile[]) => void;
}

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 10;
const ACCEPT = ".md,.txt,.docx";
const ALLOWED_EXT = [".md", ".txt", ".docx"];

async function fileToUpload(file: File): Promise<UploadFile> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // base64 encode in chunks to avoid stack overflow
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return {
    name: file.name,
    content_b64: btoa(bin),
    mime: file.type || "application/octet-stream",
  };
}

export function FileDropzone({ files, onChange }: FileDropzoneProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = async (incoming: FileList | File[]): Promise<void> => {
    setError(null);
    const arr = Array.from(incoming);
    for (const f of arr) {
      const ext = "." + (f.name.split(".").pop() || "").toLowerCase();
      if (!ALLOWED_EXT.includes(ext)) {
        setError(`Unsupported file type: ${f.name}`);
        return;
      }
      if (f.size > MAX_BYTES) {
        setError(`${f.name} is larger than 5 MB`);
        return;
      }
    }
    const newOnes = await Promise.all(arr.map(fileToUpload));
    const combined = [...files, ...newOnes];
    if (combined.length > MAX_FILES) {
      setError(`Maximum ${MAX_FILES} files; received ${combined.length}`);
      return;
    }
    onChange(combined);
  };

  const onInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
    if (e.target.files) void addFiles(e.target.files);
    e.target.value = "";  // allow re-selecting the same file
  };

  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) void addFiles(e.dataTransfer.files);
  };

  const remove = (i: number): void => {
    onChange(files.filter((_, idx) => idx !== i));
  };

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter") inputRef.current?.click(); }}
        role="button"
        tabIndex={0}
        className={`border-2 border-dashed rounded p-6 text-center cursor-pointer ${
          dragOver ? "border-emerald-500 bg-emerald-900/10" : "border-slate-700"
        }`}
      >
        <p className="text-slate-400 text-sm">
          Drag and drop .md / .txt / .docx files here, or click to pick
        </p>
        <p className="text-slate-500 text-xs mt-1">
          Up to {MAX_FILES} files, 5 MB each
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          onChange={onInputChange}
          className="hidden"
          aria-label="Choose files"
        />
      </div>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 bg-slate-800 text-slate-200 px-2 py-1 rounded text-xs">
              {f.name}
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove ${f.name}`}
                className="text-slate-400 hover:text-red-400"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 6.5: CostEstimate component**

`packages/web/src/components/extract/CostEstimate.tsx`:
```tsx
import { estimateCost, estimateInputTokens } from "../../api/rates";

interface CostEstimateProps {
  inputTextChars: number;  // total chars of URLs (rough) + file sizes / encoding ratio
  provider: string;
  model: string;
}

export function CostEstimate({ inputTextChars, provider, model }: CostEstimateProps): JSX.Element | null {
  if (inputTextChars === 0 || !provider || !model) return null;
  const inputTokens = estimateInputTokens(String(" ").repeat(inputTextChars));
  const outputTokens = 600;
  const cost = estimateCost(provider, model, inputTokens, outputTokens);
  return (
    <p className="text-slate-500 text-xs mt-2">
      Estimated: ~{inputTokens.toLocaleString()} input tokens → ~${cost.toFixed(4)} with {model} (approximate)
    </p>
  );
}
```

- [ ] **Step 6.6: Step1Inputs**

`packages/web/src/components/extract/Step1Inputs.tsx`:
```tsx
import { type ChangeEvent, useEffect, useMemo, useState } from "react";

import { listModels, type ModelInfo, type Config } from "../../api/config";
import type { UploadFile } from "../../api/extract";
import { CostEstimate } from "./CostEstimate";
import { FileDropzone } from "./FileDropzone";
import { UrlList } from "./UrlList";

export const SLUG_PATTERN = /^[a-z][a-z0-9\-_]*$/;

export interface Step1State {
  urls: string[];
  files: UploadFile[];
  slug: string;
  name: string;
  author: string;
  provider: "anthropic" | "openai" | "google";
  model: string;
}

interface Step1InputsProps {
  state: Step1State;
  config: Config;
  onChange: (next: Step1State) => void;
  onAnalyze: () => void;
}

export function Step1Inputs({ state, config, onChange, onAnalyze }: Step1InputsProps): JSX.Element {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const set = <K extends keyof Step1State>(k: K, v: Step1State[K]): void =>
    onChange({ ...state, [k]: v });

  // Load models when provider changes
  useEffect(() => {
    if (!state.provider) return;
    const provCfg = config.providers[state.provider];
    if (!provCfg || !provCfg.api_key) { setModels([]); return; }
    let cancelled = false;
    listModels(state.provider).then((m) => { if (!cancelled) setModels(m); }).catch(() => {});
    return () => { cancelled = true; };
  }, [state.provider, config.providers]);

  // Auto-pick first model when models load
  useEffect(() => {
    if (!state.model && models.length > 0) {
      set("model", models[0].id);
    }
  }, [models]);

  // Auto-derive slug from name
  const handleName = (e: ChangeEvent<HTMLInputElement>): void => {
    const name = e.target.value;
    const next: Step1State = { ...state, name };
    if (!state.slug || state.slug === slugify(state.name)) {
      next.slug = slugify(name);
    }
    onChange(next);
  };

  // Crude char count for cost estimate: each URL contributes ~12000 chars (guess), each file contributes its base64-decoded size
  const inputChars = useMemo(() => {
    const fromUrls = state.urls.filter((u) => u.length > 0).length * 12_000;
    const fromFiles = state.files.reduce((sum, f) => sum + (f.content_b64.length * 3) / 4, 0);
    return Math.round(fromUrls + fromFiles);
  }, [state.urls, state.files]);

  const slugValid = SLUG_PATTERN.test(state.slug);
  const canAnalyze =
    (state.urls.some((u) => u.startsWith("http")) || state.files.length > 0) &&
    slugValid && state.name.trim() && state.author.trim() && state.model;

  const providers: Array<"anthropic" | "openai" | "google"> = ["anthropic", "openai", "google"];

  return (
    <section className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-base font-semibold text-slate-100 mb-2">URLs</h2>
        <UrlList urls={state.urls} onChange={(v) => set("urls", v)} />
      </div>
      <div>
        <h2 className="text-base font-semibold text-slate-100 mb-2">Files</h2>
        <FileDropzone files={state.files} onChange={(v) => set("files", v)} />
      </div>
      <div>
        <h2 className="text-base font-semibold text-slate-100 mb-2">Pack details</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Slug" id="ex-slug" error={!slugValid && state.slug ? "Must match ^[a-z][a-z0-9-_]*$" : undefined}>
            <input id="ex-slug" type="text" value={state.slug} onChange={(e) => set("slug", e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100" />
          </Field>
          <Field label="Name" id="ex-name">
            <input id="ex-name" type="text" value={state.name} onChange={handleName}
              className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100" />
          </Field>
          <Field label="Author" id="ex-author">
            <input id="ex-author" type="text" value={state.author} onChange={(e) => set("author", e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100" />
          </Field>
        </div>
      </div>
      <div>
        <h2 className="text-base font-semibold text-slate-100 mb-2">LLM</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Provider" id="ex-provider">
            <select id="ex-provider" value={state.provider}
              onChange={(e) => set("provider", e.target.value as Step1State["provider"])}
              className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100">
              {providers.map((p) => {
                const has = !!config.providers[p].api_key;
                return (
                  <option key={p} value={p} disabled={!has}>
                    {p}{has ? "" : " (no API key)"}
                  </option>
                );
              })}
            </select>
          </Field>
          <Field label="Model" id="ex-model">
            <select id="ex-model" value={state.model} onChange={(e) => set("model", e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100">
              {models.length === 0 && <option value="">No models</option>}
              {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </Field>
        </div>
        <CostEstimate inputTextChars={inputChars} provider={state.provider} model={state.model} />
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={onAnalyze} disabled={!canAnalyze}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded disabled:opacity-50">
          Analyze →
        </button>
      </div>
    </section>
  );
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^[^a-z]/, "").replace(/-+$/, "");
}

interface FieldProps { label: string; id: string; error?: string; children: React.ReactNode; }
function Field({ label, id, error, children }: FieldProps): JSX.Element {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-200 mb-1">{label}</label>
      {children}
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 6.7: ExtractPage stub (Step 1 only — Steps 2 & 3 in next tasks)**

`packages/web/src/routes/ExtractPage.tsx`:
```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getConfig, type Config } from "../api/config";
import { startExtract } from "../api/extract";
import { Step1Inputs, type Step1State } from "../components/extract/Step1Inputs";

export function ExtractPage(): JSX.Element {
  const navigate = useNavigate();
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<Step1State>({
    urls: [""],
    files: [],
    slug: "",
    name: "",
    author: "",
    provider: "anthropic",
    model: "",
  });

  useEffect(() => {
    getConfig().then(setConfig).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div className="p-8 text-red-400">Error: {error}</div>;
  if (!config) return <div className="p-8 text-slate-500">Loading…</div>;

  const onAnalyze = async (): Promise<void> => {
    try {
      const cleanUrls = state.urls.filter((u) => u.startsWith("http"));
      await startExtract({
        urls: cleanUrls,
        files: state.files,
        pack_meta: { slug: state.slug, name: state.name, author: state.author },
        provider: state.provider,
        model: state.model,
      });
      // Step 2/3 wiring lands in Task 7/8 — for now just toast and stay.
      alert("Extract started. Step 2 progress UI lands in Task 7.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-slate-100 mb-6">Extract from URLs</h1>
      <Step1Inputs state={state} config={config} onChange={setState} onAnalyze={onAnalyze} />
    </div>
  );
}
```

- [ ] **Step 6.8: Add route + AppShell link**

Edit `packages/web/src/App.tsx` — add the import and route alongside existing ones:
```tsx
import { ExtractPage } from "./routes/ExtractPage";
// ...
<Route path="/extract" element={<ExtractPage />} />
```

Edit `packages/web/src/components/AppShell.tsx` — add a NavLink "Extract from URLs" → `/extract` between "Compose & test" and "Settings". Mirror the styling of the existing links.

- [ ] **Step 6.9: Step1Inputs test**

`packages/web/tests/components/extract/Step1Inputs.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Step1Inputs, type Step1State } from "../../../src/components/extract/Step1Inputs";

vi.mock("../../../src/api/config", () => ({
  listModels: vi.fn().mockResolvedValue([{ id: "m1", label: "Mock Model", context_window: 8000, supports_streaming: true }]),
}));

const baseConfig = {
  version: 1,
  server: { port: 7878, open_browser: true },
  ui: { default_pack: null, theme: "system" as const },
  pack_paths: [],
  providers: {
    anthropic: { api_key: "sk-mock", default_model: null },
    openai: { api_key: "", default_model: null },
    google: { api_key: "", default_model: null },
  },
  features: { default_compose_provider: "anthropic", default_extraction_provider: "anthropic" },
};

const baseState: Step1State = {
  urls: [""],
  files: [],
  slug: "",
  name: "",
  author: "",
  provider: "anthropic",
  model: "",
};

describe("Step1Inputs", () => {
  it("disables Analyze until requirements met", async () => {
    const onAnalyze = vi.fn();
    const onChange = vi.fn();
    render(<Step1Inputs state={baseState} config={baseConfig} onChange={onChange} onAnalyze={onAnalyze} />);
    expect(screen.getByText("Analyze →")).toBeDisabled();
  });

  it("derives slug from name", () => {
    const onChange = vi.fn();
    render(<Step1Inputs state={baseState} config={baseConfig} onChange={onChange} onAnalyze={() => {}} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Hello World" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: "Hello World", slug: "hello-world" }));
  });

  it("shows cost estimate when input is non-empty and model selected", async () => {
    const stateWithInput = { ...baseState, urls: ["https://e.com/a"], name: "X", author: "Y", slug: "x", model: "m1" };
    render(<Step1Inputs state={stateWithInput} config={baseConfig} onChange={() => {}} onAnalyze={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Estimated:/)).toBeInTheDocument());
  });
});
```

- [ ] **Step 6.10: Run frontend checks + commit**

```bash
cd packages/web
pnpm test
pnpm lint
pnpm build
cd ../..
git add packages/web
git commit -m "$(cat <<'EOF'
feat(web): /extract route + Step 1 inputs (URLs + dropzone + cost estimate)

Adds extract.ts and rates.ts API clients (typed AnalysisResult /
PackProposal / FromAnalysisRequest mirrors backend; rates.ts is a
client-side mirror of llm/rates.yaml for the live cost estimate).
Step1Inputs composes UrlList + FileDropzone + slug/name/author
fields + provider/model selectors. FileDropzone enforces 5 MB per
file, 10 files max, .md/.txt/.docx extension allowlist; base64-
encodes via ArrayBuffer for the request body. ExtractPage hosts
Step 1; Steps 2 and 3 land in Tasks 7 and 8. AppShell sidebar gains
the Extract nav link.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7 — Frontend: Step 2 progress UI + useExtractJob hook

**Files:**
- Create: `packages/web/src/hooks/useExtractJob.ts`
- Create: `packages/web/tests/hooks/useExtractJob.test.ts`
- Create: `packages/web/src/components/extract/Step2Progress.tsx`
- Create: `packages/web/tests/components/extract/Step2Progress.test.tsx`
- Modify: `packages/web/src/routes/ExtractPage.tsx` — transition to Step 2 on Analyze, render Step2Progress

- [ ] **Step 7.1: useExtractJob hook**

`packages/web/src/hooks/useExtractJob.ts`:
```typescript
import { useEffect } from "react";

import type { PackProposal } from "../api/extract";

export interface ExtractJobHandlers {
  onStage: (stage: string, message: string, progress: number) => void;
  onComplete: (proposal: PackProposal) => void;
  onError: (code: string, message: string, hint?: string) => void;
}

export function useExtractJob(jobId: string | null, handlers: ExtractJobHandlers): void {
  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`/api/jobs/${jobId}/events`);
    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data) as { type: string } & Record<string, unknown>;
        if (evt.type === "stage") {
          handlers.onStage(
            String(evt.name ?? ""), String(evt.message ?? ""),
            typeof evt.progress === "number" ? evt.progress : 0,
          );
        } else if (evt.type === "complete") {
          handlers.onComplete(evt.result as PackProposal);
          es.close();
        } else if (evt.type === "error") {
          handlers.onError(
            String(evt.code ?? "error"),
            String(evt.message ?? ""),
            evt.hint ? String(evt.hint) : undefined,
          );
          es.close();
        }
      } catch {
        // ignore
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [jobId]);
}
```

`packages/web/tests/hooks/useExtractJob.test.ts`:
```typescript
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useExtractJob } from "../../src/hooks/useExtractJob";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  closed = false;
  url: string;
  constructor(url: string) { this.url = url; FakeEventSource.instances.push(this); }
  close(): void { this.closed = true; }
  emit(data: unknown): void { this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(data) })); }
}

beforeEach(() => { FakeEventSource.instances = []; vi.stubGlobal("EventSource", FakeEventSource); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("useExtractJob", () => {
  it("dispatches stage, complete, and error events", () => {
    const handlers = { onStage: vi.fn(), onComplete: vi.fn(), onError: vi.fn() };
    renderHook(() => useExtractJob("job-1", handlers));
    const es = FakeEventSource.instances[0];
    es.emit({ type: "stage", name: "fetching", message: "x", progress: 0.05 });
    expect(handlers.onStage).toHaveBeenCalledWith("fetching", "x", 0.05);
    es.emit({ type: "complete", result: { analysis: { persona_identity: "p" } } });
    expect(handlers.onComplete).toHaveBeenCalled();
    expect(es.closed).toBe(true);
  });

  it("does nothing when jobId is null", () => {
    renderHook(() => useExtractJob(null, { onStage: vi.fn(), onComplete: vi.fn(), onError: vi.fn() }));
    expect(FakeEventSource.instances).toHaveLength(0);
  });
});
```

- [ ] **Step 7.2: Step2Progress component**

`packages/web/src/components/extract/Step2Progress.tsx`:
```tsx
import { cancelJob } from "../../api/jobs";

interface StageState {
  status: "pending" | "running" | "done" | "failed";
  message?: string;
}

interface Step2ProgressProps {
  stages: Record<string, StageState>;
  jobId: string;
  error: { message: string; hint?: string } | null;
  onCancel: () => void;
  onBack: () => void;
}

const STAGES = ["fetching", "cleaning", "analyzing", "proposing"] as const;

export function Step2Progress({ stages, jobId, error, onCancel, onBack }: Step2ProgressProps): JSX.Element {
  const doCancel = async (): Promise<void> => {
    try { await cancelJob(jobId); } catch { /* ignore */ }
    onCancel();
  };

  return (
    <section className="space-y-6 max-w-2xl">
      <h2 className="text-base font-semibold text-slate-100">Analyzing</h2>
      <ol className="space-y-3">
        {STAGES.map((name) => {
          const s = stages[name] ?? { status: "pending" as const };
          return (
            <li key={name} className="flex items-start gap-3">
              <Icon status={s.status} />
              <div className="flex-1">
                <div className="text-slate-100 capitalize">{name}</div>
                {s.message && <div className="text-slate-400 text-xs">{s.message}</div>}
              </div>
            </li>
          );
        })}
      </ol>
      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-200 rounded p-3 text-sm">
          <div>{error.message}</div>
          {error.hint && <div className="text-red-300/80 mt-1">{error.hint}</div>}
          <button
            type="button"
            onClick={onBack}
            className="mt-2 px-3 py-1.5 text-sm border border-red-700 text-red-200 rounded hover:bg-red-900/30"
          >
            Back to inputs
          </button>
        </div>
      )}
      {!error && (
        <button
          type="button"
          onClick={doCancel}
          className="px-3 py-1.5 text-sm border border-slate-700 text-slate-300 rounded hover:bg-slate-800"
        >
          Cancel
        </button>
      )}
    </section>
  );
}

function Icon({ status }: { status: StageState["status"] }): JSX.Element {
  if (status === "done") return <span className="text-emerald-400">✓</span>;
  if (status === "running") return <span className="text-amber-400 animate-pulse">●</span>;
  if (status === "failed") return <span className="text-red-400">✗</span>;
  return <span className="text-slate-600">○</span>;
}
```

`packages/web/tests/components/extract/Step2Progress.test.tsx`:
```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Step2Progress } from "../../../src/components/extract/Step2Progress";

vi.mock("../../../src/api/jobs", () => ({
  cancelJob: vi.fn().mockResolvedValue(undefined),
}));

describe("Step2Progress", () => {
  it("renders all 4 stages", () => {
    render(
      <Step2Progress
        stages={{}}
        jobId="job-1"
        error={null}
        onCancel={() => {}}
        onBack={() => {}}
      />,
    );
    expect(screen.getByText("fetching")).toBeInTheDocument();
    expect(screen.getByText("cleaning")).toBeInTheDocument();
    expect(screen.getByText("analyzing")).toBeInTheDocument();
    expect(screen.getByText("proposing")).toBeInTheDocument();
  });

  it("Cancel button calls cancelJob and onCancel", async () => {
    const onCancel = vi.fn();
    render(
      <Step2Progress
        stages={{}}
        jobId="job-1"
        error={null}
        onCancel={onCancel}
        onBack={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Cancel"));
    // wait microtask
    await new Promise((r) => setTimeout(r, 0));
    expect(onCancel).toHaveBeenCalled();
  });

  it("renders error banner and Back button on error", () => {
    const onBack = vi.fn();
    render(
      <Step2Progress
        stages={{}}
        jobId="job-1"
        error={{ message: "no sources", hint: "try a different URL" }}
        onCancel={() => {}}
        onBack={onBack}
      />,
    );
    expect(screen.getByText("no sources")).toBeInTheDocument();
    expect(screen.getByText("try a different URL")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Back to inputs"));
    expect(onBack).toHaveBeenCalled();
  });
});
```

- [ ] **Step 7.3: Wire ExtractPage to transition into Step 2 + handle stage events**

Replace `packages/web/src/routes/ExtractPage.tsx`:
```tsx
import { useCallback, useEffect, useState } from "react";

import { getConfig, type Config } from "../api/config";
import { startExtract, type PackProposal } from "../api/extract";
import { Step1Inputs, type Step1State } from "../components/extract/Step1Inputs";
import { Step2Progress } from "../components/extract/Step2Progress";
import { useExtractJob } from "../hooks/useExtractJob";

type Step = 1 | 2 | 3;

interface StageState { status: "pending" | "running" | "done" | "failed"; message?: string; }

const STAGE_ORDER = ["fetching", "cleaning", "analyzing", "proposing"] as const;

export function ExtractPage(): JSX.Element {
  const [config, setConfig] = useState<Config | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [state, setState] = useState<Step1State>({
    urls: [""], files: [], slug: "", name: "", author: "",
    provider: "anthropic", model: "",
  });
  const [jobId, setJobId] = useState<string | null>(null);
  const [stages, setStages] = useState<Record<string, StageState>>({});
  const [proposal, setProposal] = useState<PackProposal | null>(null);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);

  useEffect(() => {
    getConfig().then(setConfig).catch((e: Error) => setConfigError(e.message));
  }, []);

  const onStage = useCallback((name: string, message: string, _progress: number) => {
    setStages((prev) => {
      const next = { ...prev, [name]: { status: "running" as const, message } };
      // Mark prior stages as done
      const idx = STAGE_ORDER.indexOf(name as typeof STAGE_ORDER[number]);
      for (let i = 0; i < idx; i++) {
        const prior = STAGE_ORDER[i];
        if (next[prior]?.status !== "done") next[prior] = { status: "done", message: next[prior]?.message };
      }
      return next;
    });
  }, []);

  const onComplete = useCallback((result: PackProposal) => {
    setStages((prev) => {
      const next = { ...prev };
      for (const s of STAGE_ORDER) next[s] = { status: "done", message: next[s]?.message };
      return next;
    });
    setProposal(result);
    setStep(3);
  }, []);

  const onErrorEvt = useCallback((code: string, message: string, hint?: string) => {
    setError({ message: `[${code}] ${message}`, hint });
    setStages((prev) => {
      const next = { ...prev };
      // Whichever stage was running becomes failed
      for (const s of STAGE_ORDER) {
        if (next[s]?.status === "running") next[s] = { status: "failed", message: next[s]?.message };
      }
      return next;
    });
  }, []);

  useExtractJob(jobId, { onStage, onComplete, onError: onErrorEvt });

  if (configError) return <div className="p-8 text-red-400">Error: {configError}</div>;
  if (!config) return <div className="p-8 text-slate-500">Loading…</div>;

  const onAnalyze = async (): Promise<void> => {
    setError(null);
    setStages({});
    setProposal(null);
    try {
      const cleanUrls = state.urls.filter((u) => u.startsWith("http"));
      const { job_id } = await startExtract({
        urls: cleanUrls,
        files: state.files,
        pack_meta: { slug: state.slug, name: state.name, author: state.author },
        provider: state.provider,
        model: state.model,
      });
      setJobId(job_id);
      setStep(2);
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : String(e) });
    }
  };

  const backToStep1 = (): void => {
    setStep(1);
    setJobId(null);
    setProposal(null);
    setError(null);
    setStages({});
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-slate-100 mb-6">Extract from URLs</h1>
      {step === 1 && (
        <Step1Inputs state={state} config={config} onChange={setState} onAnalyze={onAnalyze} />
      )}
      {step === 2 && jobId && (
        <Step2Progress stages={stages} jobId={jobId} error={error} onCancel={backToStep1} onBack={backToStep1} />
      )}
      {step === 3 && proposal && (
        <div className="text-slate-300">
          <p>Step 3 review UI lands in Task 8.</p>
          <pre className="text-xs bg-slate-950 p-3 rounded mt-3 max-w-3xl overflow-auto">
            {JSON.stringify(proposal.analysis, null, 2)}
          </pre>
          <button onClick={backToStep1} className="mt-3 px-3 py-1.5 text-sm border border-slate-700 rounded text-slate-300 hover:bg-slate-800">
            Back to Step 1
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7.4: Run + commit**

```bash
cd packages/web
pnpm test
pnpm lint
pnpm build
cd ../..
git add packages/web
git commit -m "$(cat <<'EOF'
feat(web): Extract Step 2 progress UI + useExtractJob hook

useExtractJob wraps EventSource for /api/jobs/<id>/events with
typed handlers (onStage/onComplete/onError) and closes on terminal
event. Step2Progress renders a 4-row vertical stepper (fetching →
cleaning → analyzing → proposing), updates icons + messages as
stage events arrive, shows an error banner with the envelope's
hint on failure. ExtractPage wires the state machine: Analyze
starts the job, transitions to Step 2; complete advances to a
temporary Step 3 stub (review UI lands in Task 8); cancel/back
return to Step 1 preserving inputs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8 — Frontend: Step 3 review UI

**Files:**
- Create: `packages/web/src/components/extract/Step3Review.tsx`
- Create: `packages/web/src/components/extract/review/PersonaReview.tsx`
- Create: `packages/web/src/components/extract/review/BanishedReview.tsx`
- Create: `packages/web/src/components/extract/review/ExceptionsReview.tsx`
- Create: `packages/web/src/components/extract/review/StyleGuideReview.tsx`
- Create: `packages/web/src/components/extract/review/SampleCard.tsx`
- Create: `packages/web/src/components/extract/review/PopCultureReview.tsx`
- Create: `packages/web/tests/components/extract/Step3Review.test.tsx`
- Modify: `packages/web/src/routes/ExtractPage.tsx` (use Step3Review instead of the stub)

- [ ] **Step 8.1: Section components**

`packages/web/src/components/extract/review/PersonaReview.tsx`:
```tsx
interface PersonaReviewProps {
  identity: string;
  oneLine: string;
  onChange: (next: { identity: string; oneLine: string }) => void;
}

export function PersonaReview({ identity, oneLine, onChange }: PersonaReviewProps): JSX.Element {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-100">Persona</h2>
      <div>
        <label htmlFor="pr-id" className="block text-sm font-medium text-slate-200 mb-1">Identity</label>
        <input id="pr-id" type="text" value={identity}
          onChange={(e) => onChange({ identity: e.target.value, oneLine })}
          className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100" />
      </div>
      <div>
        <label htmlFor="pr-ol" className="block text-sm font-medium text-slate-200 mb-1">One line</label>
        <input id="pr-ol" type="text" value={oneLine}
          onChange={(e) => onChange({ identity, oneLine: e.target.value })}
          className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100" />
      </div>
    </section>
  );
}
```

`packages/web/src/components/extract/review/BanishedReview.tsx`:
```tsx
import { TagInput } from "../../manifest/TagInput";
import type { BanishedWord, BanishedPhrase } from "../../../api/extract";

interface BanishedReviewProps {
  words: BanishedWord[];
  phrases: BanishedPhrase[];
  onWordsChange: (next: BanishedWord[]) => void;
  onPhrasesChange: (next: BanishedPhrase[]) => void;
}

export function BanishedReview({ words, phrases, onWordsChange, onPhrasesChange }: BanishedReviewProps): JSX.Element {
  const wordStrings = words.map((w) => w.frequency > 0 ? `${w.word} (${w.frequency}×)` : w.word);
  const phraseStrings = phrases.map((p) => p.frequency > 0 ? `${p.phrase} (${p.frequency}×)` : p.phrase);

  const setWords = (next: string[]): void => {
    onWordsChange(next.map((s) => ({ word: s.replace(/\s*\(\d+×\)\s*$/, ""), frequency: 0 })));
  };
  const setPhrases = (next: string[]): void => {
    onPhrasesChange(next.map((s) => ({ phrase: s.replace(/\s*\(\d+×\)\s*$/, ""), frequency: 0 })));
  };

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-slate-100">Banished</h2>
      <TagInput label="Words" htmlId="br-words" values={wordStrings} onChange={setWords} />
      <TagInput label="Phrases" htmlId="br-phrases" values={phraseStrings} onChange={setPhrases} />
    </section>
  );
}
```

`packages/web/src/components/extract/review/ExceptionsReview.tsx`:
```tsx
import { ExceptionsTable } from "../../manifest/ExceptionsTable";
import type { PermittedExceptionProposal } from "../../../api/extract";

interface ExceptionsReviewProps {
  values: PermittedExceptionProposal[];
  onChange: (next: PermittedExceptionProposal[]) => void;
}

export function ExceptionsReview({ values, onChange }: ExceptionsReviewProps): JSX.Element {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-100">Permitted exceptions</h2>
      <ExceptionsTable values={values} onChange={onChange} />
    </section>
  );
}
```

`packages/web/src/components/extract/review/StyleGuideReview.tsx`:
```tsx
interface StyleGuideReviewProps {
  markdown: string;
  onChange: (next: string) => void;
}

export function StyleGuideReview({ markdown, onChange }: StyleGuideReviewProps): JSX.Element {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-100">Style guide draft</h2>
      <p className="text-slate-500 text-xs">Appended to the pack's style-guide.md after Save.</p>
      <textarea
        value={markdown}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-64 bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 font-mono text-sm"
        aria-label="Style guide markdown"
      />
    </section>
  );
}
```

(Plain textarea — Tiptap reuse adds complexity for a single-shot edit. Textarea is fine for this phase; the user can edit in the ManifestForm afterward with Phase 3's Tiptap for the full style-guide.)

`packages/web/src/components/extract/review/SampleCard.tsx`:
```tsx
import { useState } from "react";

import type { ProposedSample } from "../../../api/extract";

interface SampleCardProps {
  sample: ProposedSample;
  selected: boolean;
  onToggle: () => void;
  onExcerptChange: (next: string) => void;
}

export function SampleCard({ sample, selected, onToggle, onExcerptChange }: SampleCardProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const preview = sample.excerpt.length > 200 ? sample.excerpt.slice(0, 200) + "…" : sample.excerpt;
  return (
    <div className={`bg-slate-900 border rounded p-3 ${selected ? "border-emerald-700" : "border-slate-800"}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Include sample ${sample.rank}`}
          className="mt-1"
        />
        <div className="flex-1 min-w-0">
          {expanded ? (
            <textarea
              value={sample.excerpt}
              onChange={(e) => onExcerptChange(e.target.value)}
              className="w-full h-32 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 text-sm"
            />
          ) : (
            <p className="text-slate-200 text-sm whitespace-pre-wrap">{preview}</p>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 text-xs text-emerald-400 hover:text-emerald-300"
          >
            {expanded ? "Collapse" : "Edit / show more"}
          </button>
          {sample.source_location && (
            <a href={sample.source_location} target="_blank" rel="noreferrer"
              className="block mt-1 text-xs text-slate-500 hover:text-slate-300 truncate">
              {sample.source_location}
            </a>
          )}
          {sample.why && <p className="text-slate-400 text-xs mt-1 italic">{sample.why}</p>}
        </div>
      </div>
    </div>
  );
}
```

`packages/web/src/components/extract/review/PopCultureReview.tsx`:
```tsx
import { TagInput } from "../../manifest/TagInput";

interface PopCultureReviewProps {
  allowed: string[];
  banned: string[];
  onAllowedChange: (next: string[]) => void;
  onBannedChange: (next: string[]) => void;
}

export function PopCultureReview({ allowed, banned, onAllowedChange, onBannedChange }: PopCultureReviewProps): JSX.Element {
  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-slate-100">Pop culture</h2>
      <TagInput label="Allowed" htmlId="pcr-allowed" values={allowed} onChange={onAllowedChange} />
      <TagInput label="Banned" htmlId="pcr-banned" values={banned} onChange={onBannedChange} />
    </section>
  );
}
```

- [ ] **Step 8.2: Step3Review composing component**

`packages/web/src/components/extract/Step3Review.tsx`:
```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import type { AnalysisResult, PackProposal } from "../../api/extract";
import { saveFromAnalysis } from "../../api/extract";
import { BanishedReview } from "./review/BanishedReview";
import { ExceptionsReview } from "./review/ExceptionsReview";
import { PersonaReview } from "./review/PersonaReview";
import { PopCultureReview } from "./review/PopCultureReview";
import { SampleCard } from "./review/SampleCard";
import { StyleGuideReview } from "./review/StyleGuideReview";

interface Step3ReviewProps {
  proposal: PackProposal;
  packMeta: { slug: string; name: string; author: string };
  onBack: () => void;
}

export function Step3Review({ proposal, packMeta, onBack }: Step3ReviewProps): JSX.Element {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<AnalysisResult>(proposal.analysis);
  const [selected, setSelected] = useState<Set<number>>(
    new Set(proposal.analysis.samples.map((_, i) => i)),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceCount = proposal.sources.length;
  const wordCount = proposal.sources.reduce((sum, s) => sum + s.word_count, 0);

  const setAnalysisField = <K extends keyof AnalysisResult>(k: K, v: AnalysisResult[K]): void => {
    setDraft({ ...draft, [k]: v });
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      await saveFromAnalysis({
        slug: packMeta.slug,
        name: packMeta.name,
        author: packMeta.author,
        persona_identity: draft.persona_identity,
        persona_one_line: draft.persona_one_line,
        proposal: draft,
        selected_sample_indexes: Array.from(selected).sort((a, b) => a - b),
      });
      navigate(`/packs/${encodeURIComponent(packMeta.slug)}/manifest`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="bg-slate-900 border border-slate-800 rounded p-3 text-sm text-slate-300">
        {sourceCount} source(s) · {wordCount.toLocaleString()} words ·{" "}
        {proposal.model} · {proposal.elapsed_seconds.toFixed(1)}s ·
        ~${proposal.cost_usd.toFixed(4)}
      </div>

      <PersonaReview
        identity={draft.persona_identity}
        oneLine={draft.persona_one_line}
        onChange={({ identity, oneLine }) => setDraft({ ...draft, persona_identity: identity, persona_one_line: oneLine })}
      />

      <BanishedReview
        words={draft.banished_words}
        phrases={draft.banished_phrases}
        onWordsChange={(v) => setAnalysisField("banished_words", v)}
        onPhrasesChange={(v) => setAnalysisField("banished_phrases", v)}
      />

      <ExceptionsReview
        values={draft.permitted_exceptions}
        onChange={(v) => setAnalysisField("permitted_exceptions", v)}
      />

      <StyleGuideReview
        markdown={draft.style_guide_markdown}
        onChange={(v) => setAnalysisField("style_guide_markdown", v)}
      />

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-100">Samples</h2>
        <p className="text-slate-500 text-xs">Uncheck any you don't want to include.</p>
        <div className="space-y-3">
          {draft.samples.map((s, i) => (
            <SampleCard
              key={i}
              sample={s}
              selected={selected.has(i)}
              onToggle={() => {
                const next = new Set(selected);
                if (next.has(i)) next.delete(i); else next.add(i);
                setSelected(next);
              }}
              onExcerptChange={(text) => {
                const samples = draft.samples.map((ss, idx) => idx === i ? { ...ss, excerpt: text } : ss);
                setAnalysisField("samples", samples);
              }}
            />
          ))}
        </div>
      </section>

      <PopCultureReview
        allowed={draft.pop_culture_allowed}
        banned={draft.pop_culture_banned}
        onAllowedChange={(v) => setAnalysisField("pop_culture_allowed", v)}
        onBannedChange={(v) => setAnalysisField("pop_culture_banned", v)}
      />

      <section className="bg-slate-900 border border-slate-800 rounded p-3 text-sm text-slate-400">
        <strong>Bios:</strong> Kept from the <code>_template</code> placeholders. Edit them on the Bios tab after saving.
      </section>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="flex justify-between pt-4">
        <button
          type="button"
          onClick={onBack}
          className="px-3 py-1.5 text-sm border border-slate-700 text-slate-300 rounded hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Pack"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 8.3: Wire Step3Review into ExtractPage**

Edit `packages/web/src/routes/ExtractPage.tsx` — replace the `step === 3` stub with:
```tsx
{step === 3 && proposal && (
  <Step3Review
    proposal={proposal}
    packMeta={{ slug: state.slug, name: state.name, author: state.author }}
    onBack={backToStep1}
  />
)}
```

And add the import:
```tsx
import { Step3Review } from "../components/extract/Step3Review";
```

- [ ] **Step 8.4: Step3Review test**

`packages/web/tests/components/extract/Step3Review.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PackProposal } from "../../../src/api/extract";
import { Step3Review } from "../../../src/components/extract/Step3Review";

const mockSave = vi.hoisted(() => vi.fn());
vi.mock("../../../src/api/extract", async () => {
  const actual = await vi.importActual<typeof import("../../../src/api/extract")>("../../../src/api/extract");
  return { ...actual, saveFromAnalysis: mockSave };
});

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

beforeEach(() => { mockSave.mockReset(); mockNavigate.mockReset(); });
afterEach(() => {});

const sampleProposal: PackProposal = {
  analysis: {
    persona_identity: "The Builder",
    persona_one_line: "Ships often.",
    banished_words: [{ word: "delve", frequency: 3 }],
    banished_phrases: [],
    permitted_exceptions: [],
    style_guide_markdown: "prose",
    samples: [
      { excerpt: "first sample", source_location: "https://e.com/a", why: "good", rank: 1 },
      { excerpt: "second sample", source_location: "https://e.com/b", why: "ok", rank: 2 },
    ],
    pop_culture_allowed: ["Marvel"],
    pop_culture_banned: [],
  },
  sources: [{ kind: "url", location: "https://e.com/a", bytes: 1000, word_count: 200, succeeded: true, error: null }],
  model: "mock-1", provider: "anthropic",
  cost_usd: 0.001, input_tokens: 100, output_tokens: 50, elapsed_seconds: 1.5,
};

describe("Step3Review", () => {
  it("renders all sections from the proposal", () => {
    render(
      <MemoryRouter>
        <Step3Review proposal={sampleProposal} packMeta={{ slug: "alice", name: "Alice", author: "A" }} onBack={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByDisplayValue("The Builder")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Ships often.")).toBeInTheDocument();
    expect(screen.getByText(/first sample/)).toBeInTheDocument();
    expect(screen.getByText(/second sample/)).toBeInTheDocument();
  });

  it("toggles a sample off and saves with the right selection", async () => {
    mockSave.mockResolvedValue({ slug: "alice" });
    render(
      <MemoryRouter>
        <Step3Review proposal={sampleProposal} packMeta={{ slug: "alice", name: "Alice", author: "A" }} onBack={() => {}} />
      </MemoryRouter>,
    );
    // Toggle the second sample's checkbox off
    fireEvent.click(screen.getByLabelText("Include sample 2"));
    fireEvent.click(screen.getByText("Save Pack"));
    await waitFor(() => {
      expect(mockSave).toHaveBeenCalled();
    });
    const arg = mockSave.mock.calls[0][0];
    expect(arg.selected_sample_indexes).toEqual([0]);
    expect(mockNavigate).toHaveBeenCalledWith("/packs/alice/manifest");
  });
});
```

- [ ] **Step 8.5: Run + commit**

```bash
cd packages/web
pnpm test
pnpm lint
pnpm build
cd ../..
git add packages/web
git commit -m "$(cat <<'EOF'
feat(web): Extract Step 3 review UI

Step3Review composes six section components: PersonaReview (text
inputs), BanishedReview (TagInput reuse, displays frequency
counts), ExceptionsReview (ExceptionsTable reuse), StyleGuideReview
(plain textarea — Tiptap reuse deferred since the user can re-edit
on the ManifestForm afterward), SampleCard grid (checkbox per
proposed sample, collapsible excerpt editor), PopCultureReview
(TagInput reuse). Save Pack POSTs to /api/packs/from-analysis and
navigates to the new pack's Manifest tab. Bios section is a
read-only note.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9 — Playwright e2e + README + PR

**Files:**
- Create: `e2e/extract-flow.spec.ts`
- Modify: `README.md` (add "Extract a pack from URLs" note)
- Modify: `playwright.config.ts` (may need to extend backend env with `MYVOICE_MOCK_OUTPUT_JSON`)

- [ ] **Step 9.1: Extend playwright.config.ts**

The mock provider already accepts `MYVOICE_MOCK_OUTPUT_JSON`. Update the backend env line in `playwright.config.ts` to set a JSON output so the Analyze call in the test returns a valid AnalysisResult:

Edit `playwright.config.ts` — replace the `backendEnv` constant:
```typescript
const MOCK_JSON = JSON.stringify({
  persona_identity: "The E2E Tester",
  persona_one_line: "Verifies extract end to end.",
  banished_words: [{ word: "delve", frequency: 2 }],
  banished_phrases: [],
  permitted_exceptions: [],
  style_guide_markdown: "E2E style guide prose.",
  samples: [
    { excerpt: "An e2e sample excerpt for verification.", source_location: "https://e.com/", why: "matches voice", rank: 1 },
  ],
  pop_culture_allowed: ["Marvel"],
  pop_culture_banned: [],
});

const backendEnv = [
  "MYVOICE_TEST_PROVIDER=mock",
  "MYVOICE_MOCK_OUTPUT='Plan. Build. Ship.'",
  `MYVOICE_MOCK_OUTPUT_JSON='${MOCK_JSON.replace(/'/g, "\\'")}'`,
  `MYVOICE_CONFIG_PATH=${E2E_CONFIG}`,
  `MYVOICE_PACKS_ROOT=${E2E_PACKS}`,
].join(" ");
```

The Extract test also needs a deterministic HTTP fetch. The simplest approach without adding a fake-fetch toggle to the backend is to use a public URL that returns fast small HTML — but that's flaky. Use a tiny inline option: add a tag in the URL string (e.g. `http://localhost:7878/api/health`) and configure fetch to allow same-host... no, that's brittle too. Easiest: have the test use a **file upload** instead of URL, so fetch is never exercised. The mock still returns the canned JSON regardless.

- [ ] **Step 9.2: extract-flow.spec.ts**

`e2e/extract-flow.spec.ts`:
```typescript
import { test, expect } from "@playwright/test";

const FIXTURE_TEXT = "This is some fixture markdown content for the extract end-to-end test. ".repeat(20);
const FIXTURE_B64 = Buffer.from(FIXTURE_TEXT, "utf-8").toString("base64");

test("extract flow: upload file → analyze → review → save pack", async ({ page }) => {
  // Set Anthropic key in Settings
  await page.goto("/settings");
  await page.getByLabel(/Anthropic API key/i).fill("sk-mock");
  await page.getByRole("button", { name: /Save changes/i }).click();
  await expect(page.getByRole("button", { name: /Save changes/i })).toBeDisabled({ timeout: 5000 });

  // Go to Extract
  await page.click("text=Extract from URLs");
  await expect(page.getByRole("heading", { name: /Extract from URLs/i })).toBeVisible();

  // Upload a fixture via the hidden file input. Playwright supports setInputFiles on hidden inputs.
  const stamp = Date.now().toString();
  const slug = `e2e-x-${stamp}`;
  await page.setInputFiles('input[aria-label="Choose files"]', {
    name: "fixture.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(FIXTURE_TEXT, "utf-8"),
  });

  // Fill pack details (slug auto-derives from name when slug is empty; set name first)
  await page.getByLabel("Name").fill("E2E Extracted");
  await page.getByLabel("Slug").fill(slug);
  await page.getByLabel("Author").fill("E2E");

  // Wait for the model dropdown to populate
  await page.waitForFunction(
    () => {
      const sel = document.getElementById("ex-model") as HTMLSelectElement | null;
      return sel && sel.options.length > 0 && sel.options[0].value !== "";
    },
    { timeout: 15_000 },
  );

  // Click Analyze
  await page.getByRole("button", { name: /Analyze/i }).click();

  // Wait for Step 3 (Save Pack appears)
  await expect(page.getByRole("button", { name: /Save Pack/i })).toBeVisible({ timeout: 20_000 });

  // The proposed sample should be visible — toggle nothing, save as-is.
  await page.getByRole("button", { name: /Save Pack/i }).click();

  // Lands on /packs/<slug>/manifest
  await page.waitForURL(new RegExp(`/packs/${slug}`), { timeout: 10_000 });

  // Pack appears in sidebar
  await expect(page.locator(`text=${slug}`)).toBeVisible({ timeout: 5_000 });
});
```

- [ ] **Step 9.3: README update**

Edit `README.md` — append a short section near the Packs section:

```markdown
### Extract a pack from URLs

In the sidebar, click **Extract from URLs**. Paste one or more blog URLs (or drag in `.md` / `.txt` / `.docx` drafts), fill in the slug/name/author, pick a provider and model, and click **Analyze**. The LLM reads your corpus and proposes a complete pack: persona, banished words (with frequency counts), permitted exceptions, a style-guide draft, ranked sample excerpts, and pop-culture rules.

Review the proposal inline — every field is editable, each sample has a keep/drop checkbox — then click **Save Pack**. The new pack lands in `~/.myvoice/packs/<slug>/` with the proposal's data merged into the `_template` scaffold, ready to refine on the Manifest tab.
```

- [ ] **Step 9.4: Run all tests locally**

```bash
cd /Users/dbbaskette/Projects/myvoice
uv run pytest packages/api/tests -q
uv run ruff check packages/api
uv run mypy packages/api
cd packages/web && pnpm test && pnpm lint && pnpm build && cd ../..
cd packages/web && pnpm exec playwright test --reporter=line --config=../../playwright.config.ts && cd ../..
```

All must pass.

- [ ] **Step 9.5: Commit + push + PR**

```bash
git add e2e README.md playwright.config.ts
git commit -m "$(cat <<'EOF'
test(e2e): extract flow (upload → analyze → review → save); docs: README

Playwright spec exercises the Phase 6 flow against the mock-backed
backend: set Anthropic key, navigate to /extract, upload a markdown
fixture (avoids HTTP fetch flakiness), fill pack details, click
Analyze, wait for Step 3 review, click Save Pack, verify the new
pack appears at /packs/<slug>/manifest and in the sidebar. The
mock provider returns a canned AnalysisResult via
MYVOICE_MOCK_OUTPUT_JSON. README adds an "Extract a pack from URLs"
section in the Packs area.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin phase-6-extract-from-urls
gh pr create --title "Phase 6: Extract from URLs" --body "$(cat <<'EOF'
## Summary
- Structured output (json_schema) wired across all 3 LLM providers with invalid-JSON retry: Anthropic via tool-use, OpenAI via response_format, Google via response_schema (with a to_google_schema adapter for dialect quirks)
- Extractor pipeline: FETCH (async parallel httpx + retries + UA) → CLEAN (trafilatura HTML + utf8 text + python-docx) → ANALYZE (Jinja prompt + JSON Schema enforced) → PROPOSE (pure mapper to PackProposal with cost)
- POST /api/extract returns 202 + job_id, runs pipeline via existing JobRegistry + per-job SSE, completes with PackProposal
- POST /api/packs/from-analysis copies _template, patches manifest from proposal, writes selected samples, appends style_guide_markdown to style-guide.md, emits pack:created
- /extract 3-step wizard: Step1Inputs (URLs + file dropzone + cost estimate), Step2Progress (stage stepper + cancel), Step3Review (six editable sections + sample keep/drop)
- File uploads use base64-in-JSON (5 MB per file, 10 files max, 50 MB total)
- MockProvider extended with MYVOICE_MOCK_OUTPUT_JSON for tests + e2e

After Phase 6, every v1 capability ships except items deferred from v1 in the parent design (sharing/export, registry, AI bio extraction, hosted SaaS, Homebrew/Tauri, WebSockets, Pencraft integration).

## Test plan
- [ ] uv run pytest passes
- [ ] uv run ruff check + mypy pass
- [ ] pnpm test + pnpm lint + pnpm build pass
- [ ] pnpm exec playwright test passes (extract-flow, pack-lifecycle, compose-rewrite, settings-keys)
- [ ] Manual: set real Anthropic key, paste a real blog URL, Analyze, edit a banished word in Review, Save Pack; verify pack lands in ~/.myvoice/packs/<slug>/ with sample files and appended style guide
EOF
)"
```

---

## Self-review

**Spec coverage:**
- §1.2 (structured output 3 providers + retry) → Task 1 ✓
- §1.3 (extractor modules) → Tasks 2/3/4/5 ✓
- §1.4 (HTTP routes) → Task 5 ✓
- §1.5 (from-analysis mechanics) → Task 5.4 ✓
- §1.6 (cancellation between stages) → Task 5.2 pipeline + Task 7 UI cancel ✓
- §1.7 (error codes) → Tasks 1 (analyze_invalid_json), 4 (extractor_no_sources), 5 (extract_invalid_request, file_too_large, too_many_files, slug_conflict) ✓
- §2.1 (state machine) → Task 7 ExtractPage ✓
- §2.2 (Step 1) → Task 6 ✓
- §2.3 (Step 2) → Task 7 ✓
- §2.4 (Step 3) → Task 8 ✓
- §2.5 (API clients + rates + useExtractJob) → Tasks 6 (extract.ts, rates.ts) + 7 (useExtractJob) ✓
- §3 (testing) → tests folded into each task ✓
- §4 (done-state) → Step 9.4 ✓
- §5 (PR sequence) → matches Tasks 1–9 ✓

**Placeholder scan:** none. Ellipses in narrative text are intentional, not in code blocks.

**Type consistency:** `AnalysisResult` shape matches between `extractor/models.py` (Task 4.1), `analysis.json` (generated from same model in 4.2), `from-analysis` request (Task 5.4), `api/extract.ts` (Task 6.1), `Step3Review` (Task 8). `PackProposal` likewise. `UploadedFile` defined in 3.2, used in 5.2 pipeline + 5.4 route. `useExtractJob` handler signatures (Task 7.1) match the events emitted by the SSE stream (Phase 4 shape).
