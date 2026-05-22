"""myvoice CLI entry point."""

import click

from myvoice import __version__


@click.group()
def main() -> None:
    """myvoice — local-first style-pack editor."""


@main.command()
def version() -> None:
    """Print the installed myvoice version."""
    click.echo(f"myvoice {__version__}")
