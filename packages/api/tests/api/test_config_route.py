from __future__ import annotations

from pathlib import Path
from typing import cast

from fastapi import FastAPI
from fastapi.testclient import TestClient


def test_get_config_redacts_keys(client_with_config: tuple[TestClient, Path]) -> None:
    client, cfg_path = client_with_config
    # Pre-seed the file with a real key.
    import yaml
    data = yaml.safe_load(cfg_path.read_text())
    data["providers"]["anthropic"]["api_key"] = "sk-ant-realsecret"
    cfg_path.write_text(yaml.safe_dump(data))
    # Ensure the app state reflects the seeded config.
    from myvoice.config import load_config
    cast(FastAPI, client.app).state.config = load_config(cfg_path)
    r = client.get("/api/config")
    assert r.status_code == 200
    body = r.json()
    assert body["providers"]["anthropic"]["api_key"] == "sk-ant-***"


def test_put_config_preserves_existing_key_when_sentinel_sent(
    client_with_config: tuple[TestClient, Path],
) -> None:
    client, cfg_path = client_with_config
    # First set the key.
    r = client.put("/api/config", json={"providers": {"anthropic": {"api_key": "sk-ant-real"}}})
    assert r.status_code == 200
    # Now send the sentinel back.
    r = client.put("/api/config", json={"providers": {"anthropic": {"api_key": "sk-ant-***"}}})
    assert r.status_code == 200
    # Re-read raw file: real key still there.
    import yaml
    data = yaml.safe_load(cfg_path.read_text())
    assert data["providers"]["anthropic"]["api_key"] == "sk-ant-real"


def test_put_empty_clears_key(client_with_config: tuple[TestClient, Path]) -> None:
    client, cfg_path = client_with_config
    client.put("/api/config", json={"providers": {"anthropic": {"api_key": "sk-ant-real"}}})
    client.put("/api/config", json={"providers": {"anthropic": {"api_key": ""}}})
    import yaml
    data = yaml.safe_load(cfg_path.read_text())
    assert data["providers"]["anthropic"]["api_key"] == ""


def test_put_with_empty_pack_paths_preserves_env_packs(
    client_with_config: tuple[TestClient, Path],
) -> None:
    """Regression: saving Settings with no pack_paths edited must not wipe env-loaded packs.

    The SettingsPage sends the whole config back on save, including
    `pack_paths: []`. Before the fix, this triggered a rescan with empty roots
    and the in-memory pack store lost the env/repo-loaded packs.
    """
    client, _ = client_with_config
    app = cast(FastAPI, client.app)
    slugs_before = sorted(app.state.pack_store.slugs())
    assert slugs_before, "fixture should have loaded packs from the repo"
    r = client.put(
        "/api/config",
        json={
            "providers": {"anthropic": {"api_key": "sk-mock"}},
            "pack_paths": [],
        },
    )
    assert r.status_code == 200
    slugs_after = sorted(app.state.pack_store.slugs())
    assert slugs_after == slugs_before
