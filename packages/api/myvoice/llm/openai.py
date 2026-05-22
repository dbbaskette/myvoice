"""OpenAI Chat Completions adapter — httpx directly."""
from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Literal

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
        self, *, model: str, prompt: str, json_schema: dict[str, object] | None = None
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
        return LLMResponse(
            text=choice["message"]["content"] or "",
            input_tokens=int(data.get("usage", {}).get("prompt_tokens", 0)),
            output_tokens=int(data.get("usage", {}).get("completion_tokens", 0)),
            model=data.get("model", model),
            finish_reason=_map_finish(choice.get("finish_reason")),
        )

    async def stream(self, *, model: str, prompt: str) -> AsyncIterator[StreamChunk]:
        body: dict[str, object] = {
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
                finish: Literal["stop", "length", "error"] = "stop"
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
                yield StreamChunk(
                    usage=Usage(input_tokens=in_tok, output_tokens=out_tok, finish_reason=finish)
                )

    def _raise_for_status(self, r: httpx.Response) -> None:
        if r.status_code < 400:
            return
        self._raise_for_response(r.status_code, r.text, r.headers)

    def _raise_for_response(self, status: int, body: str, headers: httpx.Headers) -> None:
        if status == 401:
            raise ProviderMissingKey("openai")
        if status == 429:
            retry = headers.get("retry-after")
            raise ProviderRateLimit(
                f"OpenAI rate limit: {body[:200]}",
                retry_after_seconds=int(retry) if retry and retry.isdigit() else None,
            )
        raise ProviderError(f"openai {status}: {body[:500]}")


def _map_finish(reason: str | None) -> Literal["stop", "length", "error"]:
    if reason in (None, "stop"):
        return "stop"
    if reason == "length":
        return "length"
    return "error"
