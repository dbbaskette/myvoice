"""POST /api/rewrite — async, streaming."""
from __future__ import annotations

import dataclasses
from typing import Any

import yaml
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel

from myvoice.compose import compose
from myvoice.config import Config
from myvoice.jobs.models import JobType
from myvoice.jobs.registry import JobRegistry
from myvoice.lint import detect_ai_patterns, detect_positive_hits, lint_to_hits
from myvoice.llm.cost import usd
from myvoice.llm.exceptions import ProviderError, ProviderMissingKey, ProviderRateLimit
from myvoice.llm.registry import get_provider
from myvoice.packs.manifest import Manifest

router = APIRouter(tags=["rewrite"])


class RewriteRequest(BaseModel):
    pack: str
    format: str | None = None
    samples: list[str] = []
    draft: str
    provider: str
    model: str


@router.post("/api/rewrite", status_code=202)
async def start_rewrite(
    req: RewriteRequest, request: Request, background_tasks: BackgroundTasks
) -> dict[str, str]:
    store = request.app.state.pack_store
    info = store.get(req.pack)
    if info is None:
        raise HTTPException(
            404,
            detail={"error": {"code": "pack_not_found", "message": f"No pack '{req.pack}'"}},
        )
    cfg: Config = request.app.state.config
    prov_cfg = getattr(cfg.providers, req.provider, None)
    if prov_cfg is None or not prov_cfg.api_key:
        raise HTTPException(
            400,
            detail={
                "error": {
                    "code": "provider_missing_key",
                    "message": f"No API key for {req.provider}",
                    "hint": "Add the key in Settings.",
                }
            },
        )

    reg: JobRegistry = request.app.state.job_registry
    job = await reg.create(JobType.REWRITE)

    background_tasks.add_task(
        _run_rewrite, reg, job.id, info, req, prov_cfg.api_key
    )
    return {"job_id": job.id}


async def _run_rewrite(
    reg: JobRegistry,
    job_id: str,
    pack_info: Any,
    req: RewriteRequest,
    api_key: str,
) -> None:
    cancel_evt = reg.cancellation_event(job_id)
    try:
        await reg.set_stage(job_id, "composing", progress=0.05)
        # Load manifest from root_path (PackInfo does not cache manifest)
        manifest_path = pack_info.root_path / "stylepack.yaml"
        manifest = Manifest.model_validate(
            yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
        )
        prompt = compose(
            pack_info.root_path,
            format=req.format,
            samples=req.samples if req.samples else None,
            draft=req.draft,
        )
        await reg.set_stage(job_id, "streaming", progress=0.10)
        client = get_provider(req.provider, api_key)
        final_usage = None
        async for chunk in client.stream(model=req.model, prompt=prompt):
            if cancel_evt.is_set():
                return
            if chunk.delta:
                await reg.append_token(job_id, chunk.delta)
            if chunk.usage is not None:
                final_usage = chunk.usage
        job = await reg.get(job_id)
        if job is None or cancel_evt.is_set():
            return
        full_output = job.partial_text
        await reg.set_stage(job_id, "linting", progress=0.95)
        violations = lint_to_hits(manifest, full_output) + detect_ai_patterns(full_output)
        hits = detect_positive_hits(full_output)
        in_tok = final_usage.input_tokens if final_usage else 0
        out_tok = final_usage.output_tokens if final_usage else 0
        cost = usd(req.provider, req.model, in_tok, out_tok)
        await reg.complete(job_id, {
            "output": full_output,
            "lint_violations": [dataclasses.asdict(v) for v in violations],
            "lint_hits": [dataclasses.asdict(h) for h in hits],
            "input_tokens": in_tok,
            "output_tokens": out_tok,
            "cost_usd": cost,
            "model": req.model,
            "provider": req.provider,
            "finish_reason": final_usage.finish_reason if final_usage else "stop",
        })
    except ProviderMissingKey as e:
        await reg.fail(job_id, e.code, e.message, e.hint)
    except ProviderRateLimit as e:
        await reg.fail(job_id, e.code, e.message, e.hint)
    except ProviderError as e:
        await reg.fail(job_id, e.code, e.message, e.hint)
    except Exception as e:
        await reg.fail(job_id, "internal_error", f"Unexpected: {e}")
