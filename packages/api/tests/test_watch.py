"""Tests for EventBus and watch_task in myvoice.watch."""
from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from myvoice.packs.store import PackStore
from myvoice.watch import EventBus, _slug_for_path, watch_task

# ---------------------------------------------------------------------------
# EventBus unit tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_event_bus_subscribe_and_emit() -> None:
    bus = EventBus()
    q = await bus.subscribe()
    await bus.emit({"type": "pack:updated", "slug": "test"})
    evt = q.get_nowait()
    assert evt["type"] == "pack:updated"
    assert evt["slug"] == "test"


@pytest.mark.asyncio
async def test_event_bus_multiple_subscribers() -> None:
    bus = EventBus()
    q1 = await bus.subscribe()
    q2 = await bus.subscribe()
    await bus.emit({"type": "test"})
    assert q1.get_nowait()["type"] == "test"
    assert q2.get_nowait()["type"] == "test"


@pytest.mark.asyncio
async def test_event_bus_unsubscribe() -> None:
    bus = EventBus()
    q = await bus.subscribe()
    await bus.unsubscribe(q)
    await bus.emit({"type": "test"})
    assert q.empty()


@pytest.mark.asyncio
async def test_event_bus_unsubscribe_idempotent() -> None:
    bus = EventBus()
    q = await bus.subscribe()
    await bus.unsubscribe(q)
    await bus.unsubscribe(q)  # second call should not raise


# ---------------------------------------------------------------------------
# _slug_for_path helper
# ---------------------------------------------------------------------------


def test_slug_for_path_matches_first_component(tmp_path: Path) -> None:
    root = tmp_path / "packs"
    root.mkdir()
    pack_dir = root / "mypack"
    pack_dir.mkdir()
    changed_file = pack_dir / "style-guide.md"
    assert _slug_for_path(changed_file, [root]) == "mypack"


def test_slug_for_path_no_match_returns_none(tmp_path: Path) -> None:
    root = tmp_path / "packs"
    root.mkdir()
    unrelated = tmp_path / "other" / "file.md"
    assert _slug_for_path(unrelated, [root]) is None


# ---------------------------------------------------------------------------
# watch_task integration test
# ---------------------------------------------------------------------------

_MINIMAL_MANIFEST = """\
spec_version: '1.0'
pack:
  slug: testpack
  name: Test Pack
  version: '1.0'
  author: Tester
persona:
  identity: A tester
  one_line: Tests things.
"""


@pytest.mark.asyncio
async def test_pack_update_event_fires(tmp_path: Path) -> None:
    """Modifying a file inside a pack directory should trigger a pack:* event."""
    pack_dir = tmp_path / "testpack"
    pack_dir.mkdir()
    manifest = pack_dir / "stylepack.yaml"
    manifest.write_text(_MINIMAL_MANIFEST, encoding="utf-8")
    guide = pack_dir / "style-guide.md"
    guide.write_text("hello\n", encoding="utf-8")

    store = PackStore([tmp_path])
    bus = EventBus()
    stop = asyncio.Event()

    task = asyncio.create_task(watch_task([tmp_path], bus, store, stop))
    # Give watchfiles a moment to set up its inotify/kqueue watches.
    await asyncio.sleep(0.2)

    q = await bus.subscribe()

    # Trigger a change.
    guide.write_text("changed\n", encoding="utf-8")

    try:
        evt = await asyncio.wait_for(q.get(), timeout=5.0)
    finally:
        stop.set()
        try:
            await asyncio.wait_for(task, timeout=3.0)
        except (TimeoutError, asyncio.CancelledError):
            task.cancel()

    assert evt["type"].startswith("pack:")
    assert evt["slug"] == "testpack"


@pytest.mark.asyncio
async def test_watch_task_no_op_with_empty_roots() -> None:
    """watch_task should return immediately when given no roots."""
    bus = EventBus()
    stop = asyncio.Event()
    # Should complete instantly without blocking.
    await asyncio.wait_for(watch_task([], bus, None, stop), timeout=1.0)


@pytest.mark.asyncio
async def test_watch_task_no_op_with_nonexistent_roots(tmp_path: Path) -> None:
    """watch_task should return immediately if all roots are missing."""
    bus = EventBus()
    stop = asyncio.Event()
    nonexistent = tmp_path / "does_not_exist"
    await asyncio.wait_for(watch_task([nonexistent], bus, None, stop), timeout=1.0)
