"""myvoice CLI entry point."""

import os
from pathlib import Path

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


@main.group()
def pack() -> None:
    """Style-pack commands: list, validate, compose, lint."""


@pack.command(name="list")
@click.option(
    "--root",
    "roots",
    multiple=True,
    type=click.Path(exists=True, file_okay=False, path_type=Path),
    help="Directory to scan for packs. May be repeated.",
)
def pack_list(roots: tuple[Path, ...]) -> None:
    """List packs discovered under one or more roots."""
    from myvoice.packs.store import PackStore

    if not roots:
        click.echo("error: at least one --root is required (try --root packs/)", err=True)
        raise SystemExit(2)
    store = PackStore(list(roots))
    for slug in store.slugs():
        info = store.get(slug)
        assert info is not None
        marker = "OK" if info.valid else "INVALID"
        click.echo(f"[{marker}] {info.slug} ({info.name}) v{info.version}  {info.root_path}")
    for slug, paths in store.conflicts().items():
        click.echo(f"warning: slug '{slug}' conflicts across {len(paths)} roots", err=True)


@pack.command(name="validate")
@click.argument("pack_root", type=click.Path(exists=True, file_okay=False, path_type=Path))
def pack_validate(pack_root: Path) -> None:
    """Validate a single pack directory against SPEC v1.0."""
    from myvoice.validate import validate_pack

    result = validate_pack(pack_root)
    if result.valid:
        click.echo(f"{pack_root}: valid")
        return
    click.echo(f"{pack_root}: INVALID ({len(result.errors)} error(s))", err=True)
    for err in result.errors:
        click.echo(f"  {err.path}: {err.message}", err=True)
    raise SystemExit(1)


@pack.command(name="compose")
@click.argument("pack_root", type=click.Path(exists=True, file_okay=False, path_type=Path))
@click.option("--format", "format_name", help="Format add-on (e.g., blog-post).")
@click.option("--samples", help="Comma-separated sample IDs (e.g., 01,04).")
@click.option("--draft", type=click.Path(exists=True, dir_okay=False, path_type=Path),
              help="File containing the draft to rewrite.")
@click.option("--bio", "bio_name", help="Emit just a bio body (no prompt assembly).")
def pack_compose(
    pack_root: Path,
    format_name: str | None,
    samples: str | None,
    draft: Path | None,
    bio_name: str | None,
) -> None:
    """Compose a prompt (or bio body) from a pack."""
    from myvoice.compose import compose

    sample_ids = [s.strip() for s in samples.split(",")] if samples else None
    draft_text = draft.read_text(encoding="utf-8") if draft else None
    out = compose(
        pack_root,
        format=format_name,
        samples=sample_ids,
        draft=draft_text,
        bio=bio_name,
    )
    click.echo(out, nl=False)


@pack.command(name="lint")
@click.argument("pack_root", type=click.Path(exists=True, file_okay=False, path_type=Path))
@click.argument("draft", type=click.Path(exists=True, dir_okay=False, path_type=Path))
def pack_lint(pack_root: Path, draft: Path) -> None:
    """Lint a draft against a pack's manifest rules."""
    import yaml

    from myvoice.lint import lint
    from myvoice.packs.manifest import Manifest

    manifest = Manifest.model_validate(
        yaml.safe_load((pack_root / "stylepack.yaml").read_text(encoding="utf-8"))
    )
    violations = lint(manifest, draft.read_text(encoding="utf-8"))
    if not violations:
        click.echo(f"{draft}: clean")
        return
    click.echo(f"{draft}: {len(violations)} violation(s)", err=True)
    for v in violations:
        click.echo(f"  L{v.line}:{v.column}  [{v.kind}] {v.message}", err=True)
    raise SystemExit(1)
