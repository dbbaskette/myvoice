"""Locate the bundled `_template` pack on disk."""
from __future__ import annotations

import os
from pathlib import Path


def _candidate_template_paths() -> list[Path]:
    """Ordered list of places `_template` might live."""
    here = Path(__file__).resolve()
    candidates: list[Path] = []
    # Repo layout: packages/api/myvoice/packs/templates.py → repo_root/packs/_template
    candidates.append(here.parents[3] / "packs" / "_template")
    # Sibling of MYVOICE_PACKS_ROOT (if set, the template should still be the bundled one).
    env_root = os.environ.get("MYVOICE_PACKS_ROOT")
    if env_root:
        candidates.append(Path(env_root) / "_template")
    return candidates


def locate_template() -> Path:
    """Return the path to the bundled `_template` pack, or raise FileNotFoundError."""
    for candidate in _candidate_template_paths():
        if (candidate / "stylepack.yaml").is_file():
            return candidate
    raise FileNotFoundError(
        "Could not find bundled _template pack. Checked: "
        + ", ".join(str(p) for p in _candidate_template_paths())
    )


def resolve_write_root() -> Path:
    """Where to create new packs. MYVOICE_PACKS_ROOT if set, else ~/.myvoice/packs/."""
    env = os.environ.get("MYVOICE_PACKS_ROOT")
    if env:
        return Path(env)
    return Path.home() / ".myvoice" / "packs"
