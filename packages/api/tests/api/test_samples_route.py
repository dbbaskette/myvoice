"""Tests for POST /api/packs/{slug}/samples."""
from __future__ import annotations


def test_create_sample_appends_manifest_and_writes_file(client_with_config) -> None:
    client, _ = client_with_config
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


def test_sample_id_auto_increments(client_with_config) -> None:
    client, _ = client_with_config
    r1 = client.post("/api/packs/dan/samples", json={"excerpt": "First sample passage."})
    r2 = client.post("/api/packs/dan/samples", json={"excerpt": "Second sample passage."})
    assert r1.status_code == 201
    assert r2.status_code == 201
    assert int(r1.json()["id"]) + 1 == int(r2.json()["id"])


def test_create_sample_unknown_pack_returns_404(client_with_config) -> None:
    client, _ = client_with_config
    r = client.post("/api/packs/no-such-pack/samples", json={"excerpt": "hi"})
    assert r.status_code == 404


def test_create_sample_writes_blockquote_and_metadata(client_with_config) -> None:
    client, _ = client_with_config
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

    # Retrieve the written file
    r2 = client.get(f"/api/packs/dan/files/{file_rel}")
    assert r2.status_code == 200
    content = r2.text
    assert "_Source: https://example.com_" in content
    assert "_Great line_" in content
    assert "> Builders build. Shippers ship." in content


def test_create_sample_no_source_or_note(client_with_config) -> None:
    client, _ = client_with_config
    r = client.post("/api/packs/dan/samples", json={"excerpt": "Plain excerpt only."})
    assert r.status_code == 201
    file_rel = r.json()["file"]
    r2 = client.get(f"/api/packs/dan/files/{file_rel}")
    assert r2.status_code == 200
    content = r2.text
    assert "_Source:" not in content
    assert "> Plain excerpt only." in content
