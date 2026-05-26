"""Extractor FETCH stage — respx-mocked HTTP."""
from __future__ import annotations

import asyncio

import httpx
import pytest
import respx

from myvoice.extractor.fetch import fetch_all


@pytest.mark.asyncio
@respx.mock
async def test_fetch_all_success() -> None:
    respx.get("https://example.com/a").mock(return_value=httpx.Response(200, text="<html>A</html>"))
    respx.get("https://example.com/b").mock(return_value=httpx.Response(200, text="<html>B</html>"))
    docs = await fetch_all(["https://example.com/a", "https://example.com/b"])
    assert len(docs) == 2
    assert all(d.source.succeeded for d in docs)
    assert docs[0].source.location == "https://example.com/a"
    assert docs[0].raw_bytes == b"<html>A</html>"


@pytest.mark.asyncio
@respx.mock
async def test_fetch_all_retries_then_succeeds() -> None:
    """3 retries: fail, fail, succeed."""
    responses: list[httpx.Response | Exception] = [
        httpx.ConnectError("boom"),
        httpx.ConnectError("boom"),
        httpx.Response(200, text="<html>OK</html>"),
    ]
    respx.get("https://flaky.example/").mock(side_effect=responses)
    docs = await fetch_all(["https://flaky.example/"])
    assert docs[0].source.succeeded
    assert docs[0].raw_bytes == b"<html>OK</html>"


@pytest.mark.asyncio
@respx.mock
async def test_fetch_all_soft_failure_after_retries() -> None:
    """All retries fail → Source.succeeded=False, error set; no exception."""
    respx.get("https://fail.example/").mock(side_effect=httpx.ConnectError("nope"))
    docs = await fetch_all(["https://fail.example/"])
    assert docs[0].source.succeeded is False
    assert docs[0].source.error is not None


@pytest.mark.asyncio
@respx.mock
async def test_fetch_all_sets_user_agent() -> None:
    route = respx.get("https://ua.example/").mock(return_value=httpx.Response(200, text="x"))
    await fetch_all(["https://ua.example/"])
    ua = route.calls.last.request.headers.get("user-agent")
    assert ua and ua.startswith("myvoice/")


@pytest.mark.asyncio
@respx.mock
async def test_fetch_all_concurrency_cap() -> None:
    """Verify max-concurrent: spawn 8 with cap 3; in-flight count never exceeds 3."""
    in_flight = 0
    peak = 0
    lock = asyncio.Lock()

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal in_flight, peak
        async with lock:
            in_flight += 1
            peak = max(peak, in_flight)
        await asyncio.sleep(0.05)
        async with lock:
            in_flight -= 1
        return httpx.Response(200, text="x")

    for i in range(8):
        respx.get(f"https://cc.example/{i}").mock(side_effect=handler)
    urls = [f"https://cc.example/{i}" for i in range(8)]
    await fetch_all(urls, concurrency=3)
    assert peak <= 3
