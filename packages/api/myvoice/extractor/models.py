"""Pydantic shapes for the extractor pipeline."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class Source(BaseModel):
    kind: Literal["url", "file"]
    location: str
    bytes: int = 0
    word_count: int = 0
    succeeded: bool = True
    error: str | None = None


class FetchedDoc(BaseModel):
    source: Source
    content_type: str = "text/html"
    raw_bytes: bytes = b""
