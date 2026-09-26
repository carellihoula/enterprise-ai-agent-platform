"""Unit tests for platform error handling hierarchy and exception responses.

This module tests domain error instantiation, status codes, retryable flags,
and FastAPI exception handler responses.
"""

import pytest
from fastapi import status
from fastapi.testclient import TestClient

from app.core.errors import DomainError, ProviderError, ToolError


@pytest.mark.unit
def test_domain_error_attributes() -> None:
    """Tests domain error attributes and status code assignments."""
    error = DomainError(message="Invalid agent spec", error_code="INVALID_SPEC")
    assert error.message == "Invalid agent spec"
    assert error.error_code == "INVALID_SPEC"
    assert error.status_code == status.HTTP_400_BAD_REQUEST
    assert error.retryable is False


@pytest.mark.unit
def test_provider_error_attributes() -> None:
    """Tests provider error attributes and default retryable status."""
    error = ProviderError(
        message="Gemini API rate limit exceeded",
        provider_name="gemini",
        error_code="RATE_LIMIT",
    )
    assert error.message == "Gemini API rate limit exceeded"
    assert error.details["provider_name"] == "gemini"
    assert error.status_code == status.HTTP_502_BAD_GATEWAY
    assert error.retryable is True


@pytest.mark.unit
def test_tool_error_attributes() -> None:
    """Tests tool error attributes and default unprocessable entity status."""
    error = ToolError(
        message="HTTP tool failed with status 500",
        tool_name="http_request",
    )
    assert error.message == "HTTP tool failed with status 500"
    assert error.details["tool_name"] == "http_request"
    assert error.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert error.retryable is False


@pytest.mark.unit
def test_health_check_endpoint(api_client: TestClient) -> None:
    """Tests health check API endpoint response.

    Args:
        api_client (TestClient): TestClient fixture instance.
    """
    response = api_client.get("/health")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["status"] == "healthy"
    assert "app_name" in data
