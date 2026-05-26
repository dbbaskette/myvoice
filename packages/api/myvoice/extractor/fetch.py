"""FETCH stage: async parallel HTTP gather with retries."""
from __future__ import annotations

import asyncio

import httpx

from myvoice import __version__
from myvoice.extractor.models import FetchedDoc, Source

_USER_AGENT = f"myvoice/{__version__}"


async def fetch_all(urls: list[str], *, concurrency: int = 5) -> list[FetchedDoc]:
    """Fetch all URLs in parallel. Soft errors return docs with source.succeeded=False."""
    semaphore = asyncio.Semaphore(concurrency)
    async with httpx.AsyncClient(
        timeout=10.0,
        headers={"User-Agent": _USER_AGENT},
        follow_redirects=True,
    ) as client:
        return list(
            await asyncio.gather(*[_fetch_one(client, url, semaphore) for url in urls])
        )


async def _fetch_one(
    client: httpx.AsyncClient, url: str, semaphore: asyncio.Semaphore
) -> FetchedDoc:
    last_err: Exception | None = None
    async with semaphore:
        for attempt in range(3):
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                return FetchedDoc(
                    source=Source(
                        kind="url", location=url,
                        bytes=len(resp.content), succeeded=True,
                    ),
                    content_type=resp.headers.get("content-type", "text/html"),
                    raw_bytes=resp.content,
                )
            except (httpx.HTTPError, httpx.RequestError) as e:
                last_err = e
                if attempt < 2:
                    await asyncio.sleep(2 ** attempt)
    return FetchedDoc(
        source=Source(
            kind="url", location=url,
            succeeded=False, error=f"{type(last_err).__name__}: {last_err}",
        ),
    )
