"""Extractor CLEAN stage."""
from __future__ import annotations

from pathlib import Path

from myvoice.extractor.clean import clean_fetched, clean_upload
from myvoice.extractor.models import FetchedDoc, Source, UploadedFile

_FIXTURES = Path(__file__).parent / "fixtures"


def test_clean_html_extracts_article_body() -> None:
    raw = (_FIXTURES / "sample.html").read_bytes()
    doc = FetchedDoc(
        source=Source(kind="url", location="https://e.com/", bytes=len(raw), succeeded=True),
        content_type="text/html",
        raw_bytes=raw,
    )
    cleaned = clean_fetched(doc)
    assert cleaned.source.succeeded
    assert "Post Title" in cleaned.text or "article body" in cleaned.text
    assert "Site nav" not in cleaned.text
    assert "© 2026" not in cleaned.text
    assert cleaned.source.word_count > 0


def test_clean_html_too_small_soft_fails() -> None:
    doc = FetchedDoc(
        source=Source(kind="url", location="https://e.com/", succeeded=True),
        content_type="text/html",
        raw_bytes=b"<html><body><p>hi</p></body></html>",
    )
    cleaned = clean_fetched(doc)
    assert cleaned.source.succeeded is False
    assert "too_short" in (cleaned.source.error or "")


def test_clean_upload_markdown() -> None:
    raw = (_FIXTURES / "sample.md").read_bytes()
    up = UploadedFile(name="sample.md", content_type="text/markdown", raw_bytes=raw)
    cleaned = clean_upload(up)
    assert cleaned.source.kind == "file"
    assert cleaned.source.location == "sample.md"
    assert "My Post" in cleaned.text


def test_clean_upload_docx() -> None:
    raw = (_FIXTURES / "sample.docx").read_bytes()
    up = UploadedFile(
        name="sample.docx",
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        raw_bytes=raw,
    )
    cleaned = clean_upload(up)
    assert cleaned.source.succeeded
    assert "First paragraph" in cleaned.text
    assert "Second paragraph" in cleaned.text


def test_clean_upload_unsupported_type() -> None:
    up = UploadedFile(name="x.bin", content_type="application/octet-stream", raw_bytes=b"\x00\x01")
    cleaned = clean_upload(up)
    assert cleaned.source.succeeded is False
    assert "unsupported" in (cleaned.source.error or "")


def test_clean_fetched_unsupported_type() -> None:
    doc = FetchedDoc(
        source=Source(kind="url", location="https://e.com/", succeeded=True),
        content_type="application/pdf",
        raw_bytes=b"%PDF-",
    )
    cleaned = clean_fetched(doc)
    assert cleaned.source.succeeded is False
