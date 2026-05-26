"""POST /api/extract — async job + SSE."""
from __future__ import annotations

import json
import shutil
from collections.abc import Iterator
from pathlib import Path

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from myvoice.server import create_app

_REPO_ROOT = Path(__file__).resolve().parents[4]
_TEMPLATE_SRC = _REPO_ROOT / "packs" / "_template"

_CANNED = {
    "persona_identity": "The Builder",
    "persona_one_line": "Ships.",
    "banished_words": [],
    "banished_phrases": [],
    "permitted_exceptions": [],
    "style_guide_markdown": "prose",
    "samples": [],
    "pop_culture_allowed": [],
    "pop_culture_banned": [],
}


@pytest.fixture
def extract_client(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Iterator[tuple[TestClient, Path]]:
    packs_root = tmp_path / "packs"
    packs_root.mkdir()
    shutil.copytree(_TEMPLATE_SRC, packs_root / "_template")
    monkeypatch.setenv("MYVOICE_PACKS_ROOT", str(packs_root))
    monkeypatch.setenv("MYVOICE_CONFIG_PATH", str(tmp_path / "config.yaml"))
    monkeypatch.setenv("MYVOICE_TEST_PROVIDER", "mock")
    monkeypatch.setenv("MYVOICE_MOCK_OUTPUT_JSON", json.dumps(_CANNED))
    app = create_app()
    with TestClient(app) as c:
        # Pre-set anthropic key so the route accepts it
        c.put("/api/config", json={"providers": {"anthropic": {"api_key": "sk-mock"}}})
        yield c, packs_root


@respx.mock
def test_start_extract_returns_job_and_completes(extract_client: tuple[TestClient, Path]) -> None:
    client, _ = extract_client
    html = b"<html><body><article>" + (b"plenty of body " * 50) + b"</article></body></html>"
    respx.get("https://e.com/post").mock(
        return_value=httpx.Response(200, content=html, headers={"content-type": "text/html"})
    )
    r = client.post(
        "/api/extract",
        json={
            "urls": ["https://e.com/post"],
            "files": [],
            "pack_meta": {},
            "provider": "anthropic",
            "model": "mock-1",
        },
    )
    assert r.status_code == 202
    job_id = r.json()["job_id"]
    with client.stream("GET", f"/api/jobs/{job_id}/events") as resp:
        body = b"".join(resp.iter_bytes()).decode()
    assert '"type":"stage"' in body
    assert '"type":"complete"' in body
    assert '"persona_identity":"The Builder"' in body


def test_start_extract_zero_inputs_400(extract_client: tuple[TestClient, Path]) -> None:
    client, _ = extract_client
    r = client.post(
        "/api/extract",
        json={"urls": [], "files": [], "pack_meta": {}, "provider": "anthropic", "model": "mock-1"},
    )
    assert r.status_code == 400


def test_start_extract_file_too_large_413(extract_client: tuple[TestClient, Path]) -> None:
    import base64 as _b64
    client, _ = extract_client
    big = b"x" * (6 * 1024 * 1024)
    r = client.post(
        "/api/extract",
        json={
            "urls": [],
            "files": [
                {
                    "name": "big.md",
                    "content_b64": _b64.b64encode(big).decode(),
                    "mime": "text/markdown",
                }
            ],
            "pack_meta": {}, "provider": "anthropic", "model": "mock-1",
        },
    )
    assert r.status_code == 413
