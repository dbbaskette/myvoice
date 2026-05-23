"""Positive-hit heuristic tests for detect_positive_hits."""
from __future__ import annotations

from myvoice.lint import detect_positive_hits


def test_conflict_opener() -> None:
    hits = detect_positive_hits("For years, teams have struggled with this. Now it works.")
    kinds = [h.rule_id for h in hits]
    assert "hit:conflict_opener" in kinds


def test_speed_to_value() -> None:
    hits = detect_positive_hits("Finally unlock 10x faster pipelines.")
    assert any(h.rule_id == "hit:speed_to_value" for h in hits)


def test_golden_command() -> None:
    text = "Plan. Build. Ship.\n"
    hits = detect_positive_hits(text)
    assert any(h.rule_id == "hit:golden_command" for h in hits)


def test_negative_cases() -> None:
    assert detect_positive_hits("This is unremarkable prose.") == []
