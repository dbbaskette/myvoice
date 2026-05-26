"""DELETE /api/packs/{slug}/samples/{id}."""
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
def samples_delete_client(
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


def test_delete_sample_success(samples_delete_client: tuple[TestClient, Path]) -> None:
    client, packs_root = samples_delete_client
    # Create first
    r1 = client.post(
        "/api/packs/dan/samples",
        json={"excerpt": "Sample to delete.", "source_url": None, "note": None},
    )
    assert r1.status_code == 201
    sample_id = r1.json()["id"]
    file_rel = r1.json()["file"]
    assert (packs_root / "dan" / file_rel).exists()

    r2 = client.delete(f"/api/packs/dan/samples/{sample_id}")
    assert r2.status_code == 204
    assert not (packs_root / "dan" / file_rel).exists()
    manifest = yaml.safe_load((packs_root / "dan" / "stylepack.yaml").read_text())
    ids = [s["id"] for s in manifest.get("samples", [])]
    assert sample_id not in ids


def test_delete_sample_not_found_404(samples_delete_client: tuple[TestClient, Path]) -> None:
    client, _ = samples_delete_client
    r = client.delete("/api/packs/dan/samples/99")
    assert r.status_code == 404
