"""Tests for the myvoice CLI."""

from click.testing import CliRunner

from myvoice import __version__
from myvoice.cli import main


def test_version_prints_package_version() -> None:
    runner = CliRunner()
    result = runner.invoke(main, ["version"])
    assert result.exit_code == 0
    assert __version__ in result.output
