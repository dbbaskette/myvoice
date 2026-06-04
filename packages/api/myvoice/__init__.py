"""myvoice — Local-first style-pack editor + library.

Public API for other apps (e.g., Pencraft):

    from myvoice import PackStore, compose_prompt, lint, validate_pack
    from myvoice import Manifest, Violation, LintHit

Imports outside the names listed in __all__ below are PRIVATE and may
change without notice. Pin a version of myvoice if you depend on
internal modules.
"""
from __future__ import annotations

__version__ = "0.1.0"

from myvoice.compose import compose as compose_prompt
from myvoice.lint import (
    LintHit,
    Violation,
    detect_ai_patterns,
    detect_positive_hits,
    lint,
    lint_to_hits,
)
from myvoice.packs.manifest import Manifest
from myvoice.packs.store import PackStore
from myvoice.validate import validate_pack

__all__ = [
    "LintHit",
    "Manifest",
    "PackStore",
    "Violation",
    "__version__",
    "compose_prompt",
    "detect_ai_patterns",
    "detect_positive_hits",
    "lint",
    "lint_to_hits",
    "validate_pack",
]
