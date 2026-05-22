"""Google Gemini adapter (Generative Language API). Uses ?key=<api_key>."""
from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Literal

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
        # Curated allowlist from rates.yaml — google's public list endpoint is messy
        # and does not work cleanly for all user key types.
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
        self, *, model: str, prompt: str, json_schema: dict[str, object] | None = None
    ) -> LLMResponse:
        url = f"{_BASE}/models/{model}:generateContent"
        body: dict[str, object] = {"contents": [{"parts": [{"text": prompt}]}]}
        if json_schema is not None:
            body["generationConfig"] = {
                "response_mime_type": "application/json",
                "response_schema": json_schema,
            }
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
        body: dict[str, object] = {"contents": [{"parts": [{"text": prompt}]}]}
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST", url, params={"key": self._api_key, "alt": "sse"}, json=body
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
                    if not payload:
                        continue
                    evt = json.loads(payload)
                    candidates = evt.get("candidates", [])
                    if candidates:
                        c = candidates[0]
                        for part in c.get("content", {}).get("parts", []):
                            delta = part.get("text", "")
                            if delta:
                                yield StreamChunk(delta=delta)
                        fr = c.get("finishReason")
                        if fr:
                            finish = _map_finish(fr)
                    usage_meta = evt.get("usageMetadata")
                    if usage_meta:
                        in_tok = int(usage_meta.get("promptTokenCount", in_tok))
                        out_tok = int(usage_meta.get("candidatesTokenCount", out_tok))
                yield StreamChunk(
                    usage=Usage(input_tokens=in_tok, output_tokens=out_tok, finish_reason=finish)
                )

    def _raise_for_status(self, r: httpx.Response) -> None:
        if r.status_code < 400:
            return
        self._raise_for_response(r.status_code, r.text, r.headers)

    def _raise_for_response(self, status: int, body: str, headers: httpx.Headers) -> None:
        if status in (401, 403):
            raise ProviderMissingKey("google")
        if status == 429:
            retry = headers.get("retry-after")
            raise ProviderRateLimit(
                f"Google rate limit: {body[:200]}",
                retry_after_seconds=int(retry) if retry and retry.isdigit() else None,
            )
        raise ProviderError(f"google {status}: {body[:500]}")


def _map_finish(reason: str | None) -> Literal["stop", "length", "error"]:
    if reason in (None, "STOP", "FINISH_REASON_UNSPECIFIED"):
        return "stop"
    if reason == "MAX_TOKENS":
        return "length"
    return "error"
