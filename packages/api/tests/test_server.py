"""Tests for the FastAPI server."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from myvoice import __version__


def test_health_endpoint_returns_ok(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": __version__}


def test_root_serves_index_when_static_present(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
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
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """When static dir is absent, GET / returns a dev-mode message."""
    monkeypatch.setenv("MYVOICE_STATIC_DIR", str(tmp_path / "does-not-exist"))
    from myvoice.server import create_app

    client = TestClient(create_app())
    response = client.get("/")
    assert response.status_code == 200
    assert "dev mode" in response.text.lower()


def test_myvoice_dev_forces_dev_message_even_when_static_present(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """MYVOICE_DEV=1 must force the dev placeholder even if static exists."""
    static_dir = tmp_path / "static"
    static_dir.mkdir()
    (static_dir / "index.html").write_text("<html><body>built ui</body></html>")

    monkeypatch.setenv("MYVOICE_STATIC_DIR", str(static_dir))
    monkeypatch.setenv("MYVOICE_DEV", "1")
    from myvoice.server import create_app

    client = TestClient(create_app())
    response = client.get("/")
    assert response.status_code == 200
    assert "dev mode" in response.text.lower()
    assert "built ui" not in response.text


def test_pack_store_loaded_into_app_state(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """The lifespan event must initialize app.state.pack_store from MYVOICE_PACKS_ROOT."""
    # Create a minimal pack in tmp_path
    pack = tmp_path / "alpha"
    pack.mkdir()
    (pack / "stylepack.yaml").write_text(
        'spec_version: "1.0"\n'
        "pack:\n  slug: alpha\n  name: Alpha\n  version: '0.1'\n  author: t\n"
        "persona:\n  identity: a\n  one_line: b\n"
    )
    (pack / "style-guide.md").write_text("body")

    monkeypatch.setenv("MYVOICE_PACKS_ROOT", str(tmp_path))

    from myvoice.server import create_app
    app = create_app()
    with TestClient(app) as client:
        # Use the test client context manager so the lifespan runs.
        assert hasattr(app.state, "pack_store")
        store = app.state.pack_store
        assert "alpha" in store.slugs()
        # Smoke a basic request still works
        r = client.get("/api/health")
        assert r.status_code == 200


def _seed_packs(tmp_path: Path) -> Path:
    """Write two minimal packs into tmp_path and return the root."""
    for slug in ("alpha", "beta"):
        pack = tmp_path / slug
        pack.mkdir()
        (pack / "stylepack.yaml").write_text(
            f'spec_version: "1.0"\n'
            f"pack:\n  slug: {slug}\n  name: {slug.title()}\n  version: '0.1'\n  author: t\n"
            "persona:\n  identity: a\n  one_line: b\n"
        )
        (pack / "style-guide.md").write_text("body")
    return tmp_path


def test_list_packs_returns_summaries(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _seed_packs(tmp_path)
    monkeypatch.setenv("MYVOICE_PACKS_ROOT", str(tmp_path))
    from myvoice.server import create_app

    with TestClient(create_app()) as client:
        r = client.get("/api/packs")
        assert r.status_code == 200
        data = r.json()
        slugs = sorted(p["slug"] for p in data)
        assert slugs == ["alpha", "beta"]
        for p in data:
            assert p["valid"] is True
            assert "name" in p and "version" in p


def test_get_pack_returns_detail(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _seed_packs(tmp_path)
    monkeypatch.setenv("MYVOICE_PACKS_ROOT", str(tmp_path))
    from myvoice.server import create_app

    with TestClient(create_app()) as client:
        r = client.get("/api/packs/alpha")
        assert r.status_code == 200
        data = r.json()
        assert data["slug"] == "alpha"
        assert data["valid"] is True
        assert data["persona"]["identity"] == "a"
        assert data["counts"]["formats"] == 0


def test_get_pack_404_for_unknown_slug(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _seed_packs(tmp_path)
    monkeypatch.setenv("MYVOICE_PACKS_ROOT", str(tmp_path))
    from myvoice.server import create_app

    with TestClient(create_app()) as client:
        r = client.get("/api/packs/ghost")
        assert r.status_code == 404


def test_get_manifest_returns_full_yaml_as_json(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _seed_packs(tmp_path)
    monkeypatch.setenv("MYVOICE_PACKS_ROOT", str(tmp_path))
    from myvoice.server import create_app

    with TestClient(create_app()) as client:
        r = client.get("/api/packs/alpha/manifest")
        assert r.status_code == 200
        data = r.json()
        assert data["spec_version"] == "1.0"
        assert data["pack"]["slug"] == "alpha"
