"""Tests for the pack linter."""

from pathlib import Path

import yaml

from myvoice.lint import lint
from myvoice.packs.manifest import Manifest

REPO_ROOT = Path(__file__).resolve().parents[3]


def _load_dan_manifest() -> Manifest:
    return Manifest.model_validate(
        yaml.safe_load((REPO_ROOT / "packs" / "dan" / "stylepack.yaml").read_text())
    )


def test_clean_draft_has_no_violations() -> None:
    m = _load_dan_manifest()
    text = "Build. Bind. Deploy. Scale.\n"
    assert lint(m, text) == []


def test_banished_word_flagged() -> None:
    m = _load_dan_manifest()
    text = "We will delve into the architecture."
    violations = lint(m, text)
    assert any(v.kind == "word" and v.match == "delve" for v in violations)


def test_banished_word_case_insensitive() -> None:
    m = _load_dan_manifest()
    text = "We will Delve into the architecture."
    violations = lint(m, text)
    assert any(v.kind == "word" and v.match.lower() == "delve" for v in violations)


def test_permitted_exception_case_sensitive() -> None:
    """`Pivotal` (capitalized proper noun) is exempt, but `pivotal` (adjective)
    is still flagged."""
    m = _load_dan_manifest()
    # 'Pivotal' the proper noun - exempt
    assert lint(m, "We worked at Pivotal in 2015.") == []
    # 'pivotal' the adjective - still flagged
    violations = lint(m, "It was a pivotal moment.")
    assert any(v.kind == "word" and v.match == "pivotal" for v in violations)


def test_banished_phrase_flagged() -> None:
    m = _load_dan_manifest()
    text = "It's important to note that this matters."
    violations = lint(m, text)
    assert any(v.kind == "phrase" and "important to note" in v.match.lower() for v in violations)


def test_em_dash_flagged() -> None:
    m = _load_dan_manifest()
    text = "Spring Boot is great — it makes deploying easy."
    violations = lint(m, text)
    assert any(v.kind == "rule" and "em dash" in v.message.lower() for v in violations)


def test_ascii_double_hyphen_between_letters_flagged() -> None:
    m = _load_dan_manifest()
    text = "Spring Boot is great--it makes deploying easy."
    violations = lint(m, text)
    assert any(v.kind == "rule" and "double" in v.message.lower() for v in violations)


def test_forbidden_sentence_starter_flagged() -> None:
    m = _load_dan_manifest()
    text = "Furthermore, this is great."
    violations = lint(m, text)
    assert any(v.kind == "rule" and "Furthermore" in v.message for v in violations)


def test_violation_has_line_and_column() -> None:
    m = _load_dan_manifest()
    text = "Good first line.\nWe will delve here.\n"
    violations = lint(m, text)
    found = next(v for v in violations if v.match == "delve")
    assert found.line == 2
    assert found.column == 8  # 0-indexed position of 'd' on line 2
