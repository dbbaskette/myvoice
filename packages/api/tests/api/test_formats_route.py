"""POST /api/packs/{slug}/formats + DELETE /api/packs/{slug}/formats/{name}."""
from __future__ import annotations

import shutil
from collections.abc import Iterator
from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

from myvoice.server import create_app

_REPO_ROOT = Path(__file__).resolve().parents[4]
_DAN_SRC = _REPO_ROOT / "packs" / "dan"


@pytest.fixture
def entries_client(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Iterator[tuple[TestClient, Path]]:
    packs_root = tmp_path / "packs"
    packs_root.mkdir()
    shutil.copytree(_DAN_SRC, packs_root / "dan")
    monkeypatch.setenv("MYVOICE_PACKS_ROOT", str(packs_root))
    monkeypatch.setenv("MYVOICE_CONFIG_PATH", str(tmp_path / "config.yaml"))
    app = create_app()
    with TestClient(app) as c:
        yield c, packs_root


def test_create_format_success(entries_client: tuple[TestClient, Path]) -> None:
    client, packs_root = entries_client
    r = client.post(
        "/api/packs/dan/formats",
        json={
            "name": "linkedin-post-2",
            "description": "second LinkedIn template",
            "content": "# Hook\n\nBody.",
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "linkedin-post-2"
    assert body["file"] == "formats/linkedin-post-2.md"
    # File on disk
    file_path = packs_root / "dan" / "formats" / "linkedin-post-2.md"
    assert file_path.is_file()
    assert "Hook" in file_path.read_text()
    # Manifest updated
    manifest = yaml.safe_load((packs_root / "dan" / "stylepack.yaml").read_text())
    names = [f["name"] for f in manifest.get("formats", [])]
    assert "linkedin-post-2" in names


def test_create_format_conflict_409(entries_client: tuple[TestClient, Path]) -> None:
    client, _ = entries_client
    payload = {"name": "duplicate-fmt", "content": "x"}
    r1 = client.post("/api/packs/dan/formats", json=payload)
    assert r1.status_code == 201
    r2 = client.post("/api/packs/dan/formats", json=payload)
    assert r2.status_code == 409
    assert r2.json()["detail"]["error"]["code"] == "name_conflict"


def test_create_format_bad_name_422(entries_client: tuple[TestClient, Path]) -> None:
    client, _ = entries_client
    r = client.post("/api/packs/dan/formats", json={"name": "Bad Name", "content": "x"})
    assert r.status_code == 422


def test_create_format_default_content_is_placeholder(
    entries_client: tuple[TestClient, Path],
) -> None:
    """No content provided → placeholder so the file is non-empty (spec requirement)."""
    client, packs_root = entries_client
    r = client.post("/api/packs/dan/formats", json={"name": "empty-test"})
    assert r.status_code == 201
    file_path = packs_root / "dan" / "formats" / "empty-test.md"
    body = file_path.read_text()
    assert body.strip(), "format file must be non-empty"


def test_delete_format_success(entries_client: tuple[TestClient, Path]) -> None:
    client, packs_root = entries_client
    # Create first to ensure idempotency
    client.post("/api/packs/dan/formats", json={"name": "to-delete", "content": "x"})
    file_path = packs_root / "dan" / "formats" / "to-delete.md"
    assert file_path.is_file()
    # Delete
    r = client.delete("/api/packs/dan/formats/to-delete")
    assert r.status_code == 204
    assert not file_path.exists()
    manifest = yaml.safe_load((packs_root / "dan" / "stylepack.yaml").read_text())
    names = [f["name"] for f in manifest.get("formats", [])]
    assert "to-delete" not in names


def test_delete_format_not_found_404(entries_client: tuple[TestClient, Path]) -> None:
    client, _ = entries_client
    r = client.delete("/api/packs/dan/formats/no-such-format")
    assert r.status_code == 404
