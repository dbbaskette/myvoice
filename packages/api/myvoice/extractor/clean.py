"""CLEAN stage: extract plain text from fetched HTML / uploaded md/txt/docx."""
from __future__ import annotations

import io

import trafilatura

from myvoice.extractor.models import CleanedDoc, FetchedDoc, Source, UploadedFile

_HTML_MIN_CHARS = 200

_DOCX_MIME = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)


def clean_fetched(doc: FetchedDoc) -> CleanedDoc:
    """Extract text from a URL-fetched document."""
    if not doc.source.succeeded:
        return CleanedDoc(source=doc.source, text="")
    ct = (doc.content_type or "").lower()
    if "html" in ct or ct.startswith("text/html"):
        return _clean_html(doc)
    if ct.startswith("text/markdown") or ct.startswith("text/plain"):
        return _clean_text(doc.raw_bytes, doc.source)
    return CleanedDoc(
        source=_mark_failed(doc.source, f"unsupported_content_type:{ct}"),
        text="",
    )


def clean_upload(up: UploadedFile) -> CleanedDoc:
    """Extract text from a base64-uploaded file (md/txt/docx)."""
    source = Source(
        kind="file", location=up.name,
        bytes=len(up.raw_bytes), succeeded=True,
    )
    name = up.name.lower()
    ct = (up.content_type or "").lower()
    if name.endswith(".md") or name.endswith(".txt") or ct.startswith("text/"):
        return _clean_text(up.raw_bytes, source)
    if name.endswith(".docx") or ct == _DOCX_MIME:
        return _clean_docx(up.raw_bytes, source)
    return CleanedDoc(
        source=_mark_failed(source, f"unsupported:{ct or 'unknown'}"),
        text="",
    )


def _clean_html(doc: FetchedDoc) -> CleanedDoc:
    try:
        html = doc.raw_bytes.decode("utf-8", errors="replace")
    except Exception as e:
        return CleanedDoc(source=_mark_failed(doc.source, f"decode:{e}"), text="")
    text = trafilatura.extract(
        html,
        include_comments=False,
        include_tables=False,
        favor_precision=True,
    ) or ""
    if len(text) < _HTML_MIN_CHARS:
        return CleanedDoc(
            source=_mark_failed(doc.source, "too_short"),
            text=text,
        )
    return CleanedDoc(
        source=_with_word_count(doc.source, text),
        text=text,
    )


def _clean_text(raw: bytes, source: Source) -> CleanedDoc:
    text = raw.decode("utf-8", errors="replace")
    text = _strip_frontmatter(text)
    return CleanedDoc(source=_with_word_count(source, text), text=text)


def _clean_docx(raw: bytes, source: Source) -> CleanedDoc:
    from docx import Document

    try:
        doc = Document(io.BytesIO(raw))
    except Exception as e:
        return CleanedDoc(source=_mark_failed(source, f"docx_parse:{e}"), text="")
    paras = [p.text.strip() for p in doc.paragraphs if p.text and p.text.strip()]
    text = "\n\n".join(paras)
    return CleanedDoc(source=_with_word_count(source, text), text=text)


def _strip_frontmatter(text: str) -> str:
    lines = text.splitlines()
    if len(lines) >= 3 and lines[0].strip() == "---":
        for i in range(1, len(lines)):
            if lines[i].strip() == "---":
                return "\n".join(lines[i + 1 :]).lstrip("\n")
    return text


def _mark_failed(source: Source, error: str) -> Source:
    return source.model_copy(update={"succeeded": False, "error": error})


def _with_word_count(source: Source, text: str) -> Source:
    return source.model_copy(update={"word_count": len(text.split())})
