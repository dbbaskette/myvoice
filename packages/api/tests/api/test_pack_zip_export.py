"""GET /api/packs/{slug}/export."""
from __future__ import annotations

import io
import shutil
import zipfile
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from myvoice.server import create_app

_REPO_ROOT = Path(__file__).resolve().parents[4]
_DAN_SRC = _REPO_ROOT / "packs" / "dan"


@pytest.fixture
def zip_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    packs_root = tmp_path / "packs"
    packs_root.mkdir()
    shutil.copytree(_DAN_SRC, packs_root / "dan")
    monkeypatch.setenv("MYVOICE_PACKS_ROOT", str(packs_root))
    monkeypatch.setenv("MYVOICE_CONFIG_PATH", str(tmp_path / "config.yaml"))
    app = create_app()
    with TestClient(app) as c:
        yield c


def test_export_returns_zip_with_pack_contents(zip_client: TestClient) -> None:
    r = zip_client.get("/api/packs/dan/export")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/zip"
    assert "pack-dan-" in r.headers["content-disposition"]
    assert ".zip" in r.headers["content-disposition"]
    # Open the zip
    z = zipfile.ZipFile(io.BytesIO(r.content))
    names = z.namelist()
    # All entries nested under "dan/" so import is symmetric
    assert all(n.startswith("dan/") for n in names), names
    assert "dan/stylepack.yaml" in names
    # No dot-files / __pycache__
    assert not any(n.startswith("dan/.") or "__pycache__" in n for n in names)


def test_export_404_unknown_slug(zip_client: TestClient) -> None:
    r = zip_client.get("/api/packs/nope/export")
    assert r.status_code == 404
