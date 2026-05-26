"""Typed errors for the extractor pipeline."""
from __future__ import annotations


class ExtractorError(Exception):
    """Pipeline failure with a stable code for the error envelope."""

    def __init__(self, code: str, message: str, *, hint: str | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.hint = hint
