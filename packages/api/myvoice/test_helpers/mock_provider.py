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
        return [
            ModelInfo(id="mock-1", label="Mock Model", context_window=8000, supports_streaming=True)
        ]

    async def complete(
        self, *, model: str, prompt: str, json_schema: dict[str, object] | None = None
    ) -> LLMResponse:
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
