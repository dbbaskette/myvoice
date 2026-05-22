"""Resolve a provider name + api key to an LLMProvider instance."""
from __future__ import annotations

from myvoice.llm.anthropic import AnthropicProvider
from myvoice.llm.base import LLMProvider
from myvoice.llm.exceptions import ProviderError, ProviderMissingKey  # noqa: F401

_FACTORIES = {
    "anthropic": AnthropicProvider,
    # OpenAI, Google added in Tasks 2 & 3
}


def get_provider(name: str, api_key: str) -> LLMProvider:
    if name not in _FACTORIES:
        raise ProviderError(f"Unknown provider: {name}")
    return _FACTORIES[name](api_key=api_key)
