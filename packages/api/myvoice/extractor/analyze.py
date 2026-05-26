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
    result: dict[str, object] = json.loads(_SCHEMA_PATH.read_text(encoding="utf-8"))
    return result


async def analyze(
    docs: list[CleanedDoc],
    provider: LLMProvider,
    *,
    model: str,
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
