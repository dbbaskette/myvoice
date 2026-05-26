"""POST /api/packs/from-analysis."""
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
def from_analysis_client(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Iterator[tuple[TestClient, Path]]:
    packs_root = tmp_path / "packs"
    packs_root.mkdir()
    shutil.copytree(_TEMPLATE_SRC, packs_root / "_template")
    monkeypatch.setenv("MYVOICE_PACKS_ROOT", str(packs_root))
    monkeypatch.setenv("MYVOICE_CONFIG_PATH", str(tmp_path / "config.yaml"))
    app = create_app()
    with TestClient(app) as c:
        yield c, packs_root


def _proposal_payload() -> dict[str, object]:
    return {
        "persona_identity": "The Builder",
        "persona_one_line": "Ships often.",
        "banished_words": [{"word": "delve", "frequency": 0}],
        "banished_phrases": [],
        "permitted_exceptions": [{"term": "Pivotal", "reason": "Proper noun"}],
        "style_guide_markdown": "Some new prose about voice.",
        "samples": [
            {
                "excerpt": "First sample.", "source_location": "https://e.com/a",
                "why": "good", "rank": 1,
            },
            {
                "excerpt": "Second sample.", "source_location": "https://e.com/b",
                "why": "ok", "rank": 2,
            },
        ],
        "pop_culture_allowed": ["Marvel"],
        "pop_culture_banned": ["Star Wars"],
    }


def test_from_analysis_writes_pack(from_analysis_client: tuple[TestClient, Path]) -> None:
    client, packs_root = from_analysis_client
    r = client.post(
        "/api/packs/from-analysis",
        json={
            "slug": "alice",
            "name": "Alice Voice",
            "author": "Alice",
            "persona_identity": "Override Identity",
            "persona_one_line": "Override one line.",
            "proposal": _proposal_payload(),
            "selected_sample_indexes": [0],  # only the first sample
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["slug"] == "alice"
    assert body["valid"] is True

    manifest = yaml.safe_load((packs_root / "alice" / "stylepack.yaml").read_text())
    assert manifest["persona"]["identity"] == "Override Identity"
    assert manifest["banished"]["words"] == ["delve"]
    assert manifest["pop_culture"]["allowed"] == ["Marvel"]
    assert len(manifest["samples"]) == 1
    assert manifest["samples"][0]["file"].startswith("samples/01-")
    # Style guide was appended
    sg = (packs_root / "alice" / "style-guide.md").read_text()
    assert "Some new prose about voice." in sg


def test_from_analysis_slug_conflict(from_analysis_client: tuple[TestClient, Path]) -> None:
    client, _ = from_analysis_client
    payload = {
        "slug": "alice", "name": "A", "author": "A",
        "persona_identity": "i", "persona_one_line": "o",
        "proposal": _proposal_payload(), "selected_sample_indexes": [],
    }
    r1 = client.post("/api/packs/from-analysis", json=payload)
    assert r1.status_code == 201
    r2 = client.post("/api/packs/from-analysis", json=payload)
    assert r2.status_code == 409
