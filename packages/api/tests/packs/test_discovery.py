"""Tests for pack discovery."""

from pathlib import Path

from myvoice.packs.discovery import discover_packs


def _write_minimal_pack(root: Path, slug: str) -> Path:
    pack = root / slug
    pack.mkdir(parents=True)
    (pack / "stylepack.yaml").write_text(
        f'spec_version: "1.0"\n'
        f"pack:\n  slug: {slug}\n  name: {slug}\n  version: '0.1'\n  author: t\n"
        "persona:\n  identity: a\n  one_line: b\n"
    )
    (pack / "style-guide.md").write_text("body")
    return pack


def test_discover_empty_dir_returns_empty(tmp_path: Path) -> None:
    assert discover_packs([tmp_path]) == []


def test_discover_finds_one_pack(tmp_path: Path) -> None:
    _write_minimal_pack(tmp_path, "alpha")
    packs = discover_packs([tmp_path])
    assert len(packs) == 1
    assert packs[0].slug == "alpha"
    assert packs[0].valid is True


def test_discover_finds_multiple_packs(tmp_path: Path) -> None:
    _write_minimal_pack(tmp_path, "alpha")
    _write_minimal_pack(tmp_path, "beta")
    slugs = {p.slug for p in discover_packs([tmp_path])}
    assert slugs == {"alpha", "beta"}


def test_discover_ignores_dirs_without_manifest(tmp_path: Path) -> None:
    (tmp_path / "not-a-pack").mkdir()
    (tmp_path / "not-a-pack" / "readme.md").write_text("not a pack")
    assert discover_packs([tmp_path]) == []


def test_discover_surfaces_invalid_packs_with_errors(tmp_path: Path) -> None:
    pack = tmp_path / "broken"
    pack.mkdir()
    (pack / "stylepack.yaml").write_text("not valid yaml: ][")
    info = discover_packs([tmp_path])
    assert len(info) == 1
    assert info[0].slug == "broken"
    assert info[0].valid is False
    assert info[0].errors


def test_discover_multiple_roots_in_priority_order(tmp_path: Path) -> None:
    """First root listed wins on slug conflicts (recorded as such)."""
    high = tmp_path / "high"
    low = tmp_path / "low"
    _write_minimal_pack(high, "shared")
    _write_minimal_pack(low, "shared")
    packs = discover_packs([high, low])
    shared = [p for p in packs if p.slug == "shared"]
    assert len(shared) == 2
    assert shared[0].root_path.parent == high
    assert shared[1].root_path.parent == low
