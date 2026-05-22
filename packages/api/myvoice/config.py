"""Config file lifecycle: ~/.myvoice/config.yaml load/save/redact."""
from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field

_MASK = "sk-ant-***"  # generic sentinel; UI knows it means "unchanged"


class ServerSection(BaseModel):
    port: int = 7878
    open_browser: bool = True


class UISection(BaseModel):
    default_pack: str | None = None
    theme: str = "system"


class ProviderConfig(BaseModel):
    api_key: str = ""
    default_model: str | None = None


class ProvidersSection(BaseModel):
    anthropic: ProviderConfig = Field(default_factory=ProviderConfig)
    openai: ProviderConfig = Field(default_factory=ProviderConfig)
    google: ProviderConfig = Field(default_factory=ProviderConfig)


class FeaturesSection(BaseModel):
    default_compose_provider: str = "anthropic"
    default_extraction_provider: str = "anthropic"


class Config(BaseModel):
    version: int = 1
    server: ServerSection = Field(default_factory=ServerSection)
    ui: UISection = Field(default_factory=UISection)
    pack_paths: list[str] = Field(default_factory=list)
    providers: ProvidersSection = Field(default_factory=ProvidersSection)
    features: FeaturesSection = Field(default_factory=FeaturesSection)


def default_config_path() -> Path:
    env = os.environ.get("MYVOICE_CONFIG_PATH")
    if env:
        return Path(env)
    return Path.home() / ".myvoice" / "config.yaml"


def load_config(path: Path | None = None) -> Config:
    p = path or default_config_path()
    if not p.exists():
        cfg = Config()
        p.parent.mkdir(parents=True, exist_ok=True)
        save_config(cfg, p)
        return cfg
    data = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    return Config.model_validate(data)


def save_config(cfg: Config, path: Path | None = None) -> None:
    p = path or default_config_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    data = cfg.model_dump()
    # Atomic write: temp in same dir, fsync, chmod 0600, then rename.
    fd, tmp_path = tempfile.mkstemp(dir=p.parent, prefix=".config.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            yaml.safe_dump(data, f, sort_keys=False)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp_path, 0o600)
        os.replace(tmp_path, p)
    except Exception:
        try:
            os.unlink(tmp_path)
        except FileNotFoundError:
            pass
        raise


def redact_config(cfg: Config) -> Config:
    """Return a deep copy with non-empty api_key fields replaced with the mask."""
    out = cfg.model_copy(deep=True)
    for name in ("anthropic", "openai", "google"):
        prov = getattr(out.providers, name)
        if prov.api_key:
            prov.api_key = _MASK
    return out


def merge_put(current: Config, patch: dict[str, Any]) -> Config:
    """Apply a partial-update dict to current. Sentinel mask preserves existing key."""
    base = current.model_dump()
    _deep_merge(base, patch)
    # Walk providers and restore preserved keys when sentinel was sent.
    incoming_providers = patch.get("providers") or {}
    for name in ("anthropic", "openai", "google"):
        if name in incoming_providers and "api_key" in incoming_providers[name]:
            if incoming_providers[name]["api_key"] == _MASK:
                base["providers"][name]["api_key"] = getattr(current.providers, name).api_key
    return Config.model_validate(base)


def _deep_merge(dst: dict[str, Any], src: dict[str, Any]) -> None:
    for k, v in src.items():
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            _deep_merge(dst[k], v)
        else:
            dst[k] = v
