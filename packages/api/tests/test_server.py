"""Tests for the FastAPI server."""

from fastapi.testclient import TestClient

from myvoice import __version__


def test_health_endpoint_returns_ok(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": __version__}
