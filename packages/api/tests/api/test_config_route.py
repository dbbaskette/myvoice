from __future__ import annotations


def test_get_config_redacts_keys(client_with_config) -> None:
    client, cfg_path = client_with_config
    # Pre-seed the file with a real key.
    import yaml
    data = yaml.safe_load(cfg_path.read_text())
    data["providers"]["anthropic"]["api_key"] = "sk-ant-realsecret"
    cfg_path.write_text(yaml.safe_dump(data))
    # Ensure the app state reflects the seeded config.
    from myvoice.config import load_config
    client.app.state.config = load_config(cfg_path)
    r = client.get("/api/config")
    assert r.status_code == 200
    body = r.json()
    assert body["providers"]["anthropic"]["api_key"] == "sk-ant-***"


def test_put_config_preserves_existing_key_when_sentinel_sent(client_with_config) -> None:
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


def test_put_empty_clears_key(client_with_config) -> None:
    client, cfg_path = client_with_config
    client.put("/api/config", json={"providers": {"anthropic": {"api_key": "sk-ant-real"}}})
    client.put("/api/config", json={"providers": {"anthropic": {"api_key": ""}}})
    import yaml
    data = yaml.safe_load(cfg_path.read_text())
    assert data["providers"]["anthropic"]["api_key"] == ""
