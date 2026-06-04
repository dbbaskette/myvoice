"""The writable pack dir (resolve_write_root) must be a discovery root.

Regression test for installed-wheel mode: with no MYVOICE_PACKS_ROOT and no
repo packs/, a created pack lands in ~/.myvoice/packs and must still be found
by the store (otherwise POST /api/packs 500s on the post-create lookup).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from myvoice.packs.templates import resolve_write_root
from myvoice.server import _resolve_pack_roots, create_app


def test_resolve_pack_roots_includes_write_root(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("MYVOICE_PACKS_ROOT", raising=False)
    monkeypatch.setenv("HOME", str(tmp_path))
    roots = {r.resolve() for r in _resolve_pack_roots()}
    assert resolve_write_root().resolve() in roots


def test_create_pack_is_discoverable_without_env_root(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Simulates installed mode: no MYVOICE_PACKS_ROOT, isolated HOME → the
    write root is the only place the new pack lands, and it must be found."""
    monkeypatch.delenv("MYVOICE_PACKS_ROOT", raising=False)
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("MYVOICE_CONFIG_PATH", str(tmp_path / "config.yaml"))

    app = create_app()
    with TestClient(app) as client:
        r = client.post(
            "/api/packs",
            json={
                "slug": "writeroot-test",
                "name": "Write Root Test",
                "author": "T",
                "persona_identity": "The Closer",
                "persona_one_line": "Ships.",
            },
        )
        assert r.status_code == 201, r.text
        assert r.json()["slug"] == "writeroot-test"
        # Discoverable afterwards (proves it landed in a scanned root).
        got = client.get("/api/packs/writeroot-test")
        assert got.status_code == 200
        # And it physically lives under the write root.
        assert (resolve_write_root() / "writeroot-test" / "stylepack.yaml").is_file()
