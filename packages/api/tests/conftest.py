"""Shared pytest fixtures."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from myvoice.server import create_app


@pytest.fixture
def client() -> Iterator[TestClient]:
    """A FastAPI TestClient bound to a fresh app instance."""
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def client_with_config(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """TestClient + isolated config file path. Yields (client, cfg_path)."""
    cfg_path = tmp_path / "config.yaml"
    monkeypatch.setenv("MYVOICE_CONFIG_PATH", str(cfg_path))
    app = create_app()
    with TestClient(app) as c:
        yield c, cfg_path
