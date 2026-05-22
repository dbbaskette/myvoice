"""FastAPI application factory."""

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from myvoice import __version__


def _default_static_dir() -> Path:
    """Return the bundled static dir, alongside this module."""
    return Path(__file__).parent / "static"


def _resolve_static_dir() -> Path:
    """Honor MYVOICE_STATIC_DIR if set, otherwise use the bundled dir."""
    env = os.environ.get("MYVOICE_STATIC_DIR")
    return Path(env) if env else _default_static_dir()


def create_app() -> FastAPI:
    """Build and return the FastAPI app."""
    app = FastAPI(title="myvoice", version=__version__)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "version": __version__}

    static_dir = _resolve_static_dir()
    index = static_dir / "index.html"

    if index.is_file():
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
