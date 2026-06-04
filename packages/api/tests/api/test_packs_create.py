"""Tests for POST /api/packs."""
from __future__ import annotations

import shutil
from collections.abc import Iterator
from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

from myvoice.server import create_app

_REPO_ROOT = Path(__file__).resolve().parents[4]
_TEMPLATE_SRC = _REPO_ROOT / "packs" / "_template"


@pytest.fixture
def create_client(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Iterator[tuple[TestClient, Path]]:
    """TestClient with an isolated empty packs root that contains only `_template`.

    Yields (client, packs_root).
    """
    packs_root = tmp_path / "packs"
    packs_root.mkdir()
    shutil.copytree(_TEMPLATE_SRC, packs_root / "_template")
    monkeypatch.setenv("MYVOICE_PACKS_ROOT", str(packs_root))
    monkeypatch.setenv("MYVOICE_CONFIG_PATH", str(tmp_path / "config.yaml"))
    app = create_app()
    with TestClient(app) as c:
        yield c, packs_root


def test_create_pack_success(create_client: tuple[TestClient, Path]) -> None:
    client, packs_root = create_client
    r = client.post(
        "/api/packs",
        json={
            "slug": "alice",
            "name": "Alice Voice",
            "author": "Alice Example",
            "persona_identity": "The Pragmatic Engineer",
            "persona_one_line": "Builds tight, ships often, no fluff.",
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["slug"] == "alice"
    assert body["name"] == "Alice Voice"
    assert body["valid"] is True
    # Filesystem
    pack_dir = packs_root / "alice"
    assert (pack_dir / "stylepack.yaml").is_file()
    manifest = yaml.safe_load((pack_dir / "stylepack.yaml").read_text())
    assert manifest["pack"]["slug"] == "alice"
    assert manifest["pack"]["name"] == "Alice Voice"
    assert manifest["pack"]["author"] == "Alice Example"
    assert manifest["pack"]["version"] == "0.1.0"
    assert manifest["persona"]["identity"] == "The Pragmatic Engineer"
    # GET should now find it
    r = client.get("/api/packs/alice")
    assert r.status_code == 200


def test_create_pack_with_tone_writes_persona_tone(
    create_client: tuple[TestClient, Path],
) -> None:
    client, packs_root = create_client
    r = client.post(
        "/api/packs",
        json={
            "slug": "toned",
            "name": "Toned",
            "author": "T",
            "persona_identity": "The Closer",
            "persona_one_line": "Gets to the point.",
            "persona_tone": "energetic, definitive, and transparent",
        },
    )
    assert r.status_code == 201, r.text
    manifest = yaml.safe_load((packs_root / "toned" / "stylepack.yaml").read_text())
    assert manifest["persona"]["tone"] == "energetic, definitive, and transparent"


def test_create_pack_without_tone_omits_it(create_client: tuple[TestClient, Path]) -> None:
    client, packs_root = create_client
    r = client.post(
        "/api/packs",
        json={
            "slug": "plain",
            "name": "Plain",
            "author": "P",
            "persona_identity": "i",
            "persona_one_line": "o",
        },
    )
    assert r.status_code == 201, r.text
    manifest = yaml.safe_load((packs_root / "plain" / "stylepack.yaml").read_text())
    assert "tone" not in manifest["persona"]


def test_create_pack_slug_conflict_returns_409(create_client: tuple[TestClient, Path]) -> None:
    client, _ = create_client
    payload = {
        "slug": "alice",
        "name": "Alice",
        "author": "A",
        "persona_identity": "i",
        "persona_one_line": "o",
    }
    r1 = client.post("/api/packs", json=payload)
    assert r1.status_code == 201
    r2 = client.post("/api/packs", json=payload)
    assert r2.status_code == 409
    err = r2.json()["detail"]["error"]
    assert err["code"] == "slug_conflict"


@pytest.mark.parametrize(
    "bad_slug",
    ["Foo", "foo bar", "1foo", "-foo", "_foo", "", "foo/bar", "foo.bar"],
)
def test_create_pack_bad_slug_returns_422(
    create_client: tuple[TestClient, Path], bad_slug: str
) -> None:
    client, _ = create_client
    r = client.post(
        "/api/packs",
        json={
            "slug": bad_slug,
            "name": "n",
            "author": "a",
            "persona_identity": "i",
            "persona_one_line": "o",
        },
    )
    assert r.status_code == 422


def test_create_pack_optional_description(create_client: tuple[TestClient, Path]) -> None:
    client, packs_root = create_client
    r = client.post(
        "/api/packs",
        json={
            "slug": "bob",
            "name": "Bob",
            "author": "Bob Sr.",
            "persona_identity": "The Builder",
            "persona_one_line": "Ships daily.",
            "description": "A test voice.",
        },
    )
    assert r.status_code == 201
    manifest = yaml.safe_load((packs_root / "bob" / "stylepack.yaml").read_text())
    assert manifest["pack"]["description"] == "A test voice."


def test_create_pack_emits_event(create_client: tuple[TestClient, Path]) -> None:
    """Verify a pack:created event is broadcast on /api/events."""
    import asyncio
    from typing import Any, cast

    from fastapi import FastAPI

    client, _ = create_client
    app = cast(FastAPI, client.app)
    bus = app.state.event_bus

    received: list[dict[str, Any]] = []
    loop = asyncio.new_event_loop()
    try:
        q = loop.run_until_complete(bus.subscribe())

        async def collect_one() -> dict[str, Any]:
            return await asyncio.wait_for(q.get(), timeout=3.0)

        # Trigger the create
        r = client.post(
            "/api/packs",
            json={
                "slug": "carol",
                "name": "Carol",
                "author": "c",
                "persona_identity": "i",
                "persona_one_line": "o",
            },
        )
        assert r.status_code == 201
        evt = loop.run_until_complete(collect_one())
        received.append(evt)
    finally:
        loop.run_until_complete(bus.unsubscribe(q))
        loop.close()

    assert received[0]["type"] == "pack:created"
    assert received[0]["slug"] == "carol"
