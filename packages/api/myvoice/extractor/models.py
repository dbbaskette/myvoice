"""Pydantic shapes for the extractor pipeline."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


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


class UploadedFile(BaseModel):
    name: str
    content_type: str
    raw_bytes: bytes


class CleanedDoc(BaseModel):
    source: Source
    text: str


class BanishedWord(BaseModel):
    word: str
    frequency: int = 0


class BanishedPhrase(BaseModel):
    phrase: str
    frequency: int = 0


class PermittedExceptionProposal(BaseModel):
    term: str
    reason: str


class ProposedSample(BaseModel):
    excerpt: str
    source_location: str = ""
    why: str = ""
    rank: int = 99


class AnalysisResult(BaseModel):
    """Strict JSON returned by the LLM."""

    persona_identity: str
    persona_one_line: str
    banished_words: list[BanishedWord] = Field(default_factory=list)
    banished_phrases: list[BanishedPhrase] = Field(default_factory=list)
    permitted_exceptions: list[PermittedExceptionProposal] = Field(default_factory=list)
    style_guide_markdown: str = ""
    samples: list[ProposedSample] = Field(default_factory=list)
    pop_culture_allowed: list[str] = Field(default_factory=list)
    pop_culture_banned: list[str] = Field(default_factory=list)


class PackProposal(BaseModel):
    analysis: AnalysisResult
    sources: list[Source]
    model: str
    provider: str
    cost_usd: float
    input_tokens: int
    output_tokens: int
    elapsed_seconds: float
