"""Sync /api/compose and /api/lint route tests."""
from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient


def test_compose_endpoint(client_with_config: tuple[TestClient, Path]) -> None:
    client, _ = client_with_config
    r = client.post("/api/compose", json={"pack": "dan", "draft": "hi"})
    assert r.status_code == 200
    body = r.json()
    assert "prompt" in body
    assert body["char_count"] > 0


def test_compose_returns_404_for_unknown_pack(client_with_config: tuple[TestClient, Path]) -> None:
    client, _ = client_with_config
    r = client.post("/api/compose", json={"pack": "no-such-pack", "draft": "hi"})
    assert r.status_code == 404


def test_lint_endpoint_flags_banished_word(client_with_config: tuple[TestClient, Path]) -> None:
    client, _ = client_with_config
    r = client.post("/api/lint", json={"pack": "dan", "text": "Let me delve into this."})
    assert r.status_code == 200
    violations = r.json()["violations"]
    assert any(
        v["rule_id"].startswith("word:") or "delve" in v["rule_id"]
        for v in violations
    )


def test_lint_endpoint_returns_hits(client_with_config: tuple[TestClient, Path]) -> None:
    client, _ = client_with_config
    r = client.post(
        "/api/lint",
        json={"pack": "dan", "text": "For years, teams have struggled. Plan. Build. Ship."},
    )
    assert r.status_code == 200
    body = r.json()
    assert "violations" in body
    assert "hits" in body
    assert any(h["rule_id"] == "hit:conflict_opener" for h in body["hits"])


def test_lint_returns_404_for_unknown_pack(client_with_config: tuple[TestClient, Path]) -> None:
    client, _ = client_with_config
    r = client.post("/api/lint", json={"pack": "no-such-pack", "text": "hello"})
    assert r.status_code == 404
