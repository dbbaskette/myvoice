from myvoice.extractor.models import AnalysisResult, Source
from myvoice.extractor.propose import propose


def test_propose_computes_cost_and_carries_meta() -> None:
    analysis = AnalysisResult(persona_identity="x", persona_one_line="y")
    sources = [Source(kind="url", location="https://e.com/", succeeded=True)]
    proposal = propose(
        analysis, sources,
        model="claude-sonnet-4-6", provider="anthropic",
        input_tokens=1000, output_tokens=500, elapsed_seconds=2.5,
    )
    assert proposal.provider == "anthropic"
    assert proposal.model == "claude-sonnet-4-6"
    assert proposal.elapsed_seconds == 2.5
    # Sonnet rates from rates.yaml: $3/M in, $15/M out → 0.003 + 0.0075 = 0.0105
    assert abs(proposal.cost_usd - 0.0105) < 1e-6
    assert proposal.sources == sources
