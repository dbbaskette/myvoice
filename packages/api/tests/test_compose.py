"""Tests for the pack composer."""

from pathlib import Path

import pytest

from myvoice.compose import ComposeError, _render_header, compose
from myvoice.packs.manifest import Manifest

REPO_ROOT = Path(__file__).resolve().parents[3]
PACKS_DIR = REPO_ROOT / "packs"


def _load_dan() -> Path:
    return PACKS_DIR / "dan"


def test_compose_minimal_returns_header_plus_style_guide() -> None:
    """With no format/samples/draft, compose returns header (ROLE/TASK +
    Humanizer rendered from manifest) followed by the style-guide prose."""
    out = compose(_load_dan())
    assert "ROLE:" in out
    assert "The Builder Who Gets It" in out
    assert "## Writing Principles" in out  # from style-guide.md prose
    # Humanizer renders banished words from manifest
    assert "delve" in out
    assert "utilize" in out
    # Permitted exceptions are emitted with their reason
    assert "Pivotal" in out
    # The draft trailer is NOT present when no draft was passed
    assert "INPUT TEXT TO REWRITE" not in out


def test_compose_with_format_appends_format_section() -> None:
    out = compose(_load_dan(), format="blog-post")
    assert "Additional format-specific instructions" in out
    idx = out.index("Additional format-specific instructions")
    assert len(out[idx:]) > 50


def test_compose_with_samples_appends_blockquote_lines_only() -> None:
    out = compose(_load_dan(), samples=["01", "04"])
    assert "Voice exemplars" in out
    idx = out.index("Voice exemplars")
    body = out[idx:]
    # The samples markdown contains meta paragraphs outside blockquotes;
    # only the blockquote bodies should appear.
    assert "**Source:**" not in body


def test_compose_with_draft_appends_input_trailer() -> None:
    out = compose(_load_dan(), draft="This is my draft text.")
    assert "INPUT TEXT TO REWRITE" in out
    assert "This is my draft text." in out


def test_compose_bio_only_emits_bio_body_without_assembly() -> None:
    """`bio=...` is a separate output mode — just the bio body, no prompt."""
    out = compose(_load_dan(), bio="twitter")
    # Body present
    assert "Head of Technical Marketing" in out
    # No prompt assembly: should NOT contain the ROLE header
    assert "ROLE:" not in out
    # The italic char-count note SHOULD be stripped
    assert "155 characters" not in out


def test_compose_unknown_format_raises() -> None:
    with pytest.raises(ComposeError, match="format 'no-such-format' not found"):
        compose(_load_dan(), format="no-such-format")


def test_compose_unknown_sample_id_raises() -> None:
    with pytest.raises(ComposeError, match="sample 'xx' not found"):
        compose(_load_dan(), samples=["xx"])


def test_compose_unknown_bio_raises() -> None:
    with pytest.raises(ComposeError, match="bio 'no-such-bio' not found"):
        compose(_load_dan(), bio="no-such-bio")


def _manifest(tone: str | None) -> Manifest:
    persona: dict[str, str] = {"identity": "The Tester", "one_line": "Writes tests."}
    if tone is not None:
        persona["tone"] = tone
    return Manifest.model_validate(
        {
            "spec_version": "1.0",
            "pack": {"slug": "t", "name": "T", "version": "1.0", "author": "T"},
            "persona": persona,
        }
    )


def test_header_uses_persona_tone_when_set() -> None:
    out = _render_header(_manifest("calm, precise, and warm"))
    assert "The output must be calm, precise, and warm." in out
    assert "energetic, definitive, and transparent" not in out


def test_header_falls_back_when_tone_absent() -> None:
    out = _render_header(_manifest(None))
    assert "The output must be authentic to the author's voice." in out


def test_compose_injects_default_writing_craft() -> None:
    """With no per-pack override, the shared baseline default is injected."""
    out = compose(_load_dan())
    assert "## Section 2: General Writing Craft" in out
    assert "Where the author's style guide below conflicts" in out
    assert "Never robotic" in out  # moved here from the old header
    assert "Concrete over abstract" in out


def test_compose_writing_craft_ordering() -> None:
    """Craft section sits after the Humanizer and before the style-guide prose."""
    out = compose(_load_dan())
    humanizer = out.index("Section 1: The Humanizer")
    craft = out.index("## Section 2: General Writing Craft")
    style_guide = out.index("## Writing Principles")  # from style-guide.md
    assert humanizer < craft < style_guide


def test_compose_pack_override_replaces_default(tmp_path: Path) -> None:
    """A pack-local writing-baseline.md replaces the shared default."""
    (tmp_path / "stylepack.yaml").write_text(
        "spec_version: '1.0'\n"
        "pack:\n  slug: ov\n  name: Override\n  version: '1.0'\n  author: Tester\n"
        "persona:\n  identity: The Overrider\n  one_line: Replaces the baseline.\n",
        encoding="utf-8",
    )
    (tmp_path / "style-guide.md").write_text("# Style Guide\n\nVoice prose.\n", encoding="utf-8")
    (tmp_path / "writing-baseline.md").write_text(
        "- **Pack-specific craft rule.** Only this pack uses it.\n", encoding="utf-8"
    )

    out = compose(tmp_path)
    assert "Pack-specific craft rule." in out
    assert "Concrete over abstract" not in out
    assert "## Section 2: General Writing Craft" in out
