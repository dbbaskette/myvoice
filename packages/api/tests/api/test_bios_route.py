"""POST /api/packs/{slug}/bios + DELETE /api/packs/{slug}/bios/{name}."""
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
def bios_client(
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


def test_create_bio_success_with_metadata(bios_client: tuple[TestClient, Path]) -> None:
    client, packs_root = bios_client
    r = client.post(
        "/api/packs/dan/bios",
        json={
            "name": "podcast-guest",
            "description": "Bio used for podcast intros",
            "max_chars": 600,
            "third_person": True,
            "content": "Dan Baskette is…",
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "podcast-guest"
    assert body["file"] == "bios/podcast-guest.md"
    manifest = yaml.safe_load((packs_root / "dan" / "stylepack.yaml").read_text())
    entry = next(b for b in manifest["bios"] if b["name"] == "podcast-guest")
    assert entry["max_chars"] == 600
    assert entry["third_person"] is True
    assert "target_words" not in entry  # None values omitted


def test_create_bio_conflict_409(bios_client: tuple[TestClient, Path]) -> None:
    client, _ = bios_client
    # twitter already exists in the dan pack
    r = client.post("/api/packs/dan/bios", json={"name": "twitter", "content": "x"})
    assert r.status_code == 409


def test_delete_bio_success(bios_client: tuple[TestClient, Path]) -> None:
    client, packs_root = bios_client
    r = client.delete("/api/packs/dan/bios/twitter")
    assert r.status_code == 204
    manifest = yaml.safe_load((packs_root / "dan" / "stylepack.yaml").read_text())
    names = [b["name"] for b in manifest.get("bios", [])]
    assert "twitter" not in names
    # File gone from disk
    assert not (packs_root / "dan" / "bios" / "twitter.md").exists()


def test_delete_bio_not_found_404(bios_client: tuple[TestClient, Path]) -> None:
    client, _ = bios_client
    r = client.delete("/api/packs/dan/bios/no-such-bio")
    assert r.status_code == 404
