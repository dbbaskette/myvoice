# Phase 4 — Compose & test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn myvoice from a pack browser into a working tool — paste a draft, watch it stream back in the author's voice via Claude/OpenAI/Gemini, with lint feedback on both sides, then one-click save the rewrite as a new sample.

**Architecture:** Bottom-up by layer. LLM provider Protocol with 3 adapters → config backend → in-process JobRegistry + SSE → `/api/rewrite` (async) + `/api/compose` & `/api/lint` (sync) → Settings UI → Compose UI → polish + Playwright E2E. File watching folded in once SSE infra exists.

**Tech Stack:**
- Backend: FastAPI, Pydantic v2, `httpx`, `respx` (test), `watchfiles`, `anthropic`, `openai`, `google-generativeai`
- Frontend: React 18, Vite, React Router, Tailwind, CodeMirror 6 (existing), `react-diff-viewer-continued` (new), MSW (test), Vitest, Playwright
- Async: FastAPI BackgroundTasks + `asyncio.Event` for cancellation
- Streaming: SSE (`text/event-stream`)

**Spec:** [`docs/superpowers/specs/2026-05-22-phase-4-compose-and-test-design.md`](../specs/2026-05-22-phase-4-compose-and-test-design.md)

**Branch:** All work on `phase-4-compose-and-test`. Each task = 1 commit. Open one PR at the end.

---

## File Structure

### New backend files

```
packages/api/myvoice/
  llm/
    __init__.py
    base.py           # Protocol, ModelInfo, LLMResponse, StreamChunk
    exceptions.py     # ProviderError, ProviderMissingKey, ProviderRateLimit
    anthropic.py      # Anthropic adapter
    openai.py         # OpenAI adapter
    google.py         # Google adapter
    cost.py           # usd(provider, model, in_tokens, out_tokens) -> float
    rates.yaml        # static rate card + model allowlist
    rates.py          # load_rates(), cached
    registry.py       # get_provider(name, api_key) -> LLMProvider
  jobs/
    __init__.py
    models.py         # Job, StreamChunk for jobs, JobStatus enum
    registry.py       # JobRegistry singleton, LRU eviction, cancellation events
    events.py         # SSE event types + serialization helpers
  config.py           # Config Pydantic model, load_config(), save_config(), redact_keys()
  watch.py            # watchfiles task, pack:* event emitter
  api/
    config.py         # GET/PUT /api/config + /api/providers/{p}/models
    jobs.py           # GET/DELETE /api/jobs/{id} + /api/jobs/{id}/events SSE
    rewrite.py        # POST /api/rewrite
    compose.py        # POST /api/compose, POST /api/lint
    samples.py        # POST /api/packs/{slug}/samples
    events.py         # GET /api/events SSE
  test_helpers/
    __init__.py
    mock_provider.py  # MYVOICE_TEST_PROVIDER=mock — scripted streamer
```

### New backend test files

```
packages/api/tests/
  llm/
    __init__.py
    test_base.py          # contract test against MockProvider
    test_anthropic.py
    test_openai.py
    test_google.py
    test_cost.py
    test_registry.py
    recordings/           # opt-in real-API fixtures (gitignored, regenerate per release)
  jobs/
    __init__.py
    test_registry.py      # create/get/cancel/LRU/replay
  test_config.py          # load/save/atomic/redact/roundtrip
  test_watch.py           # watchfiles task fires pack:* events
  api/
    __init__.py
    test_config_route.py
    test_jobs_route.py    # SSE format + replay
    test_rewrite_route.py # async flow with mock provider
    test_compose_route.py # sync compose/lint
    test_samples_route.py
    test_events_route.py
  test_lint_positive.py   # 3 positive-hit detectors
```

### Modified backend files

```
packages/api/myvoice/
  server.py             # mount new routers; lifespan starts JobRegistry + watch task
  lint.py               # add LintHit (UTF-16 offsets) and positive-hit detectors alongside Violation
pyproject.toml          # add deps: anthropic, openai, google-generativeai, respx (dev), aiofiles
```

### New frontend files

```
packages/web/src/
  api/
    config.ts          # getConfig, putConfig, listModels
    jobs.ts            # getJob, cancelJob, openJobEvents(EventSource)
    rewrite.ts         # startRewrite
    compose.ts         # composePrompt, lintText
    samples.ts         # saveSample
    events.ts          # openGlobalEvents(EventSource)
  routes/
    SettingsPage.tsx   # replace stub with real form
    ComposePage.tsx    # new
  components/
    settings/
      KeysSection.tsx
      PackPathsSection.tsx
      ThemeSection.tsx
      DefaultsSection.tsx
      ServerSection.tsx
    compose/
      ControlsBar.tsx
      InputPane.tsx
      OutputPane.tsx
      ViewPromptModal.tsx
      SaveSampleDialog.tsx
      DiffView.tsx
      LintOverlay.tsx       # CodeMirror decoration overlay
      Receipt.tsx
  hooks/
    useEventStream.ts       # EventSource wrapper with reconnect
    useTheme.ts             # apply Tailwind dark class from config
    useDebouncedLint.ts
  styles/
    lint.css                # highlight color classes
```

### New frontend test files

```
packages/web/src/
  components/compose/*.test.tsx
  components/settings/*.test.tsx
  hooks/*.test.ts
e2e/
  compose-rewrite.spec.ts
  settings-keys.spec.ts
playwright.config.ts        # new
```

### Modified frontend files

```
packages/web/src/
  App.tsx                   # add /compose route
  components/AppShell.tsx   # surface Compose link in sidebar
```

---

## Task 1 — LLM provider abstraction + Anthropic adapter

**Files:**
- Create: `packages/api/myvoice/llm/{__init__.py, base.py, exceptions.py, anthropic.py, cost.py, rates.yaml, rates.py, registry.py}`
- Create: `packages/api/tests/llm/{__init__.py, test_base.py, test_anthropic.py, test_cost.py, test_registry.py}`
- Modify: `pyproject.toml` (add deps: `anthropic>=0.40`, `openai>=1.50`, `google-generativeai>=0.8`; dev: `respx>=0.21`)

- [ ] **Step 1.1: Add dependencies**

```bash
cd /Users/dbbaskette/Projects/myvoice
git checkout -b phase-4-compose-and-test
```

Edit `pyproject.toml` `dependencies` list to add at the end:
```
    "anthropic>=0.40",
    "openai>=1.50",
    "google-generativeai>=0.8",
    "aiofiles>=24",
```
And `dev` group:
```
    "respx>=0.21",
    "types-aiofiles>=24",
```

Then: `uv sync`

- [ ] **Step 1.2: Create base.py with Protocol + models**

`packages/api/myvoice/llm/__init__.py`:
```python
"""LLM provider abstraction."""
from myvoice.llm.base import LLMProvider, LLMResponse, ModelInfo, StreamChunk, Usage
from myvoice.llm.exceptions import (
    ProviderError,
    ProviderMissingKey,
    ProviderRateLimit,
)

__all__ = [
    "LLMProvider",
    "LLMResponse",
    "ModelInfo",
    "StreamChunk",
    "Usage",
    "ProviderError",
    "ProviderMissingKey",
    "ProviderRateLimit",
]
```

`packages/api/myvoice/llm/base.py`:
```python
"""Protocol + shared models for LLM providers."""
from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Literal, Protocol, runtime_checkable

from pydantic import BaseModel


class ModelInfo(BaseModel):
    id: str
    label: str
    context_window: int
    supports_streaming: bool


class Usage(BaseModel):
    input_tokens: int
    output_tokens: int
    finish_reason: Literal["stop", "length", "error"] = "stop"


class LLMResponse(BaseModel):
    text: str
    input_tokens: int
    output_tokens: int
    model: str
    finish_reason: Literal["stop", "length", "error"]


class StreamChunk(BaseModel):
    """One chunk from a streaming completion. Either delta or usage is populated."""
    delta: str = ""
    usage: Usage | None = None


@runtime_checkable
class LLMProvider(Protocol):
    name: str

    async def list_models(self) -> list[ModelInfo]: ...

    async def complete(
        self, *, model: str, prompt: str, json_schema: dict | None = None
    ) -> LLMResponse: ...

    def stream(self, *, model: str, prompt: str) -> AsyncIterator[StreamChunk]: ...
```

`packages/api/myvoice/llm/exceptions.py`:
```python
"""Typed exceptions for LLM provider failures."""
from __future__ import annotations


class ProviderError(Exception):
    """Generic provider failure. Subclasses carry semantic codes."""
    code: str = "provider_error"

    def __init__(self, message: str, *, hint: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.hint = hint


class ProviderMissingKey(ProviderError):
    code = "provider_missing_key"

    def __init__(self, provider: str) -> None:
        super().__init__(
            f"No API key configured for provider '{provider}'.",
            hint="Add the key in Settings.",
        )
        self.provider = provider


class ProviderRateLimit(ProviderError):
    code = "provider_rate_limit"

    def __init__(self, message: str, *, retry_after_seconds: int | None = None) -> None:
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds
```

- [ ] **Step 1.3: Create rates.yaml and loader**

`packages/api/myvoice/llm/rates.yaml`:
```yaml
# Static rate card. Update on each release. Prices in USD per 1M tokens.
# Source: vendor pricing pages as of 2026-05-22.
anthropic:
  claude-opus-4-7:
    label: "Claude Opus 4.7"
    input_per_million_usd: 15.00
    output_per_million_usd: 75.00
    context_window: 1000000
    supports_streaming: true
  claude-sonnet-4-6:
    label: "Claude Sonnet 4.6"
    input_per_million_usd: 3.00
    output_per_million_usd: 15.00
    context_window: 200000
    supports_streaming: true
  claude-haiku-4-5-20251001:
    label: "Claude Haiku 4.5"
    input_per_million_usd: 0.80
    output_per_million_usd: 4.00
    context_window: 200000
    supports_streaming: true
openai:
  gpt-5:
    label: "GPT-5"
    input_per_million_usd: 5.00
    output_per_million_usd: 15.00
    context_window: 400000
    supports_streaming: true
  gpt-5-mini:
    label: "GPT-5 Mini"
    input_per_million_usd: 0.50
    output_per_million_usd: 1.50
    context_window: 200000
    supports_streaming: true
google:
  gemini-2.5-pro:
    label: "Gemini 2.5 Pro"
    input_per_million_usd: 3.50
    output_per_million_usd: 10.50
    context_window: 2000000
    supports_streaming: true
  gemini-2.5-flash:
    label: "Gemini 2.5 Flash"
    input_per_million_usd: 0.30
    output_per_million_usd: 1.20
    context_window: 1000000
    supports_streaming: true
```

`packages/api/myvoice/llm/rates.py`:
```python
"""Load the static rate card bundled with the package."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import TypedDict

import yaml


class RateEntry(TypedDict):
    label: str
    input_per_million_usd: float
    output_per_million_usd: float
    context_window: int
    supports_streaming: bool


@lru_cache(maxsize=1)
def load_rates() -> dict[str, dict[str, RateEntry]]:
    path = Path(__file__).parent / "rates.yaml"
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def models_for(provider: str) -> dict[str, RateEntry]:
    return load_rates().get(provider, {})
```

- [ ] **Step 1.4: Write failing tests for cost calculator**

`packages/api/tests/llm/__init__.py`: empty file.

`packages/api/tests/llm/test_cost.py`:
```python
"""Cost calculator tests."""
from __future__ import annotations

import pytest

from myvoice.llm.cost import usd


def test_anthropic_sonnet_cost() -> None:
    # 1M input @ $3, 1M output @ $15 = $18 total
    assert usd("anthropic", "claude-sonnet-4-6", 1_000_000, 1_000_000) == pytest.approx(18.0)


def test_partial_token_cost() -> None:
    # 1k input @ $3/M = $0.003; 500 output @ $15/M = $0.0075
    assert usd("anthropic", "claude-sonnet-4-6", 1_000, 500) == pytest.approx(0.0105)


def test_unknown_model_returns_zero() -> None:
    assert usd("anthropic", "does-not-exist", 1000, 1000) == 0.0


def test_unknown_provider_returns_zero() -> None:
    assert usd("nope", "model", 1000, 1000) == 0.0
```

Run: `uv run pytest packages/api/tests/llm/test_cost.py -v`
Expected: FAIL — `usd` not defined.

- [ ] **Step 1.5: Implement cost.py**

`packages/api/myvoice/llm/cost.py`:
```python
"""Token → USD cost calculation. Pure function, table-driven."""
from __future__ import annotations

from myvoice.llm.rates import models_for


def usd(provider: str, model: str, input_tokens: int, output_tokens: int) -> float:
    """Approximate cost in USD. Returns 0 for unknown provider/model."""
    entry = models_for(provider).get(model)
    if entry is None:
        return 0.0
    in_cost = (input_tokens / 1_000_000) * entry["input_per_million_usd"]
    out_cost = (output_tokens / 1_000_000) * entry["output_per_million_usd"]
    return round(in_cost + out_cost, 6)
```

Run: `uv run pytest packages/api/tests/llm/test_cost.py -v`
Expected: PASS (4 passed).

- [ ] **Step 1.6: Write failing Anthropic adapter tests**

`packages/api/tests/llm/test_anthropic.py`:
```python
"""Anthropic adapter — mocked HTTP via respx."""
from __future__ import annotations

import json

import httpx
import pytest
import respx

from myvoice.llm.anthropic import AnthropicProvider
from myvoice.llm.exceptions import ProviderMissingKey, ProviderRateLimit


@pytest.mark.asyncio
async def test_missing_key_raises_on_init() -> None:
    with pytest.raises(ProviderMissingKey):
        AnthropicProvider(api_key="")


@pytest.mark.asyncio
@respx.mock
async def test_complete_happy_path() -> None:
    provider = AnthropicProvider(api_key="sk-test")
    respx.post("https://api.anthropic.com/v1/messages").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "msg_1",
                "type": "message",
                "role": "assistant",
                "content": [{"type": "text", "text": "Hello there."}],
                "model": "claude-sonnet-4-6",
                "stop_reason": "end_turn",
                "usage": {"input_tokens": 12, "output_tokens": 4},
            },
        )
    )
    resp = await provider.complete(model="claude-sonnet-4-6", prompt="Hi")
    assert resp.text == "Hello there."
    assert resp.input_tokens == 12
    assert resp.output_tokens == 4
    assert resp.model == "claude-sonnet-4-6"
    assert resp.finish_reason == "stop"


@pytest.mark.asyncio
@respx.mock
async def test_rate_limit_maps_to_typed_error() -> None:
    provider = AnthropicProvider(api_key="sk-test")
    respx.post("https://api.anthropic.com/v1/messages").mock(
        return_value=httpx.Response(429, headers={"retry-after": "30"}, json={"error": {"message": "rate limit"}})
    )
    with pytest.raises(ProviderRateLimit) as exc:
        await provider.complete(model="claude-sonnet-4-6", prompt="Hi")
    assert exc.value.retry_after_seconds == 30


@pytest.mark.asyncio
@respx.mock
async def test_stream_yields_deltas_and_final_usage() -> None:
    provider = AnthropicProvider(api_key="sk-test")

    # Anthropic streams as SSE: event lines + data lines.
    sse_body = (
        'event: message_start\n'
        'data: {"type":"message_start","message":{"id":"m","model":"claude-sonnet-4-6","usage":{"input_tokens":10,"output_tokens":0}}}\n\n'
        'event: content_block_delta\n'
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n\n'
        'event: content_block_delta\n'
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" world"}}\n\n'
        'event: message_delta\n'
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}\n\n'
        'event: message_stop\n'
        'data: {"type":"message_stop"}\n\n'
    )
    respx.post("https://api.anthropic.com/v1/messages").mock(
        return_value=httpx.Response(200, content=sse_body, headers={"content-type": "text/event-stream"})
    )

    chunks: list = []
    async for c in provider.stream(model="claude-sonnet-4-6", prompt="Hi"):
        chunks.append(c)

    deltas = [c.delta for c in chunks if c.delta]
    assert "".join(deltas) == "Hello world"
    final = next(c for c in chunks if c.usage is not None)
    assert final.usage.input_tokens == 10
    assert final.usage.output_tokens == 2
    assert final.usage.finish_reason == "stop"


@pytest.mark.asyncio
@respx.mock
async def test_list_models_returns_known_set() -> None:
    provider = AnthropicProvider(api_key="sk-test")
    respx.get("https://api.anthropic.com/v1/models").mock(
        return_value=httpx.Response(
            200,
            json={"data": [
                {"id": "claude-opus-4-7", "display_name": "Claude Opus 4.7"},
                {"id": "claude-sonnet-4-6", "display_name": "Claude Sonnet 4.6"},
            ]},
        )
    )
    models = await provider.list_models()
    ids = [m.id for m in models]
    assert "claude-sonnet-4-6" in ids
    # rate-card metadata is preserved (context window from rates.yaml)
    sonnet = next(m for m in models if m.id == "claude-sonnet-4-6")
    assert sonnet.context_window == 200_000
```

Run: `uv run pytest packages/api/tests/llm/test_anthropic.py -v`
Expected: FAIL — `AnthropicProvider` missing.

- [ ] **Step 1.7: Implement Anthropic adapter**

`packages/api/myvoice/llm/anthropic.py`:
```python
"""Anthropic Messages API adapter — uses httpx directly (not the SDK) for simpler streaming."""
from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx

from myvoice.llm.base import LLMResponse, ModelInfo, StreamChunk, Usage
from myvoice.llm.exceptions import ProviderError, ProviderMissingKey, ProviderRateLimit
from myvoice.llm.rates import models_for

_BASE_URL = "https://api.anthropic.com/v1"
_API_VERSION = "2023-06-01"


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise ProviderMissingKey("anthropic")
        self._api_key = api_key
        self._headers = {
            "x-api-key": api_key,
            "anthropic-version": _API_VERSION,
            "content-type": "application/json",
        }

    async def list_models(self) -> list[ModelInfo]:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(f"{_BASE_URL}/models", headers=self._headers)
        if r.status_code == 401:
            raise ProviderMissingKey("anthropic")
        if r.status_code >= 400:
            raise ProviderError(f"anthropic list_models {r.status_code}: {r.text}")
        rates = models_for("anthropic")
        result: list[ModelInfo] = []
        for m in r.json().get("data", []):
            rate = rates.get(m["id"], {})
            result.append(ModelInfo(
                id=m["id"],
                label=rate.get("label") or m.get("display_name") or m["id"],
                context_window=int(rate.get("context_window") or 200_000),
                supports_streaming=bool(rate.get("supports_streaming", True)),
            ))
        return result

    async def complete(
        self, *, model: str, prompt: str, json_schema: dict | None = None
    ) -> LLMResponse:
        body = {
            "model": model,
            "max_tokens": 4096,
            "messages": [{"role": "user", "content": prompt}],
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.post(f"{_BASE_URL}/messages", headers=self._headers, json=body)
        self._raise_for_status(r)
        data = r.json()
        text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
        usage = data.get("usage", {})
        return LLMResponse(
            text=text,
            input_tokens=int(usage.get("input_tokens", 0)),
            output_tokens=int(usage.get("output_tokens", 0)),
            model=data.get("model", model),
            finish_reason=_map_stop_reason(data.get("stop_reason")),
        )

    async def stream(self, *, model: str, prompt: str) -> AsyncIterator[StreamChunk]:
        body = {
            "model": model,
            "max_tokens": 4096,
            "stream": True,
            "messages": [{"role": "user", "content": prompt}],
        }
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST", f"{_BASE_URL}/messages", headers=self._headers, json=body
            ) as r:
                if r.status_code >= 400:
                    body_text = await r.aread()
                    self._raise_for_response(r.status_code, body_text.decode(), r.headers)
                input_tokens = 0
                output_tokens = 0
                finish_reason = "stop"
                async for line in r.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    payload = line[5:].strip()
                    if not payload:
                        continue
                    evt = json.loads(payload)
                    t = evt.get("type")
                    if t == "message_start":
                        input_tokens = evt.get("message", {}).get("usage", {}).get("input_tokens", 0)
                    elif t == "content_block_delta":
                        delta = evt.get("delta", {}).get("text", "")
                        if delta:
                            yield StreamChunk(delta=delta)
                    elif t == "message_delta":
                        usage = evt.get("usage", {})
                        if "output_tokens" in usage:
                            output_tokens = usage["output_tokens"]
                        stop = evt.get("delta", {}).get("stop_reason")
                        if stop:
                            finish_reason = _map_stop_reason(stop)
                yield StreamChunk(
                    usage=Usage(
                        input_tokens=input_tokens,
                        output_tokens=output_tokens,
                        finish_reason=finish_reason,
                    )
                )

    def _raise_for_status(self, r: httpx.Response) -> None:
        if r.status_code < 400:
            return
        self._raise_for_response(r.status_code, r.text, r.headers)

    def _raise_for_response(self, status: int, body: str, headers) -> None:
        if status == 401:
            raise ProviderMissingKey("anthropic")
        if status == 429:
            retry = headers.get("retry-after")
            raise ProviderRateLimit(
                f"Anthropic rate limit: {body[:200]}",
                retry_after_seconds=int(retry) if retry and retry.isdigit() else None,
            )
        raise ProviderError(f"anthropic {status}: {body[:500]}")


def _map_stop_reason(reason: str | None) -> str:
    if reason in (None, "end_turn", "stop_sequence"):
        return "stop"
    if reason == "max_tokens":
        return "length"
    return "error"
```

Run: `uv run pytest packages/api/tests/llm/test_anthropic.py -v`
Expected: PASS (5 passed).

- [ ] **Step 1.8: Create registry**

`packages/api/myvoice/llm/registry.py`:
```python
"""Resolve a provider name + api key to an LLMProvider instance."""
from __future__ import annotations

from myvoice.llm.anthropic import AnthropicProvider
from myvoice.llm.base import LLMProvider
from myvoice.llm.exceptions import ProviderMissingKey, ProviderError

_FACTORIES = {
    "anthropic": AnthropicProvider,
    # OpenAI, Google added in Tasks 2 & 3
}


def get_provider(name: str, api_key: str) -> LLMProvider:
    if name not in _FACTORIES:
        raise ProviderError(f"Unknown provider: {name}")
    return _FACTORIES[name](api_key=api_key)
```

`packages/api/tests/llm/test_registry.py`:
```python
import pytest
from myvoice.llm.exceptions import ProviderError, ProviderMissingKey
from myvoice.llm.registry import get_provider


def test_unknown_provider_raises() -> None:
    with pytest.raises(ProviderError):
        get_provider("nope", "key")


def test_missing_key_raises() -> None:
    with pytest.raises(ProviderMissingKey):
        get_provider("anthropic", "")
```

Run: `uv run pytest packages/api/tests/llm/ -v`
Expected: all pass.

- [ ] **Step 1.9: Lint, type-check, commit**

```bash
uv run ruff check packages/api
uv run mypy packages/api/myvoice/llm
git add packages/api pyproject.toml uv.lock
git commit -m "feat(api): LLM provider abstraction + Anthropic adapter + rates.yaml + cost calc

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 — OpenAI adapter

**Files:**
- Create: `packages/api/myvoice/llm/openai.py`
- Create: `packages/api/tests/llm/test_openai.py`
- Modify: `packages/api/myvoice/llm/registry.py`

- [ ] **Step 2.1: Write failing OpenAI tests**

`packages/api/tests/llm/test_openai.py`:
```python
"""OpenAI adapter — mocked HTTP via respx."""
from __future__ import annotations

import json

import httpx
import pytest
import respx

from myvoice.llm.exceptions import ProviderMissingKey, ProviderRateLimit
from myvoice.llm.openai import OpenAIProvider


def test_missing_key_raises() -> None:
    with pytest.raises(ProviderMissingKey):
        OpenAIProvider(api_key="")


@pytest.mark.asyncio
@respx.mock
async def test_complete_happy_path() -> None:
    p = OpenAIProvider(api_key="sk-test")
    respx.post("https://api.openai.com/v1/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "c1",
                "model": "gpt-5",
                "choices": [{"message": {"content": "Hi!"}, "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 8, "completion_tokens": 2},
            },
        )
    )
    r = await p.complete(model="gpt-5", prompt="hi")
    assert r.text == "Hi!"
    assert r.input_tokens == 8
    assert r.output_tokens == 2
    assert r.finish_reason == "stop"


@pytest.mark.asyncio
@respx.mock
async def test_stream_yields_deltas() -> None:
    p = OpenAIProvider(api_key="sk-test")
    sse_body = (
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n'
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n'
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":2}}\n\n'
        'data: [DONE]\n\n'
    )
    respx.post("https://api.openai.com/v1/chat/completions").mock(
        return_value=httpx.Response(200, content=sse_body, headers={"content-type": "text/event-stream"})
    )
    deltas = []
    usage = None
    async for c in p.stream(model="gpt-5", prompt="hi"):
        if c.delta:
            deltas.append(c.delta)
        if c.usage is not None:
            usage = c.usage
    assert "".join(deltas) == "Hello"
    assert usage is not None and usage.output_tokens == 2


@pytest.mark.asyncio
@respx.mock
async def test_rate_limit_maps() -> None:
    p = OpenAIProvider(api_key="sk-test")
    respx.post("https://api.openai.com/v1/chat/completions").mock(
        return_value=httpx.Response(429, headers={"retry-after": "12"}, json={"error": {"message": "rl"}})
    )
    with pytest.raises(ProviderRateLimit) as e:
        await p.complete(model="gpt-5", prompt="hi")
    assert e.value.retry_after_seconds == 12


@pytest.mark.asyncio
@respx.mock
async def test_list_models() -> None:
    p = OpenAIProvider(api_key="sk-test")
    respx.get("https://api.openai.com/v1/models").mock(
        return_value=httpx.Response(200, json={"data": [{"id": "gpt-5"}, {"id": "gpt-5-mini"}, {"id": "dall-e-3"}]})
    )
    models = await p.list_models()
    ids = [m.id for m in models]
    assert "gpt-5" in ids
    assert "gpt-5-mini" in ids
    assert "dall-e-3" not in ids  # filtered to chat-capable allowlist
```

Run: `uv run pytest packages/api/tests/llm/test_openai.py -v`
Expected: FAIL — module missing.

- [ ] **Step 2.2: Implement OpenAI adapter**

`packages/api/myvoice/llm/openai.py`:
```python
"""OpenAI Chat Completions adapter — httpx directly."""
from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx

from myvoice.llm.base import LLMResponse, ModelInfo, StreamChunk, Usage
from myvoice.llm.exceptions import ProviderError, ProviderMissingKey, ProviderRateLimit
from myvoice.llm.rates import models_for

_BASE_URL = "https://api.openai.com/v1"


class OpenAIProvider:
    name = "openai"

    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise ProviderMissingKey("openai")
        self._api_key = api_key
        self._headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

    async def list_models(self) -> list[ModelInfo]:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(f"{_BASE_URL}/models", headers=self._headers)
        if r.status_code == 401:
            raise ProviderMissingKey("openai")
        if r.status_code >= 400:
            raise ProviderError(f"openai list_models {r.status_code}: {r.text}")
        rates = models_for("openai")
        # Filter to allowlist from rates.yaml (chat models we know about).
        result: list[ModelInfo] = []
        for m in r.json().get("data", []):
            rate = rates.get(m["id"])
            if rate is None:
                continue
            result.append(ModelInfo(
                id=m["id"],
                label=rate["label"],
                context_window=int(rate["context_window"]),
                supports_streaming=bool(rate["supports_streaming"]),
            ))
        return result

    async def complete(
        self, *, model: str, prompt: str, json_schema: dict | None = None
    ) -> LLMResponse:
        body: dict = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
        }
        if json_schema is not None:
            body["response_format"] = {"type": "json_schema", "json_schema": {"name": "result", "schema": json_schema, "strict": True}}
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.post(f"{_BASE_URL}/chat/completions", headers=self._headers, json=body)
        self._raise_for_status(r)
        data = r.json()
        choice = data["choices"][0]
        return LLMResponse(
            text=choice["message"]["content"] or "",
            input_tokens=int(data.get("usage", {}).get("prompt_tokens", 0)),
            output_tokens=int(data.get("usage", {}).get("completion_tokens", 0)),
            model=data.get("model", model),
            finish_reason=_map_finish(choice.get("finish_reason")),
        )

    async def stream(self, *, model: str, prompt: str) -> AsyncIterator[StreamChunk]:
        body = {
            "model": model,
            "stream": True,
            "stream_options": {"include_usage": True},
            "messages": [{"role": "user", "content": prompt}],
        }
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST", f"{_BASE_URL}/chat/completions", headers=self._headers, json=body
            ) as r:
                if r.status_code >= 400:
                    body_text = await r.aread()
                    self._raise_for_response(r.status_code, body_text.decode(), r.headers)
                in_tok = 0
                out_tok = 0
                finish = "stop"
                async for line in r.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    payload = line[5:].strip()
                    if not payload or payload == "[DONE]":
                        continue
                    evt = json.loads(payload)
                    choices = evt.get("choices", [])
                    if choices:
                        ch = choices[0]
                        delta = ch.get("delta", {}).get("content", "")
                        if delta:
                            yield StreamChunk(delta=delta)
                        fr = ch.get("finish_reason")
                        if fr:
                            finish = _map_finish(fr)
                    usage = evt.get("usage")
                    if usage:
                        in_tok = int(usage.get("prompt_tokens", in_tok))
                        out_tok = int(usage.get("completion_tokens", out_tok))
                yield StreamChunk(usage=Usage(input_tokens=in_tok, output_tokens=out_tok, finish_reason=finish))

    def _raise_for_status(self, r: httpx.Response) -> None:
        if r.status_code < 400:
            return
        self._raise_for_response(r.status_code, r.text, r.headers)

    def _raise_for_response(self, status: int, body: str, headers) -> None:
        if status == 401:
            raise ProviderMissingKey("openai")
        if status == 429:
            retry = headers.get("retry-after")
            raise ProviderRateLimit(
                f"OpenAI rate limit: {body[:200]}",
                retry_after_seconds=int(retry) if retry and retry.isdigit() else None,
            )
        raise ProviderError(f"openai {status}: {body[:500]}")


def _map_finish(reason: str | None) -> str:
    if reason in (None, "stop"):
        return "stop"
    if reason == "length":
        return "length"
    return "error"
```

Update `registry.py`:
```python
from myvoice.llm.openai import OpenAIProvider
# ...
_FACTORIES = {
    "anthropic": AnthropicProvider,
    "openai": OpenAIProvider,
}
```

Run: `uv run pytest packages/api/tests/llm/ -v`

- [ ] **Step 2.3: Commit**

```bash
uv run ruff check packages/api
uv run mypy packages/api/myvoice/llm
git add packages/api
git commit -m "feat(api): OpenAI adapter

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 — Google adapter (curated allowlist)

**Files:**
- Create: `packages/api/myvoice/llm/google.py`
- Create: `packages/api/tests/llm/test_google.py`
- Modify: `packages/api/myvoice/llm/registry.py`

- [ ] **Step 3.1: Write failing tests**

`packages/api/tests/llm/test_google.py`:
```python
from __future__ import annotations

import json

import httpx
import pytest
import respx

from myvoice.llm.exceptions import ProviderMissingKey, ProviderRateLimit
from myvoice.llm.google import GoogleProvider


def test_missing_key_raises() -> None:
    with pytest.raises(ProviderMissingKey):
        GoogleProvider(api_key="")


@pytest.mark.asyncio
async def test_list_models_from_rates() -> None:
    # Google list comes from the static rates.yaml allowlist — no HTTP needed.
    p = GoogleProvider(api_key="g-test")
    models = await p.list_models()
    ids = [m.id for m in models]
    assert "gemini-2.5-pro" in ids
    assert "gemini-2.5-flash" in ids


@pytest.mark.asyncio
@respx.mock
async def test_complete_happy_path() -> None:
    p = GoogleProvider(api_key="g-test")
    respx.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent"
    ).mock(return_value=httpx.Response(
        200,
        json={
            "candidates": [
                {"content": {"parts": [{"text": "Hello!"}]}, "finishReason": "STOP"}
            ],
            "usageMetadata": {"promptTokenCount": 5, "candidatesTokenCount": 2},
        },
    ))
    r = await p.complete(model="gemini-2.5-pro", prompt="hi")
    assert r.text == "Hello!"
    assert r.input_tokens == 5
    assert r.output_tokens == 2
    assert r.finish_reason == "stop"


@pytest.mark.asyncio
@respx.mock
async def test_stream_yields_deltas() -> None:
    p = GoogleProvider(api_key="g-test")
    # Google streams as a JSON array of objects, each a partial GenerateContentResponse.
    # We use the alt=sse mode to get newline-delimited json events.
    sse_body = (
        'data: {"candidates":[{"content":{"parts":[{"text":"Hel"}]}}]}\r\n\r\n'
        'data: {"candidates":[{"content":{"parts":[{"text":"lo"}]}}]}\r\n\r\n'
        'data: {"candidates":[{"finishReason":"STOP","content":{"parts":[]}}],'
        '"usageMetadata":{"promptTokenCount":3,"candidatesTokenCount":2}}\r\n\r\n'
    )
    respx.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:streamGenerateContent"
    ).mock(return_value=httpx.Response(
        200, content=sse_body, headers={"content-type": "text/event-stream"}
    ))
    deltas = []
    usage = None
    async for c in p.stream(model="gemini-2.5-pro", prompt="hi"):
        if c.delta:
            deltas.append(c.delta)
        if c.usage:
            usage = c.usage
    assert "".join(deltas) == "Hello"
    assert usage is not None and usage.output_tokens == 2
```

Run: `uv run pytest packages/api/tests/llm/test_google.py -v`
Expected: FAIL.

- [ ] **Step 3.2: Implement Google adapter**

`packages/api/myvoice/llm/google.py`:
```python
"""Google Gemini adapter (Generative Language API). Uses ?key=<api_key>."""
from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx

from myvoice.llm.base import LLMResponse, ModelInfo, StreamChunk, Usage
from myvoice.llm.exceptions import ProviderError, ProviderMissingKey, ProviderRateLimit
from myvoice.llm.rates import models_for

_BASE = "https://generativelanguage.googleapis.com/v1beta"


class GoogleProvider:
    name = "google"

    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise ProviderMissingKey("google")
        self._api_key = api_key

    async def list_models(self) -> list[ModelInfo]:
        # Curated allowlist from rates.yaml — google's public list endpoint is messy.
        result: list[ModelInfo] = []
        for mid, rate in models_for("google").items():
            result.append(ModelInfo(
                id=mid,
                label=rate["label"],
                context_window=int(rate["context_window"]),
                supports_streaming=bool(rate["supports_streaming"]),
            ))
        return result

    async def complete(
        self, *, model: str, prompt: str, json_schema: dict | None = None
    ) -> LLMResponse:
        url = f"{_BASE}/models/{model}:generateContent"
        body: dict = {"contents": [{"parts": [{"text": prompt}]}]}
        if json_schema is not None:
            body["generationConfig"] = {"response_mime_type": "application/json", "response_schema": json_schema}
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.post(url, params={"key": self._api_key}, json=body)
        self._raise_for_status(r)
        data = r.json()
        candidate = (data.get("candidates") or [{}])[0]
        parts = candidate.get("content", {}).get("parts", [])
        text = "".join(p.get("text", "") for p in parts)
        usage = data.get("usageMetadata", {})
        return LLMResponse(
            text=text,
            input_tokens=int(usage.get("promptTokenCount", 0)),
            output_tokens=int(usage.get("candidatesTokenCount", 0)),
            model=model,
            finish_reason=_map_finish(candidate.get("finishReason")),
        )

    async def stream(self, *, model: str, prompt: str) -> AsyncIterator[StreamChunk]:
        url = f"{_BASE}/models/{model}:streamGenerateContent"
        body = {"contents": [{"parts": [{"text": prompt}]}]}
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST", url, params={"key": self._api_key, "alt": "sse"}, json=body
            ) as r:
                if r.status_code >= 400:
                    body_text = await r.aread()
                    self._raise_for_response(r.status_code, body_text.decode(), r.headers)
                in_tok = 0
                out_tok = 0
                finish = "stop"
                async for line in r.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    payload = line[5:].strip()
                    if not payload:
                        continue
                    evt = json.loads(payload)
                    candidates = evt.get("candidates", [])
                    if candidates:
                        c = candidates[0]
                        for part in c.get("content", {}).get("parts", []):
                            text = part.get("text", "")
                            if text:
                                yield StreamChunk(delta=text)
                        fr = c.get("finishReason")
                        if fr:
                            finish = _map_finish(fr)
                    usage = evt.get("usageMetadata")
                    if usage:
                        in_tok = int(usage.get("promptTokenCount", in_tok))
                        out_tok = int(usage.get("candidatesTokenCount", out_tok))
                yield StreamChunk(usage=Usage(input_tokens=in_tok, output_tokens=out_tok, finish_reason=finish))

    def _raise_for_status(self, r: httpx.Response) -> None:
        if r.status_code < 400:
            return
        self._raise_for_response(r.status_code, r.text, r.headers)

    def _raise_for_response(self, status: int, body: str, headers) -> None:
        if status in (401, 403):
            raise ProviderMissingKey("google")
        if status == 429:
            retry = headers.get("retry-after")
            raise ProviderRateLimit(
                f"Google rate limit: {body[:200]}",
                retry_after_seconds=int(retry) if retry and retry.isdigit() else None,
            )
        raise ProviderError(f"google {status}: {body[:500]}")


def _map_finish(reason: str | None) -> str:
    if reason in (None, "STOP", "FINISH_REASON_UNSPECIFIED"):
        return "stop"
    if reason == "MAX_TOKENS":
        return "length"
    return "error"
```

Update `registry.py` to add Google.

Run: `uv run pytest packages/api/tests/llm/ -v` (all pass)

- [ ] **Step 3.3: Commit**

```bash
uv run ruff check packages/api && uv run mypy packages/api/myvoice/llm
git add packages/api
git commit -m "feat(api): Google Gemini adapter

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 — Config backend

**Files:**
- Create: `packages/api/myvoice/config.py`
- Create: `packages/api/myvoice/api/config.py`
- Create: `packages/api/tests/test_config.py`
- Create: `packages/api/tests/api/__init__.py`, `packages/api/tests/api/test_config_route.py`
- Modify: `packages/api/myvoice/server.py` (mount router, load config at lifespan)

- [ ] **Step 4.1: Write failing config tests**

`packages/api/tests/test_config.py`:
```python
from __future__ import annotations

from pathlib import Path

import pytest

from myvoice.config import Config, load_config, redact_config, save_config


def test_load_creates_default_when_missing(tmp_path: Path) -> None:
    cfg_path = tmp_path / "config.yaml"
    cfg = load_config(cfg_path)
    assert cfg.version == 1
    assert cfg.server.port == 7878
    assert cfg.providers.anthropic.api_key == ""
    assert cfg_path.exists()


def test_save_is_atomic(tmp_path: Path) -> None:
    cfg_path = tmp_path / "config.yaml"
    cfg = load_config(cfg_path)
    cfg.providers.anthropic.api_key = "sk-ant-secret"
    save_config(cfg, cfg_path)
    reloaded = load_config(cfg_path)
    assert reloaded.providers.anthropic.api_key == "sk-ant-secret"


def test_redact_masks_keys() -> None:
    cfg = Config()
    cfg.providers.anthropic.api_key = "sk-ant-realsecret"
    cfg.providers.openai.api_key = ""
    redacted = redact_config(cfg)
    assert redacted.providers.anthropic.api_key == "sk-ant-***"
    assert redacted.providers.openai.api_key == ""


def test_chmod_0600(tmp_path: Path) -> None:
    cfg_path = tmp_path / "config.yaml"
    cfg = load_config(cfg_path)
    save_config(cfg, cfg_path)
    mode = cfg_path.stat().st_mode & 0o777
    assert mode == 0o600
```

`packages/api/tests/api/__init__.py`: empty.

`packages/api/tests/api/test_config_route.py`:
```python
from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient


def test_get_config_redacts_keys(client_with_config) -> None:
    client, cfg_path = client_with_config
    # Pre-seed
    import yaml
    data = yaml.safe_load(cfg_path.read_text())
    data["providers"]["anthropic"]["api_key"] = "sk-ant-realsecret"
    cfg_path.write_text(yaml.safe_dump(data))
    # Reload
    client.app.state.config_path = cfg_path  # ensure
    r = client.get("/api/config")
    assert r.status_code == 200
    body = r.json()
    assert body["providers"]["anthropic"]["api_key"] == "sk-ant-***"


def test_put_config_preserves_existing_key_when_sentinel_sent(client_with_config) -> None:
    client, cfg_path = client_with_config
    # First set the key
    r = client.put("/api/config", json={"providers": {"anthropic": {"api_key": "sk-ant-real"}}})
    assert r.status_code == 200
    # Now send the sentinel back
    r = client.put("/api/config", json={"providers": {"anthropic": {"api_key": "sk-ant-***"}}})
    assert r.status_code == 200
    # Re-read raw file: real key still there
    import yaml
    data = yaml.safe_load(cfg_path.read_text())
    assert data["providers"]["anthropic"]["api_key"] == "sk-ant-real"


def test_put_empty_clears_key(client_with_config) -> None:
    client, cfg_path = client_with_config
    client.put("/api/config", json={"providers": {"anthropic": {"api_key": "sk-ant-real"}}})
    client.put("/api/config", json={"providers": {"anthropic": {"api_key": ""}}})
    import yaml
    data = yaml.safe_load(cfg_path.read_text())
    assert data["providers"]["anthropic"]["api_key"] == ""
```

Update `packages/api/tests/conftest.py` — add the fixture `client_with_config`:
```python
import pytest
from fastapi.testclient import TestClient
from pathlib import Path
from myvoice.server import create_app


@pytest.fixture
def client_with_config(tmp_path: Path, monkeypatch):
    cfg_path = tmp_path / "config.yaml"
    monkeypatch.setenv("MYVOICE_CONFIG_PATH", str(cfg_path))
    app = create_app()
    with TestClient(app) as c:
        yield c, cfg_path
```
(Add it; do not remove existing fixtures.)

Run: `uv run pytest packages/api/tests/test_config.py packages/api/tests/api/test_config_route.py -v`
Expected: FAIL — modules missing.

- [ ] **Step 4.2: Implement config.py**

`packages/api/myvoice/config.py`:
```python
"""Config file lifecycle: ~/.myvoice/config.yaml load/save/redact."""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

import yaml
from pydantic import BaseModel, Field

_MASK = "sk-ant-***"  # also used as a generic sentinel; UI knows it means "unchanged"


class ServerSection(BaseModel):
    port: int = 7878
    open_browser: bool = True


class UISection(BaseModel):
    default_pack: str | None = None
    theme: str = "system"


class ProviderConfig(BaseModel):
    api_key: str = ""
    default_model: str | None = None


class ProvidersSection(BaseModel):
    anthropic: ProviderConfig = Field(default_factory=ProviderConfig)
    openai: ProviderConfig = Field(default_factory=ProviderConfig)
    google: ProviderConfig = Field(default_factory=ProviderConfig)


class FeaturesSection(BaseModel):
    default_compose_provider: str = "anthropic"
    default_extraction_provider: str = "anthropic"


class Config(BaseModel):
    version: int = 1
    server: ServerSection = Field(default_factory=ServerSection)
    ui: UISection = Field(default_factory=UISection)
    pack_paths: list[str] = Field(default_factory=list)
    providers: ProvidersSection = Field(default_factory=ProvidersSection)
    features: FeaturesSection = Field(default_factory=FeaturesSection)


def default_config_path() -> Path:
    env = os.environ.get("MYVOICE_CONFIG_PATH")
    if env:
        return Path(env)
    return Path.home() / ".myvoice" / "config.yaml"


def load_config(path: Path | None = None) -> Config:
    p = path or default_config_path()
    if not p.exists():
        cfg = Config()
        p.parent.mkdir(parents=True, exist_ok=True)
        save_config(cfg, p)
        return cfg
    data = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    return Config.model_validate(data)


def save_config(cfg: Config, path: Path | None = None) -> None:
    p = path or default_config_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    data = cfg.model_dump()
    # Atomic write: temp in same dir, fsync, rename, chmod 0600.
    fd, tmp_path = tempfile.mkstemp(dir=p.parent, prefix=".config.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            yaml.safe_dump(data, f, sort_keys=False)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp_path, 0o600)
        os.replace(tmp_path, p)
    except Exception:
        try:
            os.unlink(tmp_path)
        except FileNotFoundError:
            pass
        raise


def redact_config(cfg: Config) -> Config:
    """Return a copy with non-empty api_key fields replaced with the mask."""
    out = cfg.model_copy(deep=True)
    for name in ("anthropic", "openai", "google"):
        prov = getattr(out.providers, name)
        if prov.api_key:
            prov.api_key = _MASK
    return out


def merge_put(current: Config, patch: dict) -> Config:
    """Apply a partial-update dict to current. Sentinel mask preserves existing key."""
    base = current.model_dump()
    _deep_merge(base, patch)
    # Walk providers and restore preserved keys when sentinel was sent.
    incoming_providers = (patch.get("providers") or {})
    for name in ("anthropic", "openai", "google"):
        if name in incoming_providers and "api_key" in incoming_providers[name]:
            if incoming_providers[name]["api_key"] == _MASK:
                base["providers"][name]["api_key"] = getattr(current.providers, name).api_key
    return Config.model_validate(base)


def _deep_merge(dst: dict, src: dict) -> None:
    for k, v in src.items():
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            _deep_merge(dst[k], v)
        else:
            dst[k] = v
```

Run: `uv run pytest packages/api/tests/test_config.py -v` → PASS.

- [ ] **Step 4.3: Implement config route**

`packages/api/myvoice/api/config.py`:
```python
"""GET/PUT /api/config + /api/providers/{provider}/models."""
from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from myvoice.config import Config, load_config, merge_put, redact_config, save_config
from myvoice.llm.exceptions import ProviderError, ProviderMissingKey
from myvoice.llm.registry import get_provider

router = APIRouter(tags=["config"])

_MODEL_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_CACHE_TTL = 300  # 5 minutes


@router.get("/api/config")
def get_config(request: Request) -> dict:
    cfg: Config = request.app.state.config
    return redact_config(cfg).model_dump()


@router.put("/api/config")
def put_config(request: Request, patch: dict) -> dict:
    cfg: Config = request.app.state.config
    new_cfg = merge_put(cfg, patch)
    path = request.app.state.config_path
    save_config(new_cfg, path)
    request.app.state.config = new_cfg
    # invalidate model cache for any provider whose key changed
    incoming = (patch.get("providers") or {})
    for name in incoming.keys():
        _MODEL_CACHE.pop(name, None)
    # Trigger pack rescan if pack_paths changed.
    if "pack_paths" in patch:
        request.app.state.pack_store.rescan(new_cfg.pack_paths)
    return redact_config(new_cfg).model_dump()


@router.get("/api/providers/{provider}/models")
async def list_models(provider: str, request: Request) -> list[dict[str, Any]]:
    cached = _MODEL_CACHE.get(provider)
    if cached and (time.time() - cached[0]) < _CACHE_TTL:
        return cached[1]
    cfg: Config = request.app.state.config
    prov_cfg = getattr(cfg.providers, provider, None)
    if prov_cfg is None:
        raise HTTPException(404, detail={"error": {"code": "unknown_provider", "message": f"Unknown provider '{provider}'"}})
    if not prov_cfg.api_key:
        raise HTTPException(400, detail={"error": {"code": "provider_missing_key", "message": f"No API key for {provider}", "hint": "Add the key in Settings."}})
    try:
        client = get_provider(provider, prov_cfg.api_key)
        models = await client.list_models()
    except ProviderMissingKey as e:
        raise HTTPException(400, detail={"error": {"code": e.code, "message": e.message, "hint": e.hint}})
    except ProviderError as e:
        raise HTTPException(502, detail={"error": {"code": e.code, "message": e.message}})
    payload = [m.model_dump() for m in models]
    _MODEL_CACHE[provider] = (time.time(), payload)
    return payload
```

- [ ] **Step 4.4: Wire into server.py + PackStore.rescan**

Inspect existing `server.py` and modify the lifespan to:
1. Load config on startup: `app.state.config = load_config(); app.state.config_path = default_config_path()`.
2. Pass `app.state.config.pack_paths` to PackStore when constructed.
3. Mount the new config router.

Add `rescan(new_paths: list[str])` to `PackStore` if it doesn't exist (re-walk discovery with the given path list).

After edits, run: `uv run pytest packages/api/tests/ -v` → all pass.

- [ ] **Step 4.5: Commit**

```bash
uv run ruff check packages/api && uv run mypy packages/api/myvoice
git add packages/api
git commit -m "feat(api): config backend — GET/PUT /api/config + provider model listing

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5 — JobRegistry + jobs routes + SSE

**Files:**
- Create: `packages/api/myvoice/jobs/{__init__.py, models.py, registry.py, events.py}`
- Create: `packages/api/myvoice/api/jobs.py`
- Create: `packages/api/tests/jobs/{__init__.py, test_registry.py}`
- Create: `packages/api/tests/api/test_jobs_route.py`
- Modify: `packages/api/myvoice/server.py` (lifespan creates JobRegistry, mounts router)

- [ ] **Step 5.1: Write failing JobRegistry tests**

`packages/api/tests/jobs/__init__.py`: empty.

`packages/api/tests/jobs/test_registry.py`:
```python
import asyncio
import pytest
from myvoice.jobs.registry import JobRegistry
from myvoice.jobs.models import Job, JobType


@pytest.mark.asyncio
async def test_create_and_get() -> None:
    reg = JobRegistry()
    job = await reg.create(JobType.REWRITE)
    assert job.id
    assert job.status == "pending"
    fetched = await reg.get(job.id)
    assert fetched is job


@pytest.mark.asyncio
async def test_cancel_signals_event() -> None:
    reg = JobRegistry()
    job = await reg.create(JobType.REWRITE)
    evt = reg.cancellation_event(job.id)
    assert not evt.is_set()
    await reg.cancel(job.id)
    assert evt.is_set()
    refreshed = await reg.get(job.id)
    assert refreshed.status == "cancelled"


@pytest.mark.asyncio
async def test_lru_eviction_keeps_50() -> None:
    reg = JobRegistry(max_size=3)
    j1 = await reg.create(JobType.REWRITE)
    j2 = await reg.create(JobType.REWRITE)
    j3 = await reg.create(JobType.REWRITE)
    # Mark them finished so they're eligible for eviction.
    for j in (j1, j2, j3):
        j.status = "succeeded"
        j.finished_at = j.started_at  # any value
    j4 = await reg.create(JobType.REWRITE)
    assert await reg.get(j1.id) is None  # oldest evicted
    assert await reg.get(j4.id) is not None


@pytest.mark.asyncio
async def test_append_token_buffers_for_replay() -> None:
    reg = JobRegistry()
    job = await reg.create(JobType.REWRITE)
    await reg.append_token(job.id, "Hello ")
    await reg.append_token(job.id, "world")
    refreshed = await reg.get(job.id)
    assert refreshed.partial_text == "Hello world"
```

Run: FAIL.

- [ ] **Step 5.2: Implement jobs/models.py + jobs/registry.py**

`packages/api/myvoice/jobs/__init__.py`:
```python
from myvoice.jobs.models import Job, JobType
from myvoice.jobs.registry import JobRegistry
__all__ = ["Job", "JobType", "JobRegistry"]
```

`packages/api/myvoice/jobs/models.py`:
```python
from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field


class JobType(StrEnum):
    REWRITE = "rewrite"
    EXTRACT = "extract"


JobStatus = Literal["pending", "running", "succeeded", "failed", "cancelled"]


class Job(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex)
    type: JobType
    status: JobStatus = "pending"
    stage: str = "queued"
    progress: float = 0.0
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    finished_at: datetime | None = None
    partial_text: str = ""
    result: dict | None = None
    error: dict | None = None
```

`packages/api/myvoice/jobs/registry.py`:
```python
from __future__ import annotations

import asyncio
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Any

from myvoice.jobs.models import Job, JobType


class JobRegistry:
    def __init__(self, max_size: int = 50) -> None:
        self._jobs: OrderedDict[str, Job] = OrderedDict()
        self._cancellation: dict[str, asyncio.Event] = {}
        self._listeners: dict[str, list[asyncio.Queue]] = {}
        self._lock = asyncio.Lock()
        self._max = max_size

    async def create(self, type_: JobType) -> Job:
        job = Job(type=type_)
        async with self._lock:
            self._jobs[job.id] = job
            self._cancellation[job.id] = asyncio.Event()
            self._listeners[job.id] = []
            self._evict_if_full()
        return job

    async def get(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    def cancellation_event(self, job_id: str) -> asyncio.Event:
        return self._cancellation[job_id]

    async def cancel(self, job_id: str) -> bool:
        async with self._lock:
            job = self._jobs.get(job_id)
            if not job or job.status in ("succeeded", "failed", "cancelled"):
                return False
            self._cancellation[job_id].set()
            job.status = "cancelled"
            job.finished_at = datetime.now(timezone.utc)
        await self._broadcast(job_id, {"type": "error", "code": "cancelled", "message": "Cancelled by user."})
        return True

    async def append_token(self, job_id: str, delta: str) -> None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            job.partial_text += delta
        await self._broadcast(job_id, {"type": "token", "delta": delta})

    async def set_stage(self, job_id: str, stage: str, progress: float | None = None) -> None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            job.stage = stage
            if progress is not None:
                job.progress = progress
            job.status = "running" if job.status == "pending" else job.status
        await self._broadcast(job_id, {"type": "stage", "name": stage, "progress": progress or 0.0})

    async def complete(self, job_id: str, result: dict[str, Any]) -> None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            job.status = "succeeded"
            job.finished_at = datetime.now(timezone.utc)
            job.result = result
            job.progress = 1.0
        await self._broadcast(job_id, {"type": "complete", "result": result})

    async def fail(self, job_id: str, code: str, message: str, hint: str | None = None) -> None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            job.status = "failed"
            job.finished_at = datetime.now(timezone.utc)
            job.error = {"code": code, "message": message, "hint": hint}
        await self._broadcast(job_id, {"type": "error", "code": code, "message": message, "hint": hint})

    async def subscribe(self, job_id: str) -> asyncio.Queue:
        """Returns a queue receiving every future event for this job."""
        async with self._lock:
            q: asyncio.Queue = asyncio.Queue()
            self._listeners.setdefault(job_id, []).append(q)
            return q

    def replay_snapshot(self, job_id: str) -> list[dict]:
        """Return list of events to emit to a freshly-connecting subscriber."""
        job = self._jobs.get(job_id)
        if job is None:
            return []
        events: list[dict] = [{"type": "stage", "name": job.stage, "progress": job.progress}]
        if job.partial_text:
            events.append({"type": "token", "delta": job.partial_text})
        if job.status == "succeeded":
            events.append({"type": "complete", "result": job.result or {}})
        elif job.status == "failed":
            events.append({"type": "error", **(job.error or {})})
        elif job.status == "cancelled":
            events.append({"type": "error", "code": "cancelled", "message": "Cancelled."})
        return events

    async def _broadcast(self, job_id: str, event: dict) -> None:
        listeners = list(self._listeners.get(job_id, []))
        for q in listeners:
            await q.put(event)

    def _evict_if_full(self) -> None:
        while len(self._jobs) > self._max:
            # Evict oldest finished job
            for jid, job in self._jobs.items():
                if job.status in ("succeeded", "failed", "cancelled"):
                    del self._jobs[jid]
                    self._cancellation.pop(jid, None)
                    self._listeners.pop(jid, None)
                    break
            else:
                break  # nothing evictable yet
```

Run: `uv run pytest packages/api/tests/jobs/ -v` → PASS.

- [ ] **Step 5.3: Implement events.py + jobs route**

`packages/api/myvoice/jobs/events.py`:
```python
"""SSE serialization helpers."""
from __future__ import annotations

import json
from typing import Any


def sse_format(event: dict[str, Any]) -> str:
    """Format one event as SSE: 'data: <json>\\n\\n'."""
    return f"data: {json.dumps(event, separators=(',', ':'))}\n\n"
```

`packages/api/myvoice/api/jobs.py`:
```python
"""GET/DELETE /api/jobs/{id} + /api/jobs/{id}/events SSE."""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from myvoice.jobs.events import sse_format
from myvoice.jobs.registry import JobRegistry

router = APIRouter(tags=["jobs"])


@router.get("/api/jobs/{job_id}")
async def get_job(job_id: str, request: Request) -> dict:
    reg: JobRegistry = request.app.state.job_registry
    job = await reg.get(job_id)
    if job is None:
        raise HTTPException(404, detail={"error": {"code": "job_not_found", "message": f"No job {job_id}"}})
    return job.model_dump(mode="json")


@router.delete("/api/jobs/{job_id}", status_code=204)
async def cancel_job(job_id: str, request: Request) -> None:
    reg: JobRegistry = request.app.state.job_registry
    cancelled = await reg.cancel(job_id)
    if not cancelled:
        # Either not found or already finished — treat as 404 to keep API simple.
        raise HTTPException(404, detail={"error": {"code": "job_not_found", "message": f"No active job {job_id}"}})


@router.get("/api/jobs/{job_id}/events")
async def job_events(job_id: str, request: Request) -> StreamingResponse:
    reg: JobRegistry = request.app.state.job_registry
    job = await reg.get(job_id)
    if job is None:
        raise HTTPException(404, detail={"error": {"code": "job_not_found", "message": f"No job {job_id}"}})

    async def stream() -> AsyncIterator[str]:
        # Replay snapshot first.
        for evt in reg.replay_snapshot(job_id):
            yield sse_format(evt)
        # If terminal already, done.
        snapshot_job = await reg.get(job_id)
        if snapshot_job and snapshot_job.status in ("succeeded", "failed", "cancelled"):
            return
        # Otherwise subscribe to live events.
        q = await reg.subscribe(job_id)
        try:
            while True:
                if await request.is_disconnected():
                    return
                try:
                    evt = await asyncio.wait_for(q.get(), timeout=15.0)
                except asyncio.TimeoutError:
                    # Heartbeat comment to keep connection alive.
                    yield ": ping\n\n"
                    continue
                yield sse_format(evt)
                if evt.get("type") in ("complete", "error"):
                    return
        finally:
            pass

    return StreamingResponse(stream(), media_type="text/event-stream")
```

- [ ] **Step 5.4: Write SSE route test**

`packages/api/tests/api/test_jobs_route.py`:
```python
import pytest


@pytest.mark.asyncio
async def test_get_job_404(client_with_config) -> None:
    client, _ = client_with_config
    r = client.get("/api/jobs/does-not-exist")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_replay_emits_complete_for_finished_job(client_with_config) -> None:
    client, _ = client_with_config
    reg = client.app.state.job_registry
    from myvoice.jobs.models import JobType
    job = await reg.create(JobType.REWRITE)
    await reg.append_token(job.id, "hello")
    await reg.complete(job.id, {"output": "hello"})
    # SSE stream should produce stage + token + complete then end.
    with client.stream("GET", f"/api/jobs/{job.id}/events") as resp:
        assert resp.status_code == 200
        body = b"".join(resp.iter_bytes())
    text = body.decode()
    assert '"type":"stage"' in text
    assert '"type":"token"' in text and '"delta":"hello"' in text
    assert '"type":"complete"' in text
```

- [ ] **Step 5.5: Wire into server.py and run tests**

In `server.py` lifespan, add:
```python
from myvoice.jobs.registry import JobRegistry
# ...
app.state.job_registry = JobRegistry()
```
Mount the jobs router.

Run: `uv run pytest packages/api/tests/ -v`

- [ ] **Step 5.6: Commit**

```bash
git add packages/api
git commit -m "feat(api): JobRegistry + /api/jobs/{id} + SSE events with replay

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6 — /api/rewrite + /api/compose + /api/lint + positive-hit heuristics

**Files:**
- Modify: `packages/api/myvoice/lint.py` (add `LintHit` with UTF-16 offsets + positive-hit detectors alongside existing `Violation`)
- Create: `packages/api/myvoice/api/rewrite.py`
- Create: `packages/api/myvoice/api/compose.py` (HTTP route — distinct from existing `myvoice/compose.py` module)
- Create: `packages/api/myvoice/test_helpers/{__init__.py, mock_provider.py}`
- Create: `packages/api/tests/test_lint_positive.py`
- Create: `packages/api/tests/api/test_rewrite_route.py`
- Create: `packages/api/tests/api/test_compose_route.py`
- Modify: `packages/api/myvoice/llm/registry.py` (mock provider behind env var)

- [ ] **Step 6.1: Write failing positive-hit tests**

`packages/api/tests/test_lint_positive.py`:
```python
from __future__ import annotations

from myvoice.lint import detect_positive_hits


def test_conflict_opener() -> None:
    hits = detect_positive_hits("For years, teams have struggled with this. Now it works.")
    kinds = [h.rule_id for h in hits]
    assert "hit:conflict_opener" in kinds


def test_speed_to_value() -> None:
    hits = detect_positive_hits("Finally unlock 10x faster pipelines.")
    assert any(h.rule_id == "hit:speed_to_value" for h in hits)


def test_golden_command() -> None:
    text = "Plan. Build. Ship.\n"
    hits = detect_positive_hits(text)
    assert any(h.rule_id == "hit:golden_command" for h in hits)


def test_negative_cases() -> None:
    assert detect_positive_hits("This is unremarkable prose.") == []
```

Run: FAIL.

- [ ] **Step 6.2: Add LintHit + positive-hit detectors to lint.py**

Add to `packages/api/myvoice/lint.py` (alongside the existing `Violation` dataclass — do not remove it; the CLI still uses it):

```python
import re
from dataclasses import dataclass
from typing import Literal

LintKind = Literal["banished_word", "banished_phrase", "rule", "positive_hit"]


@dataclass(frozen=True)
class LintHit:
    """UTF-16-indexed hit. `start`/`end` match JavaScript String.length offsets."""
    start: int
    end: int
    kind: LintKind
    rule_id: str
    message: str


def _utf16_offset(text: str, char_index: int) -> int:
    """Convert a Python char (code point) index to a UTF-16 code-unit offset."""
    # Code points >= 0x10000 use 2 UTF-16 units; all others use 1.
    return sum(2 if ord(c) >= 0x10000 else 1 for c in text[:char_index])


def lint_to_hits(manifest, text: str) -> list[LintHit]:
    """Run the existing lint() and convert Violations to LintHit with UTF-16 offsets."""
    from myvoice.lint import lint  # already defined in this module
    hits: list[LintHit] = []
    lines = text.splitlines(keepends=True)
    line_starts: list[int] = [0]
    for line in lines:
        line_starts.append(line_starts[-1] + len(line))
    for v in lint(manifest, text):
        # v.line is 1-indexed; v.column is char offset on that line
        line_start = line_starts[v.line - 1]
        start_char = line_start + v.column
        end_char = start_char + len(v.match)
        kind_map = {"word": "banished_word", "phrase": "banished_phrase", "rule": "rule"}
        hits.append(LintHit(
            start=_utf16_offset(text, start_char),
            end=_utf16_offset(text, end_char),
            kind=kind_map[v.kind],
            rule_id=f"{v.kind}:{v.match.lower()}",
            message=v.message,
        ))
    return hits


_CONFLICT_OPENERS = re.compile(
    r"\b(for years|most teams struggle|the problem with|anyone who'?s|if you'?ve ever)\b",
    re.IGNORECASE,
)
_S2V_TRIGGERS = re.compile(r"\b(unlock|powerhouse|tipping point|finally)\b", re.IGNORECASE)
_S2V_TIME = re.compile(r"\b\d+\s*(?:minute|hour|day|week|x|×|%)\b", re.IGNORECASE)
_GOLDEN = re.compile(r"(?:^|\n)\s*((?:[A-Z][a-z]+\.\s*){3,4})", re.MULTILINE)


def detect_positive_hits(text: str) -> list[LintHit]:
    hits: list[LintHit] = []

    first_sentence_end = re.search(r"[.!?]", text)
    first_segment = text[: first_sentence_end.end()] if first_sentence_end else text
    for m in _CONFLICT_OPENERS.finditer(first_segment):
        hits.append(LintHit(
            start=_utf16_offset(text, m.start()),
            end=_utf16_offset(text, m.end()),
            kind="positive_hit",
            rule_id="hit:conflict_opener",
            message="Conflict & Resolution opener detected.",
        ))

    for m in _S2V_TRIGGERS.finditer(text):
        window_start = max(0, m.start() - 80)
        window_end = min(len(text), m.end() + 80)
        if _S2V_TIME.search(text[window_start:window_end]):
            hits.append(LintHit(
                start=_utf16_offset(text, m.start()),
                end=_utf16_offset(text, m.end()),
                kind="positive_hit",
                rule_id="hit:speed_to_value",
                message="Speed-to-Value vocabulary near a time/effort claim.",
            ))

    for m in _GOLDEN.finditer(text):
        hits.append(LintHit(
            start=_utf16_offset(text, m.start(1)),
            end=_utf16_offset(text, m.end(1)),
            kind="positive_hit",
            rule_id="hit:golden_command",
            message="Golden Command pattern.",
        ))

    return hits
```

Run: `uv run pytest packages/api/tests/test_lint_positive.py -v` → PASS.

- [ ] **Step 6.3: Build mock provider for testing**

`packages/api/myvoice/test_helpers/__init__.py`: empty.

`packages/api/myvoice/test_helpers/mock_provider.py`:
```python
"""Scripted LLM provider for tests. Activated by env var MYVOICE_TEST_PROVIDER=mock."""
from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator

from myvoice.llm.base import LLMResponse, ModelInfo, StreamChunk, Usage


class MockProvider:
    name = "mock"

    def __init__(self, api_key: str = "mock") -> None:
        self._script = os.environ.get("MYVOICE_MOCK_OUTPUT", "Hello from the mock.")

    async def list_models(self) -> list[ModelInfo]:
        return [ModelInfo(id="mock-1", label="Mock Model", context_window=8000, supports_streaming=True)]

    async def complete(self, *, model: str, prompt: str, json_schema: dict | None = None) -> LLMResponse:
        return LLMResponse(
            text=self._script,
            input_tokens=len(prompt.split()),
            output_tokens=len(self._script.split()),
            model=model,
            finish_reason="stop",
        )

    async def stream(self, *, model: str, prompt: str) -> AsyncIterator[StreamChunk]:
        for chunk in self._script.split(" "):
            await asyncio.sleep(0.005)
            yield StreamChunk(delta=chunk + " ")
        yield StreamChunk(usage=Usage(
            input_tokens=len(prompt.split()),
            output_tokens=len(self._script.split()),
            finish_reason="stop",
        ))
```

Update `registry.py`:
```python
import os
from myvoice.test_helpers.mock_provider import MockProvider
# ...
def get_provider(name: str, api_key: str):
    if os.environ.get("MYVOICE_TEST_PROVIDER") == "mock":
        return MockProvider(api_key=api_key or "mock")
    # ... existing dispatch
```

- [ ] **Step 6.4: Implement rewrite route**

`packages/api/myvoice/api/rewrite.py`:
```python
"""POST /api/rewrite — async, streaming."""
from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel

from myvoice.compose import compose_prompt
from myvoice.config import Config
from myvoice.jobs.models import JobType
from myvoice.jobs.registry import JobRegistry
from myvoice.lint import detect_positive_hits, lint_to_hits
from myvoice.llm.cost import usd
from myvoice.llm.exceptions import ProviderError, ProviderMissingKey, ProviderRateLimit
from myvoice.llm.registry import get_provider

router = APIRouter(tags=["rewrite"])


class RewriteRequest(BaseModel):
    pack: str
    format: str | None = None
    samples: list[str] = []
    draft: str
    provider: str
    model: str


@router.post("/api/rewrite", status_code=202)
async def start_rewrite(
    req: RewriteRequest, request: Request, background_tasks: BackgroundTasks
) -> dict[str, str]:
    store = request.app.state.pack_store
    info = store.get(req.pack)
    if info is None:
        raise HTTPException(404, detail={"error": {"code": "pack_not_found", "message": f"No pack '{req.pack}'"}})
    cfg: Config = request.app.state.config
    prov_cfg = getattr(cfg.providers, req.provider, None)
    if prov_cfg is None or not prov_cfg.api_key:
        raise HTTPException(400, detail={"error": {"code": "provider_missing_key", "message": f"No API key for {req.provider}", "hint": "Add the key in Settings."}})

    reg: JobRegistry = request.app.state.job_registry
    job = await reg.create(JobType.REWRITE)

    background_tasks.add_task(
        _run_rewrite, reg, job.id, info, req, prov_cfg.api_key
    )
    return {"job_id": job.id}


async def _run_rewrite(
    reg: JobRegistry,
    job_id: str,
    pack_info: Any,
    req: RewriteRequest,
    api_key: str,
) -> None:
    cancel_evt = reg.cancellation_event(job_id)
    try:
        await reg.set_stage(job_id, "composing", progress=0.05)
        manifest = pack_info.manifest
        prompt = compose_prompt(
            pack_root=pack_info.root,
            manifest=manifest,
            format_name=req.format,
            sample_ids=req.samples,
            draft=req.draft,
        )
        await reg.set_stage(job_id, "streaming", progress=0.10)
        client = get_provider(req.provider, api_key)
        final_usage = None
        async for chunk in client.stream(model=req.model, prompt=prompt):
            if cancel_evt.is_set():
                return  # JobRegistry already marked cancelled
            if chunk.delta:
                await reg.append_token(job_id, chunk.delta)
            if chunk.usage is not None:
                final_usage = chunk.usage
        job = await reg.get(job_id)
        if job is None or cancel_evt.is_set():
            return
        full_output = job.partial_text
        await reg.set_stage(job_id, "linting", progress=0.95)
        violations = lint_to_hits(manifest, full_output)
        hits = detect_positive_hits(full_output)
        in_tok = final_usage.input_tokens if final_usage else 0
        out_tok = final_usage.output_tokens if final_usage else 0
        cost = usd(req.provider, req.model, in_tok, out_tok)
        await reg.complete(job_id, {
            "output": full_output,
            "lint_violations": [v.__dict__ for v in violations],
            "lint_hits": [h.__dict__ for h in hits],
            "input_tokens": in_tok,
            "output_tokens": out_tok,
            "cost_usd": cost,
            "model": req.model,
            "provider": req.provider,
            "finish_reason": final_usage.finish_reason if final_usage else "stop",
        })
    except ProviderMissingKey as e:
        await reg.fail(job_id, e.code, e.message, e.hint)
    except ProviderRateLimit as e:
        await reg.fail(job_id, e.code, e.message, e.hint)
    except ProviderError as e:
        await reg.fail(job_id, e.code, e.message, e.hint)
    except Exception as e:
        await reg.fail(job_id, "internal_error", f"Unexpected: {e}")
```

NOTE: `compose_prompt(pack_root, manifest, format_name, sample_ids, draft)` is the existing function from `myvoice/compose.py`. Confirm its signature before this step — if different, adjust call. (Existing module is read-only here.)

- [ ] **Step 6.5: Implement /api/compose + /api/lint sync routes**

`packages/api/myvoice/api/compose.py`:
```python
"""Sync /api/compose + /api/lint routes."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from myvoice.compose import compose_prompt
from myvoice.lint import detect_positive_hits, lint_to_hits

router = APIRouter(tags=["compose"])


class ComposeRequest(BaseModel):
    pack: str
    format: str | None = None
    samples: list[str] = []
    draft: str | None = None


@router.post("/api/compose")
def compose_endpoint(req: ComposeRequest, request: Request) -> dict:
    store = request.app.state.pack_store
    info = store.get(req.pack)
    if info is None:
        raise HTTPException(404, detail={"error": {"code": "pack_not_found", "message": f"No pack '{req.pack}'"}})
    prompt = compose_prompt(
        pack_root=info.root, manifest=info.manifest,
        format_name=req.format, sample_ids=req.samples, draft=req.draft or None,
    )
    return {"prompt": prompt, "char_count": len(prompt), "samples_used": req.samples}


class LintRequest(BaseModel):
    pack: str
    text: str


@router.post("/api/lint")
def lint_endpoint(req: LintRequest, request: Request) -> dict:
    store = request.app.state.pack_store
    info = store.get(req.pack)
    if info is None:
        raise HTTPException(404, detail={"error": {"code": "pack_not_found", "message": f"No pack '{req.pack}'"}})
    violations = lint_to_hits(info.manifest, req.text)
    hits = detect_positive_hits(req.text)
    return {
        "violations": [v.__dict__ for v in violations],
        "hits": [h.__dict__ for h in hits],
    }
```

- [ ] **Step 6.6: Test rewrite/compose routes**

`packages/api/tests/api/test_rewrite_route.py`:
```python
import asyncio
import pytest
import json


@pytest.mark.asyncio
async def test_rewrite_with_mock_provider(client_with_config, monkeypatch) -> None:
    client, cfg_path = client_with_config
    # Set an API key (any string — mock provider ignores it)
    client.put("/api/config", json={"providers": {"anthropic": {"api_key": "sk-mock"}}})
    monkeypatch.setenv("MYVOICE_TEST_PROVIDER", "mock")
    monkeypatch.setenv("MYVOICE_MOCK_OUTPUT", "Plan. Build. Ship.")

    r = client.post("/api/rewrite", json={
        "pack": "dan",
        "draft": "rewrite this",
        "provider": "anthropic",
        "model": "claude-sonnet-4-6",
    })
    assert r.status_code == 202
    job_id = r.json()["job_id"]

    # Drain SSE
    with client.stream("GET", f"/api/jobs/{job_id}/events") as resp:
        chunks = b"".join(resp.iter_bytes()).decode()

    assert '"type":"complete"' in chunks
    payload = json.loads(chunks.split('"type":"complete","result":')[1].rsplit("}\n\n", 1)[0] + "}")
    assert "Plan. Build. Ship." in payload["output"]
    assert payload["provider"] == "anthropic"
```

`packages/api/tests/api/test_compose_route.py`:
```python
def test_compose_endpoint(client_with_config) -> None:
    client, _ = client_with_config
    r = client.post("/api/compose", json={"pack": "dan", "draft": "hi"})
    assert r.status_code == 200
    assert "prompt" in r.json()
    assert r.json()["char_count"] > 0


def test_lint_endpoint_flags_banished_word(client_with_config) -> None:
    client, _ = client_with_config
    r = client.post("/api/lint", json={"pack": "dan", "text": "Let me delve into this."})
    assert r.status_code == 200
    violations = r.json()["violations"]
    assert any(v["rule_id"].startswith("banished") or "delve" in v["rule_id"] for v in violations)
```

Wire both routers into `server.py`.

Run: `uv run pytest packages/api/tests/ -v`

- [ ] **Step 6.7: Commit**

```bash
git add packages/api
git commit -m "feat(api): /api/rewrite (async SSE) + /api/compose & /api/lint (sync) + positive-hit detectors

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7 — Samples endpoint + watchfiles + /api/events

**Files:**
- Create: `packages/api/myvoice/api/samples.py`
- Create: `packages/api/myvoice/watch.py`
- Create: `packages/api/myvoice/api/events.py`
- Create: `packages/api/tests/api/test_samples_route.py`
- Create: `packages/api/tests/test_watch.py`
- Modify: `packages/api/myvoice/server.py` (start watch task in lifespan; mount routers)

- [ ] **Step 7.1: Write failing samples-route tests**

`packages/api/tests/api/test_samples_route.py`:
```python
def test_create_sample_appends_manifest_and_writes_file(client_with_config) -> None:
    client, _ = client_with_config
    # baseline manifest
    r0 = client.get("/api/packs/dan/manifest")
    before = r0.json()
    sample_count = len(before.get("samples", []))

    r = client.post("/api/packs/dan/samples", json={
        "excerpt": "This is a great new sample passage about builders shipping.",
        "source_url": "https://example.com/post",
        "note": "Auto-saved from compose",
    })
    assert r.status_code == 201
    body = r.json()
    assert body["id"]  # zero-padded numeric
    assert body["file"].startswith("samples/")

    # Manifest now has one more sample
    r2 = client.get("/api/packs/dan/manifest")
    assert len(r2.json()["samples"]) == sample_count + 1


def test_sample_id_auto_increments(client_with_config) -> None:
    client, _ = client_with_config
    r1 = client.post("/api/packs/dan/samples", json={"excerpt": "First sample passage."})
    r2 = client.post("/api/packs/dan/samples", json={"excerpt": "Second sample passage."})
    assert int(r1.json()["id"]) + 1 == int(r2.json()["id"])
```

- [ ] **Step 7.2: Implement samples route**

`packages/api/myvoice/api/samples.py`:
```python
"""POST /api/packs/{slug}/samples — coupled file + manifest write."""
from __future__ import annotations

import re
from pathlib import Path
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
def create_sample(slug: str, req: SaveSampleRequest, request: Request) -> dict[str, str]:
    store = request.app.state.pack_store
    info = store.get(slug)
    if info is None:
        raise HTTPException(404, detail={"error": {"code": "pack_not_found", "message": f"No pack '{slug}'"}})
    manifest_path = info.root / "stylepack.yaml"
    data = yaml.safe_load(manifest_path.read_text(encoding="utf-8")) or {}
    samples = list(data.get("samples") or [])

    # Compute next id (numeric, 2-digit padded). Fall back to "01" if no numeric ids.
    nums = [int(s["id"]) for s in samples if isinstance(s.get("id"), str) and s["id"].isdigit()]
    next_id = max(nums) + 1 if nums else 1
    id_str = f"{next_id:02d}"

    slug_part = _slugify(req.excerpt)[:40] or "sample"
    rel = f"samples/{id_str}-{slug_part}.md"
    file_path = info.root / rel
    file_path.parent.mkdir(parents=True, exist_ok=True)

    body_parts: list[str] = []
    if req.source_url:
        body_parts.append(f"_Source: {req.source_url}_\n")
    if req.note:
        body_parts.append(f"_{req.note}_\n")
    if body_parts:
        body_parts.append("")
    body_parts.append(_blockquote(req.excerpt))
    file_path.write_text("\n".join(body_parts) + "\n", encoding="utf-8")

    samples.append({
        "id": id_str,
        "file": rel,
        "description": (req.excerpt[:80] + ("…" if len(req.excerpt) > 80 else "")),
    })
    data["samples"] = samples

    # Atomic manifest write via PackStore
    store.save_manifest(slug, data)

    return {"id": id_str, "file": rel}


def _slugify(text: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", text.lower()).strip("-")
    return cleaned[:60]


def _blockquote(text: str) -> str:
    return "\n".join(f"> {line}" if line.strip() else ">" for line in text.splitlines())
```

If `PackStore.save_manifest(slug, data)` doesn't exist or has a different signature, inspect `packs/store.py` and either reuse the existing manifest-write method or extend the store. The store already has atomic write logic from Phase 2 (`PUT /api/packs/{slug}/manifest`); reuse that path.

- [ ] **Step 7.3: Implement watch.py + /api/events route**

`packages/api/myvoice/watch.py`:
```python
"""Watch pack directories with watchfiles; emit pack:* events to the global event bus."""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from pathlib import Path

from watchfiles import Change, awatch


class EventBus:
    """In-process pub/sub for pack/config events. Multiple SSE clients can subscribe."""
    def __init__(self) -> None:
        self._listeners: list[asyncio.Queue] = []
        self._lock = asyncio.Lock()

    async def subscribe(self) -> asyncio.Queue:
        async with self._lock:
            q: asyncio.Queue = asyncio.Queue()
            self._listeners.append(q)
            return q

    async def unsubscribe(self, q: asyncio.Queue) -> None:
        async with self._lock:
            if q in self._listeners:
                self._listeners.remove(q)

    async def emit(self, event: dict) -> None:
        async with self._lock:
            listeners = list(self._listeners)
        for q in listeners:
            await q.put(event)


async def watch_task(roots: list[Path], bus: EventBus, pack_store, stop_event: asyncio.Event) -> None:
    """Long-running task. Watches roots; emits pack:created|updated|deleted|invalid events."""
    if not roots:
        return
    existing = {str(r) for r in roots if r.exists()}
    if not existing:
        return
    async for changes in awatch(*existing, stop_event=stop_event, debounce=200):
        affected_slugs: dict[str, list[str]] = {}
        for change, path_str in changes:
            path = Path(path_str)
            slug = _slug_for_path(path, roots)
            if slug is None:
                continue
            affected_slugs.setdefault(slug, []).append(path.name)
        for slug, files in affected_slugs.items():
            # Re-validate the pack and emit appropriate event
            pack_store.rescan_one(slug)
            info = pack_store.get(slug)
            if info is None:
                await bus.emit({"type": "pack:deleted", "slug": slug})
            elif not info.valid:
                await bus.emit({"type": "pack:invalid", "slug": slug, "errors": [{"path": e.path, "message": e.message} for e in info.errors]})
            else:
                await bus.emit({"type": "pack:updated", "slug": slug, "files_changed": files})


def _slug_for_path(path: Path, roots: list[Path]) -> str | None:
    for root in roots:
        try:
            rel = path.relative_to(root)
        except ValueError:
            continue
        parts = rel.parts
        if len(parts) >= 1:
            return parts[0]
    return None
```

If `pack_store.rescan_one(slug)` doesn't exist, extend `PackStore`: read manifest, re-validate, replace entry; handle "not found" (deletion) by removing.

`packages/api/myvoice/api/events.py`:
```python
"""GET /api/events — long-lived SSE for pack/config events."""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from myvoice.jobs.events import sse_format
from myvoice.watch import EventBus

router = APIRouter(tags=["events"])


@router.get("/api/events")
async def global_events(request: Request) -> StreamingResponse:
    bus: EventBus = request.app.state.event_bus

    async def stream() -> AsyncIterator[str]:
        q = await bus.subscribe()
        try:
            while True:
                if await request.is_disconnected():
                    return
                try:
                    evt = await asyncio.wait_for(q.get(), timeout=15.0)
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
                    continue
                yield sse_format(evt)
        finally:
            await bus.unsubscribe(q)

    return StreamingResponse(stream(), media_type="text/event-stream")
```

- [ ] **Step 7.4: Wire into server.py**

In lifespan:
```python
from myvoice.watch import EventBus, watch_task
# ...
app.state.event_bus = EventBus()
app.state.watch_stop = asyncio.Event()
app.state.watch_task_handle = asyncio.create_task(
    watch_task(pack_roots, app.state.event_bus, app.state.pack_store, app.state.watch_stop)
)
yield
# shutdown
app.state.watch_stop.set()
await app.state.watch_task_handle
```

Also: in `config` route's `pack_paths` change handler, after `pack_store.rescan(...)`, restart the watch task with new roots.

- [ ] **Step 7.5: Write watch test**

`packages/api/tests/test_watch.py`:
```python
import asyncio
import pytest
from pathlib import Path
from myvoice.watch import EventBus, watch_task


@pytest.mark.asyncio
async def test_pack_update_event(tmp_path: Path):
    # Create a fake pack root
    pack_dir = tmp_path / "testpack"
    pack_dir.mkdir()
    (pack_dir / "stylepack.yaml").write_text("spec_version: '1.0'\npack:\n  slug: testpack\n  name: t\n  version: '1.0'\npersona:\n  identity: i\n  one_line: o\n")
    (pack_dir / "style-guide.md").write_text("hello\n")

    from myvoice.packs.store import PackStore
    store = PackStore([tmp_path])

    bus = EventBus()
    stop = asyncio.Event()
    task = asyncio.create_task(watch_task([tmp_path], bus, store, stop))
    await asyncio.sleep(0.1)
    q = await bus.subscribe()

    # Modify a file in the pack
    await asyncio.sleep(0.1)
    (pack_dir / "style-guide.md").write_text("changed\n")

    try:
        evt = await asyncio.wait_for(q.get(), timeout=3.0)
    finally:
        stop.set()
        await asyncio.wait_for(task, timeout=2.0)

    assert evt["type"].startswith("pack:")
    assert evt["slug"] == "testpack"
```

Run: `uv run pytest packages/api/tests/ -v`

- [ ] **Step 7.6: Commit**

```bash
git add packages/api
git commit -m "feat(api): samples endpoint + watchfiles + /api/events SSE

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8 — Settings page UI

**Files:**
- Modify: `packages/web/src/routes/SettingsPage.tsx` (replace stub)
- Create: `packages/web/src/api/config.ts`
- Create: `packages/web/src/components/settings/{KeysSection,PackPathsSection,ThemeSection,DefaultsSection,ServerSection}.tsx`
- Create: `packages/web/src/hooks/useTheme.ts`
- Modify: `packages/web/src/components/AppShell.tsx` — add Compose link (placeholder route — wired in Task 9)
- Add dev dep: `react-diff-viewer-continued` (used Task 10, but install now to batch)

- [ ] **Step 8.1: API client**

`packages/web/src/api/config.ts`:
```typescript
import { apiFetch } from "./client";

export interface ProviderConfig {
  api_key: string;
  default_model: string | null;
}

export interface Config {
  version: number;
  server: { port: number; open_browser: boolean };
  ui: { default_pack: string | null; theme: "light" | "dark" | "system" };
  pack_paths: string[];
  providers: { anthropic: ProviderConfig; openai: ProviderConfig; google: ProviderConfig };
  features: { default_compose_provider: string; default_extraction_provider: string };
}

export interface ModelInfo {
  id: string;
  label: string;
  context_window: number;
  supports_streaming: boolean;
}

export async function getConfig(): Promise<Config> {
  return apiFetch<Config>("/api/config");
}

export async function putConfig(patch: Partial<Config> | Record<string, unknown>): Promise<Config> {
  return apiFetch<Config>("/api/config", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function listModels(provider: "anthropic" | "openai" | "google"): Promise<ModelInfo[]> {
  return apiFetch<ModelInfo[]>(`/api/providers/${provider}/models`);
}
```

Confirm `apiFetch` signature in existing `api/client.ts`; if different, adapt the calls.

- [ ] **Step 8.2: useTheme hook**

`packages/web/src/hooks/useTheme.ts`:
```typescript
import { useEffect } from "react";

export function useTheme(theme: "light" | "dark" | "system"): void {
  useEffect(() => {
    const root = document.documentElement;
    const resolve = () => {
      if (theme === "system") {
        const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        root.classList.toggle("dark", dark);
      } else {
        root.classList.toggle("dark", theme === "dark");
      }
    };
    resolve();
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", resolve);
      return () => mq.removeEventListener("change", resolve);
    }
  }, [theme]);
}
```

- [ ] **Step 8.3: Build the SettingsPage**

Replace `packages/web/src/routes/SettingsPage.tsx` with a real form. Key shape:

```tsx
import { useEffect, useState } from "react";
import type { Config } from "../api/config";
import { getConfig, putConfig } from "../api/config";
import { KeysSection } from "../components/settings/KeysSection";
import { PackPathsSection } from "../components/settings/PackPathsSection";
import { ThemeSection } from "../components/settings/ThemeSection";
import { DefaultsSection } from "../components/settings/DefaultsSection";
import { ServerSection } from "../components/settings/ServerSection";

export function SettingsPage(): JSX.Element {
  const [loaded, setLoaded] = useState<Config | null>(null);
  const [draft, setDraft] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getConfig().then((c) => { setLoaded(c); setDraft(c); }).catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="p-8 text-red-400">Error: {error}</div>;
  if (!draft) return <div className="p-8 text-slate-500">Loading settings…</div>;

  const dirty = JSON.stringify(loaded) !== JSON.stringify(draft);

  const save = async () => {
    setSaving(true);
    try {
      const next = await putConfig(draft);
      setLoaded(next);
      setDraft(next);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">
      <div className="flex items-center justify-between sticky top-0 bg-slate-900 py-3 -mx-8 px-8 border-b border-slate-800">
        <h1 className="text-2xl font-semibold text-slate-100">Settings</h1>
        <div className="flex gap-2">
          <button onClick={() => setDraft(loaded)} disabled={!dirty || saving}
            className="px-3 py-1.5 text-sm border border-slate-700 rounded text-slate-300 hover:bg-slate-800 disabled:opacity-50">
            Discard
          </button>
          <button onClick={save} disabled={!dirty || saving}
            className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded disabled:opacity-50">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
      <KeysSection draft={draft} setDraft={setDraft} />
      <PackPathsSection draft={draft} setDraft={setDraft} />
      <ThemeSection draft={draft} setDraft={setDraft} />
      <DefaultsSection draft={draft} setDraft={setDraft} />
      <ServerSection draft={draft} />
    </div>
  );
}
```

Each `components/settings/*.tsx` is a thin section that reads/writes a slice of the draft config. KeysSection includes a "Test connection" button per provider that calls `listModels(name)`.

(Full component code follows the same pattern — masked password input, "Test connection" button showing ✓/✗ with model count.)

- [ ] **Step 8.4: Add Compose link to AppShell**

Modify `AppShell.tsx` sidebar to include a "Compose & test" nav link (target: `/compose`). The route itself is added in Task 9.

- [ ] **Step 8.5: Vitest tests for SettingsPage**

`packages/web/src/routes/SettingsPage.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { SettingsPage } from "./SettingsPage";

vi.mock("../api/config", () => ({
  getConfig: vi.fn().mockResolvedValue({
    version: 1,
    server: { port: 7878, open_browser: true },
    ui: { default_pack: null, theme: "system" },
    pack_paths: [],
    providers: {
      anthropic: { api_key: "", default_model: null },
      openai: { api_key: "", default_model: null },
      google: { api_key: "", default_model: null },
    },
    features: { default_compose_provider: "anthropic", default_extraction_provider: "anthropic" },
  }),
  putConfig: vi.fn(async (patch) => ({ ...patch })),
  listModels: vi.fn().mockResolvedValue([]),
}));

describe("SettingsPage", () => {
  it("renders sections", async () => {
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByText("Settings")).toBeInTheDocument());
    expect(screen.getByText(/API keys/i)).toBeInTheDocument();
    expect(screen.getByText(/Pack paths/i)).toBeInTheDocument();
    expect(screen.getByText(/Theme/i)).toBeInTheDocument();
  });
});
```

Run: `cd packages/web && pnpm test`

- [ ] **Step 8.6: Lint + typecheck + commit**

```bash
cd packages/web && pnpm lint && pnpm typecheck
cd /Users/dbbaskette/Projects/myvoice && git add packages/web
git commit -m "feat(web): Settings page — API keys + pack_paths + theme + defaults

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9 — Compose page UI (core)

**Files:**
- Modify: `packages/web/src/App.tsx` — add `/compose/:slug?` route
- Create: `packages/web/src/routes/ComposePage.tsx`
- Create: `packages/web/src/api/{compose,rewrite,jobs}.ts`
- Create: `packages/web/src/hooks/{useEventStream,useDebouncedLint}.ts`
- Create: `packages/web/src/components/compose/{ControlsBar,InputPane,OutputPane,LintOverlay,Receipt}.tsx`
- Create: `packages/web/src/styles/lint.css`

- [ ] **Step 9.1: API clients**

`packages/web/src/api/compose.ts`:
```typescript
import { apiFetch } from "./client";

export interface LintHit {
  start: number;
  end: number;
  kind: "banished_word" | "banished_phrase" | "rule" | "positive_hit";
  rule_id: string;
  message: string;
}

export async function composePrompt(req: {
  pack: string; format?: string; samples?: string[]; draft?: string;
}): Promise<{ prompt: string; char_count: number; samples_used: string[] }> {
  return apiFetch("/api/compose", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req),
  });
}

export async function lintText(req: { pack: string; text: string }): Promise<{ violations: LintHit[]; hits: LintHit[] }> {
  return apiFetch("/api/lint", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req),
  });
}
```

`packages/web/src/api/rewrite.ts`:
```typescript
import { apiFetch } from "./client";

export async function startRewrite(req: {
  pack: string; format?: string; samples?: string[]; draft: string;
  provider: string; model: string;
}): Promise<{ job_id: string }> {
  return apiFetch("/api/rewrite", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req),
  });
}
```

`packages/web/src/api/jobs.ts`:
```typescript
import { apiFetch } from "./client";

export async function cancelJob(jobId: string): Promise<void> {
  await apiFetch(`/api/jobs/${jobId}`, { method: "DELETE" });
}

export function jobEventsUrl(jobId: string): string {
  return `/api/jobs/${jobId}/events`;
}
```

- [ ] **Step 9.2: useEventStream hook**

`packages/web/src/hooks/useEventStream.ts`:
```typescript
import { useEffect } from "react";

export interface JobEvent {
  type: "stage" | "token" | "complete" | "error";
  [key: string]: unknown;
}

export function useJobEventStream(
  jobId: string | null,
  onEvent: (evt: JobEvent) => void
): void {
  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`/api/jobs/${jobId}/events`);
    es.onmessage = (e) => {
      try {
        onEvent(JSON.parse(e.data));
      } catch {
        // ignore malformed
      }
    };
    es.onerror = () => {
      es.close();
    };
    return () => es.close();
  }, [jobId, onEvent]);
}
```

- [ ] **Step 9.3: ComposePage**

`packages/web/src/routes/ComposePage.tsx`:
```tsx
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ControlsBar, type ComposeControls } from "../components/compose/ControlsBar";
import { InputPane } from "../components/compose/InputPane";
import { OutputPane } from "../components/compose/OutputPane";
import { Receipt, type ReceiptData } from "../components/compose/Receipt";
import { lintText, type LintHit } from "../api/compose";
import { startRewrite } from "../api/rewrite";
import { useJobEventStream, type JobEvent } from "../hooks/useEventStream";
import { listPacks, type PackSummary } from "../api/packs";

export function ComposePage(): JSX.Element {
  const { slug } = useParams<{ slug?: string }>();
  const [packs, setPacks] = useState<PackSummary[]>([]);
  const [controls, setControls] = useState<ComposeControls | null>(null);
  const [draft, setDraft] = useState("");
  const [output, setOutput] = useState("");
  const [inputHits, setInputHits] = useState<LintHit[]>([]);
  const [outputHits, setOutputHits] = useState<LintHit[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);

  useEffect(() => { listPacks().then(setPacks); }, []);

  // Initialize controls when pack list arrives
  useEffect(() => {
    if (!controls && packs.length > 0) {
      const initial = slug || packs[0].slug;
      setControls({ pack: initial, format: null, samples: [], provider: "anthropic", model: "" });
    }
  }, [packs, slug, controls]);

  // Debounced input lint
  useEffect(() => {
    if (!controls?.pack || !draft) { setInputHits([]); return; }
    const t = setTimeout(() => {
      lintText({ pack: controls.pack, text: draft }).then((r) => {
        setInputHits([...r.violations, ...r.hits]);
      }).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [draft, controls?.pack]);

  const onEvent = useCallback((e: JobEvent) => {
    if (e.type === "token" && typeof e.delta === "string") {
      setOutput((prev) => prev + e.delta);
    } else if (e.type === "complete" && e.result) {
      const r = e.result as any;
      setOutput(r.output);
      setOutputHits([...(r.lint_violations || []), ...(r.lint_hits || [])]);
      setReceipt({
        model: r.model, provider: r.provider,
        inputTokens: r.input_tokens, outputTokens: r.output_tokens,
        costUsd: r.cost_usd, finishReason: r.finish_reason,
      });
      setJobId(null);
    } else if (e.type === "error") {
      setError({ message: (e.message as string) || "Error", hint: e.hint as string | undefined });
      setJobId(null);
    }
  }, []);

  useJobEventStream(jobId, onEvent);

  const onRewrite = async () => {
    if (!controls?.pack || !controls.model) return;
    setOutput("");
    setOutputHits([]);
    setReceipt(null);
    setError(null);
    try {
      const { job_id } = await startRewrite({
        pack: controls.pack,
        format: controls.format ?? undefined,
        samples: controls.samples,
        draft,
        provider: controls.provider,
        model: controls.model,
      });
      setJobId(job_id);
    } catch (e: any) {
      setError({ message: e.message ?? String(e) });
    }
  };

  if (!controls) return <div className="p-8 text-slate-500">Loading…</div>;

  return (
    <div className="h-full flex flex-col">
      <ControlsBar
        controls={controls}
        setControls={setControls}
        packs={packs}
        onRewrite={onRewrite}
        running={jobId !== null}
      />
      <div className="flex-1 flex min-h-0">
        <InputPane draft={draft} setDraft={setDraft} hits={inputHits} />
        <OutputPane
          output={output}
          hits={outputHits}
          streaming={jobId !== null}
          error={error}
          packSlug={controls.pack}
        />
      </div>
      {receipt && <Receipt receipt={receipt} />}
    </div>
  );
}
```

`components/compose/ControlsBar.tsx`: pack/format/samples/provider/model selectors. Provider/model dropdowns populate from `/api/config` and `/api/providers/{p}/models`. Re-evaluate model list when provider changes. Includes "View prompt" button (deferred to Task 10) and "Rewrite" button.

`components/compose/InputPane.tsx`: CodeMirror 6 editor (or `<textarea>` MVP — keep as simple textarea in Task 9; CodeMirror overlay added in Task 10 alongside diff). Render hits as below-the-pane list grouped by `kind`. Highlights: simple span-replacement in a read-only mirror element for now.

`components/compose/OutputPane.tsx`: streamed text renders as `<pre>`; on complete, highlights painted via span replacement. Buttons: Copy (Task 9), Diff/Save-as-sample (Task 10).

`components/compose/Receipt.tsx`: `model · {seconds}s · {in} in / {out} out · ~${cost}`.

`styles/lint.css`:
```css
.lint-banished_word   { background-color: rgba(251, 146, 60, 0.4); }
.lint-banished_phrase { background-color: rgba(244, 114, 182, 0.4); }
.lint-rule            { background-color: rgba(167, 139, 250, 0.4); }
.lint-positive_hit    { background-color: rgba(74, 222, 128, 0.4); }
```

Add `import "../styles/lint.css"` in `main.tsx`.

- [ ] **Step 9.4: Add route**

`packages/web/src/App.tsx` — add:
```tsx
<Route path="/compose" element={<ComposePage />} />
<Route path="/compose/:slug" element={<ComposePage />} />
```

- [ ] **Step 9.5: Tests**

`packages/web/src/routes/ComposePage.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ComposePage } from "./ComposePage";

vi.mock("../api/packs", () => ({
  listPacks: vi.fn().mockResolvedValue([{ slug: "dan", name: "Dan", version: "3.0", valid: true, error_count: 0 }]),
}));
vi.mock("../api/compose", () => ({
  lintText: vi.fn().mockResolvedValue({ violations: [], hits: [] }),
}));
vi.mock("../api/rewrite", () => ({
  startRewrite: vi.fn().mockResolvedValue({ job_id: "test-job" }),
}));

describe("ComposePage", () => {
  it("renders selectors after packs load", async () => {
    render(<MemoryRouter><ComposePage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/Rewrite/i)).toBeInTheDocument());
  });
});
```

Run: `pnpm test`.

- [ ] **Step 9.6: Commit**

```bash
git add packages/web
git commit -m "feat(web): Compose page — selectors + streaming + lint highlighting + receipt

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10 — Compose polish (View prompt, Diff, Save-as-sample)

**Files:**
- Create: `packages/web/src/components/compose/{ViewPromptModal,SaveSampleDialog,DiffView}.tsx`
- Create: `packages/web/src/api/samples.ts`
- Modify: `packages/web/src/components/compose/{ControlsBar,OutputPane}.tsx`
- Add dep: `react-diff-viewer-continued` (if not added in Task 8)

- [ ] **Step 10.1: samples API client**

`packages/web/src/api/samples.ts`:
```typescript
import { apiFetch } from "./client";

export async function saveSample(slug: string, body: { excerpt: string; source_url?: string; note?: string }): Promise<{ id: string; file: string }> {
  return apiFetch(`/api/packs/${slug}/samples`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
```

- [ ] **Step 10.2: ViewPromptModal**

`ViewPromptModal.tsx`: dialog overlay; calls `composePrompt({pack, format, samples, draft})`; shows in a `<pre>` with Copy button. Triggered from ControlsBar's "View prompt" button.

- [ ] **Step 10.3: SaveSampleDialog**

`SaveSampleDialog.tsx`: dialog with form (excerpt textarea prefilled with output, optional source_url, optional note). On submit calls `saveSample(slug, ...)`. Shows toast on success.

- [ ] **Step 10.4: DiffView**

`DiffView.tsx`: thin wrapper around `react-diff-viewer-continued`'s `<ReactDiffViewer oldValue={input} newValue={output} splitView />`. Toggle in OutputPane; when on, replace plain-output rendering with DiffView.

- [ ] **Step 10.5: Wire polish features into Output/Controls**

OutputPane gets `[Diff ⇄] [Copy] [Save as sample]` actions in a row. Diff toggles state. Save opens SaveSampleDialog. Copy uses `navigator.clipboard.writeText(output)`.

ControlsBar gets "View prompt" button between Model and Rewrite.

- [ ] **Step 10.6: Tests + commit**

Quick Vitest cases:
- ViewPromptModal renders prompt fetched from API
- SaveSampleDialog submission calls saveSample and closes

```bash
pnpm lint && pnpm typecheck && pnpm test
git add packages/web
git commit -m "feat(web): Compose polish — View prompt, Diff, Save-as-sample, Copy

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11 — Playwright E2E + README

**Files:**
- Create: `playwright.config.ts` (repo root)
- Create: `e2e/compose-rewrite.spec.ts`, `e2e/settings-keys.spec.ts`
- Create: `e2e/fixtures/mock-server.ts` (helper to start API with MYVOICE_TEST_PROVIDER=mock)
- Modify: `README.md` — add "Compose & test" section
- Add devDep (root or web): `@playwright/test`

- [ ] **Step 11.1: Install Playwright**

```bash
cd /Users/dbbaskette/Projects/myvoice
pnpm add -D -w @playwright/test 2>/dev/null || (cd packages/web && pnpm add -D @playwright/test)
npx playwright install chromium
```

- [ ] **Step 11.2: playwright.config.ts**

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:7879", trace: "on-first-retry" },
  webServer: [
    {
      command: "MYVOICE_TEST_PROVIDER=mock MYVOICE_MOCK_OUTPUT='Plan. Build. Ship.' uv run myvoice serve --no-browser --dev --port 7878",
      port: 7878,
      reuseExistingServer: !process.env.CI,
      timeout: 20_000,
    },
    {
      command: "cd packages/web && pnpm dev --port 7879 --host 127.0.0.1",
      port: 7879,
      reuseExistingServer: !process.env.CI,
      timeout: 20_000,
    },
  ],
});
```

- [ ] **Step 11.3: e2e/compose-rewrite.spec.ts**

```typescript
import { test, expect } from "@playwright/test";

test("compose: paste draft, rewrite, save as sample", async ({ page }) => {
  await page.goto("/");
  // Set a mock key in Settings first
  await page.click("text=Settings");
  await page.getByLabel(/Anthropic API key/i).fill("sk-mock");
  await page.click("text=Save changes");

  // Go to Compose
  await page.click("text=Compose & test");
  await page.locator("textarea").fill("Rewrite this in Dan's voice.");
  await page.click("text=Rewrite");

  // Wait for streamed output
  await expect(page.locator(".output-pane")).toContainText("Plan", { timeout: 10000 });

  // Save as sample
  await page.click("text=Save as sample");
  await page.click("text=Save"); // confirm dialog
  await expect(page.locator(".toast")).toContainText("Saved as sample");
});
```

- [ ] **Step 11.4: e2e/settings-keys.spec.ts**

```typescript
import { test, expect } from "@playwright/test";

test("settings: masked key roundtrip", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel(/Anthropic API key/i).fill("sk-ant-realsecret");
  await page.click("text=Save changes");
  await page.reload();
  const masked = await page.getByLabel(/Anthropic API key/i).inputValue();
  expect(masked).toContain("***");
});
```

- [ ] **Step 11.5: README update**

Append a Compose & test section to README.md with usage walkthrough and screenshot placeholder (`docs/screenshots/compose.png` to capture later).

- [ ] **Step 11.6: Run all tests, lint, typecheck**

```bash
uv run pytest packages/api/tests -v
cd packages/web && pnpm lint && pnpm typecheck && pnpm test
npx playwright test
```

If anything fails, fix before commit.

- [ ] **Step 11.7: Commit + open PR**

```bash
git add e2e playwright.config.ts README.md package.json packages/web/package.json
git commit -m "test(e2e): Playwright compose + settings; docs: Compose & test section

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push -u origin phase-4-compose-and-test
gh pr create --title "Phase 4: Compose & test" --body "$(cat <<'EOF'
## Summary
- LLM provider abstraction with Anthropic, OpenAI, Google adapters + cost calc + rate card
- Config backend (GET/PUT /api/config) with API-key redaction + atomic writes
- JobRegistry + /api/jobs/{id} + SSE event streams with replay buffer
- /api/rewrite (async streaming) + /api/compose & /api/lint (sync) + positive-hit detectors
- POST /api/packs/{slug}/samples + watchfiles + /api/events global SSE
- Settings page (API keys, pack_paths, theme, defaults)
- Compose & test page (selectors, streaming, lint highlights, View prompt, Diff, Save-as-sample)
- Playwright E2E + README update

## Test plan
- [ ] uv run pytest passes
- [ ] pnpm test passes
- [ ] pnpm lint passes
- [ ] pnpm typecheck passes
- [ ] npx playwright test passes
- [ ] Manual: set real Anthropic key, rewrite a draft through Compose page
- [ ] Manual: external edit to packs/dan/style-guide.md surfaces in UI
EOF
)"
```

---

## Self-review notes

- **Spec coverage:** every section of the spec maps to a task — providers (T1-3), config (T4), jobs/SSE (T5), routes (T6-7), settings UI (T8), compose UI (T9-10), file watching (T7), testing (T11).
- **Type consistency:** `LintHit` shape consistent across `lint.py`, `/api/lint`, `/api/rewrite` result, frontend `api/compose.ts`, components. `Job` model fields match between models.py, registry.py, jobs route, and frontend `useEventStream`.
- **Mock provider:** the env-var-gated `MockProvider` in `test_helpers/` is used by the Python rewrite-route test (T6.6), the Vitest mock for ComposePage (T9.5), and Playwright (T11). One source of truth.
- **One missing piece flagged:** the existing `compose.py` module's `compose_prompt` function signature is assumed in T6.4 — implementer must inspect the existing module and reconcile. Same caveat for `PackStore.save_manifest` / `rescan` / `rescan_one` in T4 and T7 — extend the store if those methods don't already exist.
