"""Tests for `myvoice pack ...` CLI subcommands."""

from pathlib import Path

from click.testing import CliRunner

from myvoice.cli import main

REPO_ROOT = Path(__file__).resolve().parents[3]


def test_pack_list_shows_dan_not_template() -> None:
    """The repo packs/ dir holds real packs (dan); the _template scaffold lives
    bundled inside the package, so it is not listed as a usable pack."""
    runner = CliRunner()
    result = runner.invoke(
        main, ["pack", "list", "--root", str(REPO_ROOT / "packs")]
    )
    assert result.exit_code == 0
    assert "dan" in result.output
    assert "_template" not in result.output


def test_pack_validate_dan_succeeds() -> None:
    runner = CliRunner()
    result = runner.invoke(
        main, ["pack", "validate", str(REPO_ROOT / "packs" / "dan")]
    )
    assert result.exit_code == 0
    assert "valid" in result.output.lower()


def test_pack_validate_broken_fails(tmp_path: Path) -> None:
    (tmp_path / "stylepack.yaml").write_text("not yaml: ][")
    runner = CliRunner()
    result = runner.invoke(main, ["pack", "validate", str(tmp_path)])
    assert result.exit_code != 0


def test_pack_compose_emits_prompt() -> None:
    runner = CliRunner()
    result = runner.invoke(
        main, ["pack", "compose", str(REPO_ROOT / "packs" / "dan"),
               "--format", "blog-post"]
    )
    assert result.exit_code == 0
    assert "ROLE:" in result.output
    assert "Additional format-specific instructions" in result.output


def test_pack_lint_flags_banished_word(tmp_path: Path) -> None:
    draft = tmp_path / "draft.md"
    draft.write_text("We will delve into the architecture.")
    runner = CliRunner()
    result = runner.invoke(
        main, ["pack", "lint", str(REPO_ROOT / "packs" / "dan"), str(draft)]
    )
    assert result.exit_code != 0  # non-zero on any violation
    assert "delve" in result.output.lower()
