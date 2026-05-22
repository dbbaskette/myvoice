"""GET/DELETE /api/jobs/{id} + /api/jobs/{id}/events SSE with replay buffer."""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from myvoice.jobs.events import sse_format
from myvoice.jobs.registry import JobRegistry

router = APIRouter(tags=["jobs"])

_HEARTBEAT_TIMEOUT = 15.0  # seconds


@router.get("/api/jobs/{job_id}")
async def get_job(job_id: str, request: Request) -> dict[str, object]:
    """Return a job's current state."""
    reg: JobRegistry = request.app.state.job_registry
    job = await reg.get(job_id)
    if job is None:
        raise HTTPException(
            404,
            detail={"error": {"code": "job_not_found", "message": f"No job {job_id}"}},
        )
    return job.model_dump(mode="json")


@router.delete("/api/jobs/{job_id}", status_code=204)
async def cancel_job(job_id: str, request: Request) -> None:
    """Cancel an in-flight job (sets its cancellation event)."""
    reg: JobRegistry = request.app.state.job_registry
    cancelled = await reg.cancel(job_id)
    if not cancelled:
        raise HTTPException(
            404,
            detail={
                "error": {
                    "code": "job_not_found",
                    "message": f"No active job {job_id}",
                }
            },
        )


@router.get("/api/jobs/{job_id}/events")
async def job_events(job_id: str, request: Request) -> StreamingResponse:
    """SSE stream for a job.

    On connect:
    1. Emit the replay snapshot (stage + partial_text + terminal event if done).
    2. If the job is already terminal, close.
    3. Otherwise subscribe to live events and forward them with a 15s heartbeat.
    """
    reg: JobRegistry = request.app.state.job_registry
    job = await reg.get(job_id)
    if job is None:
        raise HTTPException(
            404,
            detail={"error": {"code": "job_not_found", "message": f"No job {job_id}"}},
        )

    async def stream() -> AsyncIterator[str]:
        # --- Replay snapshot ---
        for evt in reg.replay_snapshot(job_id):
            yield sse_format(evt)

        # If the job is already terminal, the snapshot already contained the final
        # event — nothing more to stream.
        current = await reg.get(job_id)
        if current is None or current.status in ("succeeded", "failed", "cancelled"):
            return

        # --- Live subscription ---
        q = await reg.subscribe(job_id)
        while True:
            if await request.is_disconnected():
                return
            try:
                evt = await asyncio.wait_for(q.get(), timeout=_HEARTBEAT_TIMEOUT)
            except TimeoutError:
                # SSE comment keeps the connection alive through proxies.
                yield ": ping\n\n"
                continue
            yield sse_format(evt)
            if evt.get("type") in ("complete", "error"):
                return

    return StreamingResponse(stream(), media_type="text/event-stream")
