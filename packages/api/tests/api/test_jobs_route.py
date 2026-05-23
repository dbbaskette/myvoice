"""Tests for GET/DELETE /api/jobs/{id} and GET /api/jobs/{id}/events SSE."""
from __future__ import annotations

from pathlib import Path
from typing import cast

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from myvoice.jobs.models import JobType


@pytest.mark.asyncio
async def test_get_job_404(client_with_config: tuple[TestClient, Path]) -> None:
    client, _ = client_with_config
    r = client.get("/api/jobs/does-not-exist")
    assert r.status_code == 404
    body = r.json()
    assert body["detail"]["error"]["code"] == "job_not_found"


@pytest.mark.asyncio
async def test_get_job_returns_state(client_with_config: tuple[TestClient, Path]) -> None:
    client, _ = client_with_config
    reg = cast(FastAPI, client.app).state.job_registry
    job = await reg.create(JobType.REWRITE)
    r = client.get(f"/api/jobs/{job.id}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == job.id
    assert body["status"] == "pending"
    assert body["type"] == "rewrite"


@pytest.mark.asyncio
async def test_delete_job_404_for_unknown(client_with_config: tuple[TestClient, Path]) -> None:
    client, _ = client_with_config
    r = client.delete("/api/jobs/nonexistent")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_delete_job_cancels(client_with_config: tuple[TestClient, Path]) -> None:
    client, _ = client_with_config
    reg = cast(FastAPI, client.app).state.job_registry
    job = await reg.create(JobType.REWRITE)
    r = client.delete(f"/api/jobs/{job.id}")
    assert r.status_code == 204
    refreshed = await reg.get(job.id)
    assert refreshed is not None
    assert refreshed.status == "cancelled"


@pytest.mark.asyncio
async def test_replay_emits_complete_for_finished_job(
    client_with_config: tuple[TestClient, Path],
) -> None:
    """SSE stream for a completed job should replay stage + token + complete then close."""
    client, _ = client_with_config
    reg = cast(FastAPI, client.app).state.job_registry
    job = await reg.create(JobType.REWRITE)
    await reg.append_token(job.id, "hello")
    await reg.complete(job.id, {"output": "hello"})

    with client.stream("GET", f"/api/jobs/{job.id}/events") as resp:
        assert resp.status_code == 200
        body = b"".join(resp.iter_bytes())

    text = body.decode()
    assert '"type":"stage"' in text
    assert '"type":"token"' in text
    assert '"delta":"hello"' in text
    assert '"type":"complete"' in text


@pytest.mark.asyncio
async def test_replay_emits_error_for_failed_job(
    client_with_config: tuple[TestClient, Path],
) -> None:
    """SSE stream for a failed job should replay stage + error then close."""
    client, _ = client_with_config
    reg = cast(FastAPI, client.app).state.job_registry
    job = await reg.create(JobType.REWRITE)
    await reg.fail(job.id, "provider_error", "Something went wrong")

    with client.stream("GET", f"/api/jobs/{job.id}/events") as resp:
        assert resp.status_code == 200
        body = b"".join(resp.iter_bytes())

    text = body.decode()
    assert '"type":"stage"' in text
    assert '"type":"error"' in text
    assert "provider_error" in text


@pytest.mark.asyncio
async def test_replay_emits_cancelled_for_cancelled_job(
    client_with_config: tuple[TestClient, Path],
) -> None:
    """SSE stream for a cancelled job should replay stage + error(cancelled) then close."""
    client, _ = client_with_config
    reg = cast(FastAPI, client.app).state.job_registry
    job = await reg.create(JobType.REWRITE)
    await reg.cancel(job.id)

    with client.stream("GET", f"/api/jobs/{job.id}/events") as resp:
        assert resp.status_code == 200
        body = b"".join(resp.iter_bytes())

    text = body.decode()
    assert '"type":"error"' in text
    assert '"cancelled"' in text


@pytest.mark.asyncio
async def test_events_404_for_unknown_job(client_with_config: tuple[TestClient, Path]) -> None:
    client, _ = client_with_config
    r = client.get("/api/jobs/no-such-job/events")
    assert r.status_code == 404
