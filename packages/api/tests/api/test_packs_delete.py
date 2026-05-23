"""Tests for DELETE /api/packs/{slug}."""
from __future__ import annotations

import shutil
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from myvoice.server import create_app

_REPO_ROOT = Path(__file__).resolve().parents[4]
_TEMPLATE_SRC = _REPO_ROOT / "packs" / "_template"
_DAN_SRC = _REPO_ROOT / "packs" / "dan"


@pytest.fixture
def delete_client(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Iterator[tuple[TestClient, Path]]:
    """TestClient with an isolated packs root containing dan + _template.

    Yields (client, packs_root). Trash root resolves to <tmp_path>/trash.
    """
    packs_root = tmp_path / "packs"
    packs_root.mkdir()
    shutil.copytree(_TEMPLATE_SRC, packs_root / "_template")
    shutil.copytree(_DAN_SRC, packs_root / "dan")
    monkeypatch.setenv("MYVOICE_PACKS_ROOT", str(packs_root))
    monkeypatch.setenv("MYVOICE_CONFIG_PATH", str(tmp_path / "config.yaml"))
    app = create_app()
    with TestClient(app) as c:
        yield c, packs_root


def test_delete_pack_success(delete_client: tuple[TestClient, Path]) -> None:
    client, packs_root = delete_client
    # Sanity: dan exists
    assert client.get("/api/packs/dan").status_code == 200
    r = client.delete("/api/packs/dan")
    assert r.status_code == 204, r.text
    # Pack gone from API
    assert client.get("/api/packs/dan").status_code == 404
    # Original dir gone
    assert not (packs_root / "dan").exists()
    # Trash entry created
    trash_root = packs_root.parent / "trash"
    assert trash_root.exists()
    entries = list(trash_root.iterdir())
    assert len(entries) == 1
    assert entries[0].name.endswith("-dan")
    # Manifest survived in trash
    assert (entries[0] / "stylepack.yaml").is_file()


def test_delete_unknown_pack_returns_404(delete_client: tuple[TestClient, Path]) -> None:
    client, _ = delete_client
    r = client.delete("/api/packs/nonexistent")
    assert r.status_code == 404


def test_delete_pack_emits_event(delete_client: tuple[TestClient, Path]) -> None:
    import asyncio
    from typing import cast

    from fastapi import FastAPI

    client, _ = delete_client
    app = cast(FastAPI, client.app)
    bus = app.state.event_bus

    loop = asyncio.new_event_loop()
    try:
        q = loop.run_until_complete(bus.subscribe())

        async def collect_one() -> dict[str, object]:
            return await asyncio.wait_for(q.get(), timeout=3.0)

        r = client.delete("/api/packs/dan")
        assert r.status_code == 204
        evt = loop.run_until_complete(collect_one())
    finally:
        loop.run_until_complete(bus.unsubscribe(q))
        loop.close()

    assert evt["type"] == "pack:deleted"
    assert evt["slug"] == "dan"
