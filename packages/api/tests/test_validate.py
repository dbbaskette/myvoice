"""Tests for the pack validator."""

from pathlib import Path

from myvoice.validate import validate_pack

FIXTURES = Path(__file__).parent / "fixtures" / "packs"


def test_validates_minimal_valid_pack() -> None:
    result = validate_pack(FIXTURES / "valid-minimal")
    assert result.valid is True
    assert result.errors == []


def test_missing_stylepack_yaml_fails(tmp_path: Path) -> None:
    (tmp_path / "style-guide.md").write_text("placeholder")
    result = validate_pack(tmp_path)
    assert result.valid is False
    assert any("stylepack.yaml" in e.message for e in result.errors)


def test_missing_style_guide_md_fails(tmp_path: Path) -> None:
    pack = tmp_path / "x"
    pack.mkdir()
    (pack / "stylepack.yaml").write_text(
        'spec_version: "1.0"\n'
        "pack:\n  slug: x\n  name: X\n  version: \"0.1\"\n  author: Y\n"
        "persona:\n  identity: A\n  one_line: B\n"
    )
    result = validate_pack(pack)
    assert result.valid is False
    assert any("style-guide.md" in e.message for e in result.errors)


def test_slug_must_match_directory_name(tmp_path: Path) -> None:
    pack_dir = tmp_path / "actual-dir-name"
    pack_dir.mkdir()
    (pack_dir / "stylepack.yaml").write_text(
        'spec_version: "1.0"\n'
        "pack:\n  slug: different-slug\n  name: X\n  version: \"0.1\"\n  author: Y\n"
        "persona:\n  identity: A\n  one_line: B\n"
    )
    (pack_dir / "style-guide.md").write_text("body")
    result = validate_pack(pack_dir)
    assert result.valid is False
    assert any("slug" in e.message and "dir" in e.message for e in result.errors)


def test_unknown_rule_key_fails(tmp_path: Path) -> None:
    pack = tmp_path / "x"
    pack.mkdir()
    (pack / "stylepack.yaml").write_text(
        'spec_version: "1.0"\n'
        "pack:\n  slug: x\n  name: X\n  version: \"0.1\"\n  author: Y\n"
        "persona:\n  identity: A\n  one_line: B\n"
        "rules:\n  no_em_dash: true\n"  # typo
    )
    (pack / "style-guide.md").write_text("body")
    result = validate_pack(pack)
    assert result.valid is False
    # pydantic ValidationError message format may vary; just check we got errors
    assert len(result.errors) > 0


def test_sample_file_missing_fails(tmp_path: Path) -> None:
    pack = tmp_path / "x"
    pack.mkdir()
    (pack / "stylepack.yaml").write_text(
        'spec_version: "1.0"\n'
        "pack:\n  slug: x\n  name: X\n  version: \"0.1\"\n  author: Y\n"
        "persona:\n  identity: A\n  one_line: B\n"
        "samples:\n  - id: '01'\n    file: samples/missing.md\n"
    )
    (pack / "style-guide.md").write_text("body")
    result = validate_pack(pack)
    assert result.valid is False
    assert any("samples/missing.md" in e.message for e in result.errors)


def test_sample_without_blockquote_fails(tmp_path: Path) -> None:
    pack = tmp_path / "x"
    pack.mkdir()
    (pack / "stylepack.yaml").write_text(
        'spec_version: "1.0"\n'
        "pack:\n  slug: x\n  name: X\n  version: \"0.1\"\n  author: Y\n"
        "persona:\n  identity: A\n  one_line: B\n"
        "samples:\n  - id: '01'\n    file: samples/01.md\n"
    )
    (pack / "style-guide.md").write_text("body")
    (pack / "samples").mkdir()
    (pack / "samples" / "01.md").write_text("# A sample\n\nNo blockquote here.\n")
    result = validate_pack(pack)
    assert result.valid is False
    assert any("blockquote" in e.message.lower() for e in result.errors)


def test_packs_dan_is_valid() -> None:
    """The reference Dan pack must always validate cleanly."""
    repo_root = Path(__file__).resolve().parents[3]
    result = validate_pack(repo_root / "packs" / "dan")
    assert result.valid is True, "\n".join(
        f"{e.path}: {e.message}" for e in result.errors
    )


def test_packs_template_is_valid() -> None:
    """The _template pack must always validate cleanly — it's the scaffold."""
    repo_root = Path(__file__).resolve().parents[3]
    result = validate_pack(repo_root / "packs" / "_template")
    assert result.valid is True, "\n".join(
        f"{e.path}: {e.message}" for e in result.errors
    )
