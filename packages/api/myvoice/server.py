"""FastAPI application factory."""

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from myvoice import __version__
from myvoice.packs.store import PackStore


def _default_static_dir() -> Path:
    """Return the bundled static dir, alongside this module."""
    return Path(__file__).parent / "static"


def _resolve_static_dir() -> Path:
    """Honor MYVOICE_STATIC_DIR if set, otherwise use the bundled dir."""
    env = os.environ.get("MYVOICE_STATIC_DIR")
    return Path(env) if env else _default_static_dir()


def _is_dev_mode() -> bool:
    """True when MYVOICE_DEV=1 — forces dev placeholder even if static exists."""
    return os.environ.get("MYVOICE_DEV", "").lower() in ("1", "true", "yes")


def _resolve_pack_roots() -> list[Path]:
    """Where to scan for packs.

    Priority:
    1. MYVOICE_PACKS_ROOT env var (single path).
    2. Repo packs/ dir if it exists (dev/test mode).
    3. Empty list (installed wheel; user packs come from Phase 4 config).
    """
    env = os.environ.get("MYVOICE_PACKS_ROOT")
    if env:
        return [Path(env)]
    # `__file__` = packages/api/myvoice/server.py → parents[3] = repo root
    repo_packs = Path(__file__).resolve().parents[3] / "packs"
    if repo_packs.is_dir():
        return [repo_packs]
    return []


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Initialize PackStore on startup. Nothing to clean up on shutdown."""
    app.state.pack_store = PackStore(_resolve_pack_roots())
    yield


def create_app() -> FastAPI:
    """Build and return the FastAPI app."""
    app = FastAPI(title="myvoice", version=__version__, lifespan=_lifespan)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "version": __version__}

    static_dir = _resolve_static_dir()
    index = static_dir / "index.html"

    if index.is_file() and not _is_dev_mode():
        # Production mode: serve the built React app.
        @app.get("/", response_class=FileResponse)
        def root() -> FileResponse:
            return FileResponse(index)

        # Mount everything else under /assets, /favicon.ico, etc.
        app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
    else:
        # Dev mode: no built frontend bundled.
        @app.get("/", response_class=HTMLResponse)
        def root_dev() -> str:
            return (
                "<!doctype html><html><body>"
                "<h1>myvoice — dev mode</h1>"
                "<p>No built frontend found. Run <code>pnpm dev</code> "
                "in <code>packages/web/</code> and visit "
                "<a href='http://localhost:7879'>http://localhost:7879</a>.</p>"
                "</body></html>"
            )

    return app
