"""Tests for bundled-template resolution (installed-wheel mode)."""

from importlib import resources

from myvoice.packs.templates import locate_template


def test_template_resolves_inside_the_package() -> None:
    """locate_template must return a path inside the importable myvoice package,
    so the scaffold ships in the wheel and pack creation works when installed
    (not just in dev mode against the repo's packs/ dir)."""
    p = locate_template()
    assert (p / "stylepack.yaml").is_file()
    pkg_root = str(resources.files("myvoice"))
    assert str(p.resolve()).startswith(pkg_root)
    assert "bundled_packs" in str(p)
