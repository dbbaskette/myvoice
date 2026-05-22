"""Rewrite route tests using the mock provider."""
from __future__ import annotations

import json


def test_rewrite_with_mock_provider(client_with_config, monkeypatch) -> None:
    client, _cfg_path = client_with_config
    # Set an API key (any string — mock provider ignores it)
    client.put("/api/config", json={"providers": {"anthropic": {"api_key": "sk-mock"}}})
    monkeypatch.setenv("MYVOICE_TEST_PROVIDER", "mock")
    monkeypatch.setenv("MYVOICE_MOCK_OUTPUT", "Plan. Build. Ship.")

    r = client.post("/api/rewrite", json={
        "pack": "dan",
        "draft": "rewrite this",
        "provider": "anthropic",
        "model": "claude-sonnet-4-6",
    })
    assert r.status_code == 202
    job_id = r.json()["job_id"]

    # Drain SSE
    with client.stream("GET", f"/api/jobs/{job_id}/events") as resp:
        chunks = b"".join(resp.iter_bytes()).decode()

    assert '"type":"complete"' in chunks
    # Parse the complete event result
    for line in chunks.split("\n"):
        if line.startswith("data:"):
            event = json.loads(line[5:].strip())
            if event.get("type") == "complete":
                result = event["result"]
                assert "Plan. Build. Ship." in result["output"]
                assert result["provider"] == "anthropic"
                break
    else:
        raise AssertionError("No complete event found in SSE stream")


def test_rewrite_returns_404_for_unknown_pack(client_with_config, monkeypatch) -> None:
    client, _ = client_with_config
    monkeypatch.setenv("MYVOICE_TEST_PROVIDER", "mock")
    r = client.post("/api/rewrite", json={
        "pack": "nonexistent-pack",
        "draft": "hi",
        "provider": "anthropic",
        "model": "claude-sonnet-4-6",
    })
    assert r.status_code == 404


def test_rewrite_returns_400_when_no_api_key(client_with_config) -> None:
    client, _ = client_with_config
    # No API key set for anthropic
    r = client.post("/api/rewrite", json={
        "pack": "dan",
        "draft": "hi",
        "provider": "anthropic",
        "model": "claude-sonnet-4-6",
    })
    assert r.status_code == 400
