"""Golden-reference parity test for the pack scaffold.

A pack created via POST /api/packs (which copies the bundled `_template`
scaffold and patches in the pack/persona fields) must be *structurally*
comparable to the reference Dan pack — same manifest sections, same directory
layout, a populated persona, and a clean validation. This catches the scaffold
drifting away from "what a complete pack looks like" without asserting
byte-equality (Dan has real content the scaffold never will).

Granularity is deliberate: we compare the SET of manifest top-level keys and
directory names, not their values.
"""

from __future__ import annotations

import shutil
from collections.abc import Iterator
from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

from myvoice.packs.templates import locate_template
from myvoice.server import create_app
from myvoice.validate import validate_pack

_REPO_ROOT = Path(__file__).resolve().parents[3]
_DAN = _REPO_ROOT / "packs" / "dan"


@pytest.fixture
def created_pack(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    """Create a pack through the real API flow and yield its directory.

    Uses an isolated packs root (so the new pack lands somewhere disposable)
    and the bundled scaffold via locate_template().
    """
    packs_root = tmp_path / "packs"
    packs_root.mkdir()
    shutil.copytree(locate_template(), packs_root / "_template")
    monkeypatch.setenv("MYVOICE_PACKS_ROOT", str(packs_root))
    monkeypatch.setenv("MYVOICE_CONFIG_PATH", str(tmp_path / "config.yaml"))

    app = create_app()
    with TestClient(app) as client:
        r = client.post(
            "/api/packs",
            json={
                "slug": "parity-test",
                "name": "Parity Test",
                "author": "Tester",
                "persona_identity": "The Reference",
                "persona_one_line": "A structurally complete pack.",
                "persona_tone": "clear, direct",
            },
        )
        assert r.status_code == 201, r.text
        yield packs_root / "parity-test"


def _manifest(pack_root: Path) -> dict[str, object]:
    data = yaml.safe_load((pack_root / "stylepack.yaml").read_text(encoding="utf-8"))
    assert isinstance(data, dict)
    return data


def _subdirs(pack_root: Path) -> set[str]:
    return {p.name for p in pack_root.iterdir() if p.is_dir()}


def test_scaffolded_pack_validates_cleanly(created_pack: Path) -> None:
    result = validate_pack(created_pack)
    assert result.valid is True, "\n".join(f"{e.path}: {e.message}" for e in result.errors)


def test_scaffold_has_all_dan_manifest_sections(created_pack: Path) -> None:
    """The created pack's manifest must include every top-level section Dan has,
    so the scaffold never silently drops a section real packs rely on."""
    dan_keys = set(_manifest(_DAN).keys())
    created_keys = set(_manifest(created_pack).keys())
    missing = dan_keys - created_keys
    assert not missing, f"scaffold manifest is missing sections Dan has: {sorted(missing)}"


def test_scaffold_has_all_dan_directories(created_pack: Path) -> None:
    """The created pack must have the same content directories as Dan
    (formats/, samples/, bios/)."""
    missing = _subdirs(_DAN) - _subdirs(created_pack)
    assert not missing, f"scaffold is missing directories Dan has: {sorted(missing)}"


def test_scaffolded_persona_is_populated(created_pack: Path) -> None:
    persona = _manifest(created_pack)["persona"]
    assert isinstance(persona, dict)
    assert persona.get("identity")
    assert persona.get("one_line")
    assert persona.get("tone")  # supplied at creation
