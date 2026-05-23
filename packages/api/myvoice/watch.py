"""Watch pack directories with watchfiles; emit pack:* events to the global event bus."""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from watchfiles import awatch


class EventBus:
    """In-process pub/sub for pack/config events.

    Multiple SSE clients can subscribe; each gets its own asyncio.Queue.
    Lock protects the listener list for safe concurrent mutation.
    """

    def __init__(self) -> None:
        self._listeners: list[asyncio.Queue[dict[str, Any]]] = []
        self._lock = asyncio.Lock()

    async def subscribe(self) -> asyncio.Queue[dict[str, Any]]:
        """Return a new queue that will receive all future events."""
        async with self._lock:
            q: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
            self._listeners.append(q)
            return q

    async def unsubscribe(self, q: asyncio.Queue[dict[str, Any]]) -> None:
        """Remove a queue from the listener list (safe to call after disconnect)."""
        async with self._lock:
            try:
                self._listeners.remove(q)
            except ValueError:
                pass  # already removed — idempotent

    async def emit(self, event: dict[str, Any]) -> None:
        """Fan out *event* to every current subscriber (snapshot under lock)."""
        async with self._lock:
            listeners = list(self._listeners)
        for q in listeners:
            await q.put(event)


async def watch_task(
    roots: list[Path],
    bus: EventBus,
    pack_store: Any,
    stop_event: asyncio.Event,
) -> None:
    """Long-running coroutine: watch *roots* and emit pack:* events on change.

    Returns immediately if *roots* is empty or none of the roots exist.
    """
    if not roots:
        return
    existing = [r for r in roots if r.exists()]
    if not existing:
        return

    async for changes in awatch(*existing, stop_event=stop_event, debounce=200):
        # Group changed paths by pack slug.
        affected: dict[str, list[str]] = {}
        for _change, path_str in changes:
            path = Path(path_str)
            slug = _slug_for_path(path, roots)
            if slug is None:
                continue
            affected.setdefault(slug, []).append(path.name)

        for slug, files in affected.items():
            # Re-read + re-validate the affected pack.
            pack_store.rescan_one(slug)
            info = pack_store.get(slug)
            if info is None:
                await bus.emit({"type": "pack:deleted", "slug": slug})
            elif not info.valid:
                await bus.emit(
                    {
                        "type": "pack:invalid",
                        "slug": slug,
                        "errors": [
                            {"path": e.path, "message": e.message}
                            for e in info.errors
                        ],
                    }
                )
            else:
                await bus.emit(
                    {"type": "pack:updated", "slug": slug, "files_changed": files}
                )


def _slug_for_path(path: Path, roots: list[Path]) -> str | None:
    """Determine which pack slug a changed file belongs to.

    Walk *roots* and try to make *path* relative to each root; the first
    path component of the relative path is the pack's directory name (slug).
    """
    for root in roots:
        try:
            rel = path.relative_to(root)
        except ValueError:
            continue
        parts = rel.parts
        if len(parts) >= 1:
            return parts[0]
    return None
