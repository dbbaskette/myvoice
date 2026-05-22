"""Shared pytest fixtures."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from myvoice.server import create_app


@pytest.fixture
def client() -> Iterator[TestClient]:
    """A FastAPI TestClient bound to a fresh app instance."""
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client
