"""Tests for the shared AI-tells loader and merge helpers."""

from myvoice.ai_tells import (
    effective_phrases,
    effective_sentence_starters,
    effective_words,
    load_ai_tells,
)
from myvoice.packs.manifest import Manifest


def _manifest(
    words: list[str] | None = None,
    phrases: list[str] | None = None,
    starters: list[str] | None = None,
) -> Manifest:
    return Manifest.model_validate(
        {
            "spec_version": "1.0",
            "pack": {"slug": "t", "name": "T", "version": "1.0", "author": "T"},
            "persona": {"identity": "T", "one_line": "T"},
            "banished": {"words": words or [], "phrases": phrases or []},
            "rules": {"no_sentence_starters": starters or []},
        }
    )


def test_load_skips_comments_and_blanks() -> None:
    tells = load_ai_tells()
    assert "delve" in tells.words
    assert not any(w.startswith("#") for w in tells.words)
    assert "" not in tells.words
    assert "a testament to" in tells.phrases
    assert "Moreover" in tells.sentence_starters
    assert tells.patterns.strip()


def test_load_includes_westcliff_additions() -> None:
    tells = load_ai_tells()
    for phrase in ("this paper presents", "another key factor"):
        assert phrase in tells.phrases
    assert "Synthesize, don't summarize" in tells.patterns
    assert "generic praise adjectives" in tells.patterns


def test_effective_words_is_deduped_union() -> None:
    m = _manifest(words=["frobnicate", "DELVE"])
    eff = effective_words(m)
    assert "delve" in eff
    assert "frobnicate" in eff
    assert sum(1 for w in eff if w.lower() == "delve") == 1
    assert eff.index("delve") < eff.index("frobnicate")


def test_effective_phrases_and_starters_merge() -> None:
    m = _manifest(phrases=["pack phrase"], starters=["Frankly"])
    assert "a testament to" in effective_phrases(m)
    assert "pack phrase" in effective_phrases(m)
    assert "Moreover" in effective_sentence_starters(m)
    assert "Frankly" in effective_sentence_starters(m)
