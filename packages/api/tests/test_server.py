"""Tests for the FastAPI server."""

from pathlib import Path

from _pytest.monkeypatch import MonkeyPatch
from fastapi.testclient import TestClient

from myvoice import __version__


def test_health_endpoint_returns_ok(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": __version__}


def test_root_serves_index_when_static_present(tmp_path: Path, monkeypatch: MonkeyPatch) -> None:
    """When static dir exists, GET / returns the index.html."""
    static_dir = tmp_path / "static"
    static_dir.mkdir()
    (static_dir / "index.html").write_text("<html><body>built ui</body></html>")

    monkeypatch.setenv("MYVOICE_STATIC_DIR", str(static_dir))
    from myvoice.server import create_app

    client = TestClient(create_app())
    response = client.get("/")
    assert response.status_code == 200
    assert "built ui" in response.text


def test_root_returns_dev_message_when_static_missing(
    tmp_path: Path, monkeypatch: MonkeyPatch
) -> None:
    """When static dir is absent, GET / returns a dev-mode message."""
    monkeypatch.setenv("MYVOICE_STATIC_DIR", str(tmp_path / "does-not-exist"))
    from myvoice.server import create_app

    client = TestClient(create_app())
    response = client.get("/")
    assert response.status_code == 200
    assert "dev mode" in response.text.lower()
