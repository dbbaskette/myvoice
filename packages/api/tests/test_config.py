from __future__ import annotations

from pathlib import Path

from myvoice.config import Config, load_config, redact_config, save_config


def test_load_creates_default_when_missing(tmp_path: Path) -> None:
    cfg_path = tmp_path / "config.yaml"
    cfg = load_config(cfg_path)
    assert cfg.version == 1
    assert cfg.server.port == 7878
    assert cfg.providers.anthropic.api_key == ""
    assert cfg_path.exists()


def test_save_is_atomic(tmp_path: Path) -> None:
    cfg_path = tmp_path / "config.yaml"
    cfg = load_config(cfg_path)
    cfg.providers.anthropic.api_key = "sk-ant-secret"
    save_config(cfg, cfg_path)
    reloaded = load_config(cfg_path)
    assert reloaded.providers.anthropic.api_key == "sk-ant-secret"


def test_redact_masks_keys() -> None:
    cfg = Config()
    cfg.providers.anthropic.api_key = "sk-ant-realsecret"
    cfg.providers.openai.api_key = ""
    redacted = redact_config(cfg)
    assert redacted.providers.anthropic.api_key == "sk-ant-***"
    assert redacted.providers.openai.api_key == ""


def test_chmod_0600(tmp_path: Path) -> None:
    cfg_path = tmp_path / "config.yaml"
    cfg = load_config(cfg_path)
    save_config(cfg, cfg_path)
    mode = cfg_path.stat().st_mode & 0o777
    assert mode == 0o600
