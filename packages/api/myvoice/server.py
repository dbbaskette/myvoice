"""FastAPI application factory."""

import asyncio
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from myvoice import __version__
from myvoice.config import default_config_path, load_config
from myvoice.jobs.registry import JobRegistry
from myvoice.packs.store import PackStore
from myvoice.packs.templates import resolve_write_root
from myvoice.watch import EventBus, watch_task


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
    """Built-in pack roots, not yet merged with config.

    Sources (in order, deduped):
    1. MYVOICE_PACKS_ROOT env var (single path), else the repo packs/ dir if it
       exists (dev/test mode).
    2. The writable pack dir (``resolve_write_root()``) — ALWAYS included so packs
       created via POST /api/packs are discoverable. In an installed wheel with no
       env var and no repo packs/, this is the only root.
    """
    roots: list[Path] = []
    env = os.environ.get("MYVOICE_PACKS_ROOT")
    if env:
        roots.append(Path(env))
    else:
        # `__file__` = packages/api/myvoice/server.py → parents[3] = repo root
        repo_packs = Path(__file__).resolve().parents[3] / "packs"
        if repo_packs.is_dir():
            roots.append(repo_packs)
    write_root = resolve_write_root()
    if write_root.resolve() not in {r.resolve() for r in roots}:
        roots.append(write_root)
    return roots


def effective_pack_roots(config_pack_paths: list[str]) -> list[Path]:
    """Merge built-in roots (env or repo) with the user's config pack_paths.

    Built-in roots come first; config paths are appended in order, deduped
    by resolved path. Single source of truth for both startup and the
    rescan path triggered by PUT /api/config.
    """
    roots: list[Path] = list(_resolve_pack_roots())
    seen = {p.resolve() for p in roots}
    for p in config_pack_paths:
        path = Path(p).expanduser()
        if path.resolve() not in seen:
            roots.append(path)
            seen.add(path.resolve())
    return roots


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Initialize config + PackStore + EventBus + watch task on startup."""
    cfg_path = default_config_path()
    cfg = load_config(cfg_path)
    app.state.config = cfg
    app.state.config_path = cfg_path
    # Ensure the writable pack dir exists so it's a valid discovery/watch root.
    resolve_write_root().mkdir(parents=True, exist_ok=True)
    pack_roots = effective_pack_roots(cfg.pack_paths)
    app.state.pack_store = PackStore(pack_roots)
    app.state.job_registry = JobRegistry()

    # Start the global event bus and file watcher.
    app.state.event_bus = EventBus()
    app.state.watch_stop = asyncio.Event()
    app.state.watch_task_handle = asyncio.create_task(
        watch_task(
            pack_roots,
            app.state.event_bus,
            app.state.pack_store,
            app.state.watch_stop,
        )
    )

    yield

    # Shutdown: signal the watcher and wait (with a timeout).
    app.state.watch_stop.set()
    try:
        await asyncio.wait_for(app.state.watch_task_handle, timeout=2.0)
    except (TimeoutError, asyncio.CancelledError):
        app.state.watch_task_handle.cancel()


def create_app() -> FastAPI:
    """Build and return the FastAPI app."""
    app = FastAPI(title="myvoice", version=__version__, lifespan=_lifespan)

    from myvoice.api.ai_tells import router as ai_tells_router
    from myvoice.api.compose import router as compose_router
    from myvoice.api.config import router as config_router
    from myvoice.api.entries import router as entries_router
    from myvoice.api.events import router as events_router
    from myvoice.api.extract import router as extract_router
    from myvoice.api.jobs import router as jobs_router
    from myvoice.api.pack_zip import router as pack_zip_router
    from myvoice.api.packs import router as packs_router
    from myvoice.api.packs_admin import router as packs_admin_router
    from myvoice.api.rewrite import router as rewrite_router
    from myvoice.api.samples import router as samples_router

    app.include_router(config_router)
    app.include_router(jobs_router)
    app.include_router(packs_admin_router)
    app.include_router(packs_router)
    app.include_router(rewrite_router)
    app.include_router(compose_router)
    app.include_router(samples_router)
    app.include_router(entries_router)
    app.include_router(pack_zip_router)
    app.include_router(events_router)
    app.include_router(extract_router)
    app.include_router(ai_tells_router)

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
