"""Tests for PackStore."""

from pathlib import Path

from myvoice.packs.store import PackStore


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


def test_store_indexes_packs_on_init(tmp_path: Path) -> None:
    _write_minimal_pack(tmp_path, "alpha")
    _write_minimal_pack(tmp_path, "beta")
    store = PackStore([tmp_path])
    assert sorted(store.slugs()) == ["alpha", "beta"]


def test_store_get_returns_pack_info(tmp_path: Path) -> None:
    _write_minimal_pack(tmp_path, "alpha")
    store = PackStore([tmp_path])
    info = store.get("alpha")
    assert info is not None
    assert info.slug == "alpha"


def test_store_get_unknown_returns_none(tmp_path: Path) -> None:
    store = PackStore([tmp_path])
    assert store.get("ghost") is None


def test_store_reload_picks_up_new_pack(tmp_path: Path) -> None:
    store = PackStore([tmp_path])
    assert store.slugs() == []
    _write_minimal_pack(tmp_path, "alpha")
    store.reload()
    assert store.slugs() == ["alpha"]


def test_store_first_root_wins_on_slug_conflict(tmp_path: Path) -> None:
    high = tmp_path / "high"
    low = tmp_path / "low"
    _write_minimal_pack(high, "shared")
    _write_minimal_pack(low, "shared")
    store = PackStore([high, low])
    info = store.get("shared")
    assert info is not None
    assert info.root_path.parent == high


def test_store_conflicts_lists_both_paths(tmp_path: Path) -> None:
    high = tmp_path / "high"
    low = tmp_path / "low"
    _write_minimal_pack(high, "shared")
    _write_minimal_pack(low, "shared")
    store = PackStore([high, low])
    conflicts = store.conflicts()
    assert "shared" in conflicts
    assert len(conflicts["shared"]) == 2
