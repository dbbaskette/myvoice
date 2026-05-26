"""Smoke test: every public name imports + a basic round-trip works."""
from __future__ import annotations

from pathlib import Path

import myvoice

_EXPECTED = {
    "__version__",
    "PackStore",
    "Manifest",
    "compose_prompt",
    "lint",
    "lint_to_hits",
    "detect_positive_hits",
    "validate_pack",
    "Violation",
    "LintHit",
}


def test_all_public_names_present() -> None:
    assert set(myvoice.__all__) == _EXPECTED
    for name in _EXPECTED:
        assert hasattr(myvoice, name), f"myvoice.{name} missing"


def test_library_round_trip() -> None:
    """Mirror what a downstream library consumer (e.g., Pencraft) would do."""
    from myvoice import PackStore, compose_prompt, lint, validate_pack

    repo_packs = Path(__file__).resolve().parents[3] / "packs"
    store = PackStore([repo_packs])
    assert "dan" in store.slugs()

    dan = store.get("dan")
    assert dan is not None
    assert dan.valid

    result = validate_pack(dan.root_path)
    assert result.errors == []
    assert result.manifest is not None

    prompt = compose_prompt(dan.root_path, draft="A short draft.")
    assert "A short draft." in prompt
    assert len(prompt) > 100  # non-trivial

    violations = lint(result.manifest, "Let me delve into this.")
    assert any("delve" in v.match for v in violations)
