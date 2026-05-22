"""GET/PUT /api/config + /api/providers/{provider}/models."""
from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from myvoice.config import Config, merge_put, redact_config, save_config
from myvoice.llm.exceptions import ProviderError, ProviderMissingKey
from myvoice.llm.registry import get_provider

router = APIRouter(tags=["config"])

_MODEL_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_CACHE_TTL = 300  # 5 minutes


@router.get("/api/config")
def get_config(request: Request) -> dict[str, Any]:
    cfg: Config = request.app.state.config
    return redact_config(cfg).model_dump()


@router.put("/api/config")
def put_config(request: Request, patch: dict[str, Any]) -> dict[str, Any]:
    cfg: Config = request.app.state.config
    new_cfg = merge_put(cfg, patch)
    path = request.app.state.config_path
    save_config(new_cfg, path)
    request.app.state.config = new_cfg
    # Invalidate model cache for any provider whose key was in the patch.
    incoming = patch.get("providers") or {}
    for name in incoming.keys():
        _MODEL_CACHE.pop(name, None)
    # Trigger pack rescan if pack_paths changed.
    if "pack_paths" in patch:
        request.app.state.pack_store.rescan(new_cfg.pack_paths)
    return redact_config(new_cfg).model_dump()


@router.get("/api/providers/{provider}/models")
async def list_models(provider: str, request: Request) -> list[dict[str, Any]]:
    cached = _MODEL_CACHE.get(provider)
    if cached and (time.time() - cached[0]) < _CACHE_TTL:
        return cached[1]
    cfg: Config = request.app.state.config
    prov_cfg = getattr(cfg.providers, provider, None)
    if prov_cfg is None:
        raise HTTPException(
            404,
            detail={
                "error": {
                    "code": "unknown_provider",
                    "message": f"Unknown provider '{provider}'",
                }
            },
        )
    if not prov_cfg.api_key:
        raise HTTPException(
            400,
            detail={
                "error": {
                    "code": "provider_missing_key",
                    "message": f"No API key for {provider}",
                    "hint": "Add the key in Settings.",
                }
            },
        )
    try:
        client = get_provider(provider, prov_cfg.api_key)
        models = await client.list_models()
    except ProviderMissingKey as e:
        raise HTTPException(
            400,
            detail={"error": {"code": e.code, "message": e.message, "hint": e.hint}},
        ) from e
    except ProviderError as e:
        raise HTTPException(
            502,
            detail={"error": {"code": e.code, "message": e.message}},
        ) from e
    payload = [m.model_dump() for m in models]
    _MODEL_CACHE[provider] = (time.time(), payload)
    return payload
