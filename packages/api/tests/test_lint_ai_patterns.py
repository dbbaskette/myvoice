"""Tests for the universal structural AI-pattern detector."""

from myvoice.lint import detect_ai_patterns


def test_flags_negation_it_is_not_just() -> None:
    hits = detect_ai_patterns("It's not just a tool, it's a movement.")
    assert any(h.rule_id == "ai_pattern:negation" for h in hits)


def test_flags_not_only_but() -> None:
    hits = detect_ai_patterns("It is not only fast but also cheap.")
    assert any(h.rule_id == "ai_pattern:negation" for h in hits)


def test_flags_inflation_serves_as_and_testament() -> None:
    hits = detect_ai_patterns("It serves as a testament to good design.")
    assert any(h.rule_id == "ai_pattern:inflation" for h in hits)


def test_does_not_flag_plain_triplet_or_features() -> None:
    hits = detect_ai_patterns("Build. Bind. Deploy. The app features a cache.")
    assert hits == []


def test_hits_use_rule_kind() -> None:
    hits = detect_ai_patterns("This isn't just code.")
    assert hits and all(h.kind == "rule" for h in hits)
