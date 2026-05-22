"""Tests for POST /api/packs/{slug}/samples.

Uses an isolated pack root (copied from the real packs/dan) so tests never
mutate the checked-in fixture packs.
"""
from __future__ import annotations

import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from myvoice.server import create_app

# Path to the real dan pack — used as a copy source.
_REPO_ROOT = Path(__file__).resolve().parents[4]
_DAN_PACK = _REPO_ROOT / "packs" / "dan"


@pytest.fixture
def samples_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """TestClient with an isolated copy of packs/dan.

    Uses MYVOICE_PACKS_ROOT so no real pack dirs are touched.
    """
    packs_root = tmp_path / "packs"
    packs_root.mkdir()
    shutil.copytree(_DAN_PACK, packs_root / "dan")
    monkeypatch.setenv("MYVOICE_PACKS_ROOT", str(packs_root))
    monkeypatch.setenv("MYVOICE_CONFIG_PATH", str(tmp_path / "config.yaml"))
    app = create_app()
    with TestClient(app) as c:
        yield c


def test_create_sample_appends_manifest_and_writes_file(samples_client) -> None:
    client = samples_client
    # Baseline manifest
    r0 = client.get("/api/packs/dan/manifest")
    assert r0.status_code == 200
    before = r0.json()
    sample_count = len(before.get("samples", []))

    r = client.post(
        "/api/packs/dan/samples",
        json={
            "excerpt": "This is a great new sample passage about builders shipping.",
            "source_url": "https://example.com/post",
            "note": "Auto-saved from compose",
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["id"]  # zero-padded numeric
    assert body["file"].startswith("samples/")

    # Manifest now has one more sample
    r2 = client.get("/api/packs/dan/manifest")
    assert len(r2.json()["samples"]) == sample_count + 1


def test_sample_id_auto_increments(samples_client) -> None:
    client = samples_client
    r1 = client.post("/api/packs/dan/samples", json={"excerpt": "First sample passage."})
    r2 = client.post("/api/packs/dan/samples", json={"excerpt": "Second sample passage."})
    assert r1.status_code == 201
    assert r2.status_code == 201
    assert int(r1.json()["id"]) + 1 == int(r2.json()["id"])


def test_create_sample_unknown_pack_returns_404(samples_client) -> None:
    client = samples_client
    r = client.post("/api/packs/no-such-pack/samples", json={"excerpt": "hi"})
    assert r.status_code == 404


def test_create_sample_writes_blockquote_and_metadata(samples_client) -> None:
    client = samples_client
    r = client.post(
        "/api/packs/dan/samples",
        json={
            "excerpt": "Builders build. Shippers ship.",
            "source_url": "https://example.com",
            "note": "Great line",
        },
    )
    assert r.status_code == 201
    file_rel = r.json()["file"]

    # Retrieve the written file via the files endpoint
    r2 = client.get(f"/api/packs/dan/files/{file_rel}")
    assert r2.status_code == 200
    content = r2.text
    assert "_Source: https://example.com_" in content
    assert "_Great line_" in content
    assert "> Builders build. Shippers ship." in content


def test_create_sample_no_source_or_note(samples_client) -> None:
    client = samples_client
    r = client.post("/api/packs/dan/samples", json={"excerpt": "Plain excerpt only."})
    assert r.status_code == 201
    file_rel = r.json()["file"]
    r2 = client.get(f"/api/packs/dan/files/{file_rel}")
    assert r2.status_code == 200
    content = r2.text
    assert "_Source:" not in content
    assert "> Plain excerpt only." in content
