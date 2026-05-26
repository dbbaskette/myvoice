"""End-to-end pipeline test: 1 URL → fetched → cleaned → analyzed → PackProposal."""
from __future__ import annotations

import json

import httpx
import pytest
import respx

from myvoice.extractor.pipeline import run_extract_job
from myvoice.jobs.models import JobType
from myvoice.jobs.registry import JobRegistry

_CANNED = {
    "persona_identity": "The Builder",
    "persona_one_line": "Ships.",
    "banished_words": [],
    "banished_phrases": [],
    "permitted_exceptions": [],
    "style_guide_markdown": "prose",
    "samples": [],
    "pop_culture_allowed": [],
    "pop_culture_banned": [],
}


@pytest.mark.asyncio
@respx.mock
async def test_run_extract_job_end_to_end(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MYVOICE_TEST_PROVIDER", "mock")
    monkeypatch.setenv("MYVOICE_MOCK_OUTPUT_JSON", json.dumps(_CANNED))

    html = b"<html><body><article>" + (b"long body " * 50) + b"</article></body></html>"
    respx.get("https://e.com/post").mock(
        return_value=httpx.Response(
            200, content=html, headers={"content-type": "text/html"}
        )
    )

    reg = JobRegistry()
    job = await reg.create(JobType.EXTRACT)
    await run_extract_job(
        job.id, reg,
        urls=["https://e.com/post"], uploads=[],
        provider_name="anthropic", api_key="sk-mock", model="mock-1",
    )

    final = await reg.get(job.id)
    assert final is not None
    assert final.status == "succeeded"
    assert final.result is not None
    result = final.result
    analysis = result["analysis"]
    assert isinstance(analysis, dict)
    assert analysis["persona_identity"] == "The Builder"
    assert result["provider"] == "anthropic"
