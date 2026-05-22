"""FastAPI application factory."""

from fastapi import FastAPI

from myvoice import __version__


def create_app() -> FastAPI:
    """Build and return the FastAPI app."""
    app = FastAPI(title="myvoice", version=__version__)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "version": __version__}

    return app
