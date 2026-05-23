"""GET /api/events — long-lived SSE for global pack/config events."""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from myvoice.jobs.events import sse_format
from myvoice.watch import EventBus

router = APIRouter(tags=["events"])

_HEARTBEAT_TIMEOUT = 15.0  # seconds


@router.get("/api/events")
async def global_events(request: Request) -> StreamingResponse:
    """Subscribe to the global event bus and stream events as SSE.

    Emits a heartbeat comment (': ping') every 15 s to keep the connection
    alive through proxies. Cleans up the queue on client disconnect.
    """
    bus: EventBus = request.app.state.event_bus

    async def stream() -> AsyncIterator[str]:
        q = await bus.subscribe()
        try:
            while True:
                if await request.is_disconnected():
                    return
                try:
                    evt = await asyncio.wait_for(q.get(), timeout=_HEARTBEAT_TIMEOUT)
                except TimeoutError:
                    yield ": ping\n\n"
                    continue
                yield sse_format(evt)
        finally:
            await bus.unsubscribe(q)

    return StreamingResponse(stream(), media_type="text/event-stream")
