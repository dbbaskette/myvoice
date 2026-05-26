"""POST /api/packs/import."""
from __future__ import annotations

import io
import shutil
import zipfile
from collections.abc import Iterator
from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

from myvoice.server import create_app

_REPO_ROOT = Path(__file__).resolve().parents[4]
_DAN_SRC = _REPO_ROOT / "packs" / "dan"


def _make_pack_zip(pack_src: Path, inner_slug: str) -> bytes:
    """Build a zip of pack_src nested under inner_slug/."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for path in pack_src.rglob("*"):
            if path.is_file():
                rel = path.relative_to(pack_src)
                z.write(path, arcname=f"{inner_slug}/{rel}")
    return buf.getvalue()


@pytest.fixture
def import_client(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Iterator[tuple[TestClient, Path]]:
    packs_root = tmp_path / "packs"
    packs_root.mkdir()
    monkeypatch.setenv("MYVOICE_PACKS_ROOT", str(packs_root))
    monkeypatch.setenv("MYVOICE_CONFIG_PATH", str(tmp_path / "config.yaml"))
    app = create_app()
    with TestClient(app) as c:
        yield c, packs_root


def _patch_slug(zip_bytes: bytes, new_slug: str) -> bytes:
    """Re-pack the zip rewriting stylepack.yaml's pack.slug to new_slug + renaming the inner dir."""
    out = io.BytesIO()
    src = zipfile.ZipFile(io.BytesIO(zip_bytes))
    with zipfile.ZipFile(out, "w") as z:
        for name in src.namelist():
            data = src.read(name)
            new_name = new_slug + name[name.index("/"):]
            if name.endswith("stylepack.yaml"):
                manifest = yaml.safe_load(data.decode("utf-8"))
                manifest["pack"]["slug"] = new_slug
                data = yaml.safe_dump(manifest, sort_keys=False).encode("utf-8")
            z.writestr(new_name, data)
    return out.getvalue()


def test_import_pack_success(import_client: tuple[TestClient, Path]) -> None:
    client, packs_root = import_client
    # Build a zip from the on-disk dan pack, rewriting slug → alice
    raw = _make_pack_zip(_DAN_SRC, "dan")
    altered = _patch_slug(raw, "alice")
    r = client.post(
        "/api/packs/import",
        files={"file": ("alice.zip", altered, "application/zip")},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["slug"] == "alice"
    assert (packs_root / "alice" / "stylepack.yaml").is_file()


def test_import_slug_conflict_409(import_client: tuple[TestClient, Path]) -> None:
    client, packs_root = import_client
    # Pre-create the pack
    shutil.copytree(_DAN_SRC, packs_root / "dan")
    raw = _make_pack_zip(_DAN_SRC, "dan")
    r = client.post(
        "/api/packs/import",
        files={"file": ("dan.zip", raw, "application/zip")},
    )
    assert r.status_code == 409
    assert r.json()["detail"]["error"]["code"] == "slug_conflict"


def test_import_invalid_zip_422(import_client: tuple[TestClient, Path]) -> None:
    client, _ = import_client
    # A zip with NO stylepack.yaml
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("notapack/README.md", "hello")
    r = client.post(
        "/api/packs/import",
        files={"file": ("bad.zip", buf.getvalue(), "application/zip")},
    )
    assert r.status_code == 422
    assert r.json()["detail"]["error"]["code"] == "invalid_pack"
