"""Pipeline orchestrator: drive FETCH → CLEAN → ANALYZE → PROPOSE and push stage events."""
from __future__ import annotations

import time

from myvoice.extractor.analyze import analyze
from myvoice.extractor.clean import clean_fetched, clean_upload
from myvoice.extractor.exceptions import ExtractorError
from myvoice.extractor.fetch import fetch_all
from myvoice.extractor.models import CleanedDoc, UploadedFile
from myvoice.extractor.propose import propose
from myvoice.jobs.registry import JobRegistry
from myvoice.llm.exceptions import ProviderError
from myvoice.llm.registry import get_provider


async def run_extract_job(
    job_id: str,
    reg: JobRegistry,
    *,
    urls: list[str],
    uploads: list[UploadedFile],
    provider_name: str,
    api_key: str,
    model: str,
) -> None:
    """Background-task entry point.

    Runs the 4 stages, pushes stage events, completes/fails the job.
    """
    cancel_evt = reg.cancellation_event(job_id)
    started = time.monotonic()
    try:
        # FETCH
        await reg.set_stage(job_id, "fetching", progress=0.05)
        fetched = await fetch_all(urls) if urls else []
        if cancel_evt.is_set():
            return

        # CLEAN
        await reg.set_stage(job_id, "cleaning", progress=0.30)
        cleaned: list[CleanedDoc] = [clean_fetched(d) for d in fetched]
        cleaned.extend(clean_upload(u) for u in uploads)
        if cancel_evt.is_set():
            return

        # ANALYZE
        await reg.set_stage(job_id, "analyzing", progress=0.50)
        provider = get_provider(provider_name, api_key)
        analysis, in_tok, out_tok = await analyze(cleaned, provider, model=model)
        if cancel_evt.is_set():
            return

        # PROPOSE
        await reg.set_stage(job_id, "proposing", progress=0.90)
        proposal = propose(
            analysis,
            [d.source for d in cleaned],
            model=model, provider=provider_name,
            input_tokens=in_tok, output_tokens=out_tok,
            elapsed_seconds=time.monotonic() - started,
        )
        await reg.complete(job_id, proposal.model_dump(mode="json"))

    except ExtractorError as e:
        await reg.fail(job_id, e.code, e.message, e.hint)
    except ProviderError as e:
        await reg.fail(job_id, e.code, e.message, e.hint)
    except Exception as e:
        await reg.fail(job_id, "internal_error", f"Unexpected: {e}")
