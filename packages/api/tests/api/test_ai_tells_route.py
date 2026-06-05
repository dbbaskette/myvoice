"""Tests for GET /api/ai-tells (the shared AI-tells layer)."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient


def test_ai_tells_endpoint_returns_shared_layer(
    client_with_config: tuple[TestClient, Path],
) -> None:
    client, _ = client_with_config
    r = client.get("/api/ai-tells")
    assert r.status_code == 200
    body = r.json()
    assert "delve" in body["words"]
    assert "a testament to" in body["phrases"]
    assert "Moreover" in body["sentence_starters"]
    assert body["patterns"].strip()  # non-empty markdown
