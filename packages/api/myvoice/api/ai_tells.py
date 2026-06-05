"""GET /api/ai-tells — the shared AI-tells layer (read-only, global).

These are the universal banished words/phrases/sentence-starters and structural
patterns merged into every pack at compose/lint time. Exposed so the UI can show
the defaults that apply even when a pack's own lists are empty.
"""

from __future__ import annotations

from fastapi import APIRouter

from myvoice.ai_tells import load_ai_tells

router = APIRouter(tags=["ai-tells"])


@router.get("/api/ai-tells")
def get_ai_tells() -> dict[str, object]:
    tells = load_ai_tells()
    return {
        "words": list(tells.words),
        "phrases": list(tells.phrases),
        "sentence_starters": list(tells.sentence_starters),
        "patterns": tells.patterns,
    }
