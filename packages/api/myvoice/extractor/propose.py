"""PROPOSE stage: pure mapper AnalysisResult → PackProposal."""
from __future__ import annotations

from myvoice.extractor.models import AnalysisResult, PackProposal, Source
from myvoice.llm.cost import usd


def propose(
    analysis: AnalysisResult,
    sources: list[Source],
    *,
    model: str,
    provider: str,
    input_tokens: int,
    output_tokens: int,
    elapsed_seconds: float,
) -> PackProposal:
    return PackProposal(
        analysis=analysis,
        sources=sources,
        model=model,
        provider=provider,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=usd(provider, model, input_tokens, output_tokens),
        elapsed_seconds=elapsed_seconds,
    )
