"""Resolve a provider name + api key to an LLMProvider instance."""
from __future__ import annotations

from collections.abc import Callable

from myvoice.llm.anthropic import AnthropicProvider
from myvoice.llm.base import LLMProvider
from myvoice.llm.exceptions import ProviderError, ProviderMissingKey  # noqa: F401
from myvoice.llm.openai import OpenAIProvider

_FACTORIES: dict[str, Callable[[str], LLMProvider]] = {
    "anthropic": lambda api_key: AnthropicProvider(api_key=api_key),
    "openai": lambda api_key: OpenAIProvider(api_key=api_key),
    # Google added in Task 3
}


def get_provider(name: str, api_key: str) -> LLMProvider:
    if name not in _FACTORIES:
        raise ProviderError(f"Unknown provider: {name}")
    return _FACTORIES[name](api_key)
