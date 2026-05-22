"""myvoice CLI entry point."""

import os

import click
import uvicorn

from myvoice import __version__


@click.group()
def main() -> None:
    """myvoice — local-first style-pack editor."""


@main.command()
def version() -> None:
    """Print the installed myvoice version."""
    click.echo(f"myvoice {__version__}")


@main.command()
@click.option("--host", default="127.0.0.1", show_default=True, help="Bind host.")
@click.option("--port", default=7878, show_default=True, type=int, help="Bind port.")
@click.option("--no-browser", is_flag=True, help="Do not auto-open the browser.")
@click.option("--dev", is_flag=True, help="Dev mode: skip frontend static mount.")
def serve(host: str, port: int, no_browser: bool, dev: bool) -> None:
    """Start the myvoice server."""
    click.echo(f"[myvoice] starting on http://{host}:{port}")
    if dev:
        # Signal the server (via env var, since uvicorn loads the app factory
        # in a fresh process) to force the dev-mode placeholder regardless of
        # whether built static assets exist on disk.
        os.environ["MYVOICE_DEV"] = "1"
        click.echo("[myvoice] dev mode: not serving frontend (expect Vite on :7879)")
    if not no_browser and not dev:
        # Browser auto-open is added in a later phase when there's a frontend to open.
        pass
    uvicorn.run(
        "myvoice.server:create_app",
        host=host,
        port=port,
        factory=True,
        log_level="info",
    )
