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
        {
            "excerpt": "A great sample.",
            "source_location": "https://e.com/",
            "why": "captures the voice",
            "rank": 1,
        }
    ],
    "pop_culture_allowed": ["Marvel"],
    "pop_culture_banned": [],
}


def test_build_corpus_joins_with_separators() -> None:
    docs = [
        CleanedDoc(
            source=Source(kind="url", location="https://e.com/a", succeeded=True),
            text="post A body",
        ),
        CleanedDoc(
            source=Source(kind="file", location="draft.md", succeeded=True),
            text="draft body",
        ),
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
        CleanedDoc(
            source=Source(kind="url", location="https://e.com/", succeeded=True),
            text="body",
        ),
    ]
    result, in_tok, _out_tok = await analyze(docs, provider, model="mock-1")
    assert result.persona_identity == "The Builder"
    assert result.banished_words[0].word == "delve"
    assert len(result.samples) == 1
    assert in_tok > 0
