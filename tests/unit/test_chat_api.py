"""Unit tests for the Chat API routes (/chat and /chat/stream).

This module tests synchronous generate_chat and SSE streaming stream_chat
endpoints via the FastAPI TestClient.
"""

from collections.abc import AsyncGenerator
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import status
from fastapi.testclient import TestClient

from app.providers.llm.base import ModelResponse, ModelResponseChunk, TokenUsage


@pytest.mark.unit
@pytest.mark.asyncio
@patch("app.api.v1.chat.ProviderAdapterRegistry.get_provider")
async def test_generate_chat_endpoint(mock_get_provider: AsyncMock, api_client: TestClient) -> None:
    """Tests POST /api/v1/chat synchronous completion endpoint.

    Args:
        mock_get_provider (AsyncMock): Mocked get_provider method on ProviderAdapterRegistry.
        api_client (TestClient): TestClient fixture instance.
    """
    mock_provider = AsyncMock()
    mock_provider.generate.return_value = ModelResponse(
        content="Hello from API!",
        model_name="gpt-4o",
        usage=TokenUsage(prompt_tokens=5, completion_tokens=8, total_tokens=13),
    )
    mock_get_provider.return_value = mock_provider

    payload = {
        "messages": [{"role": "user", "content": "Hello"}],
        "provider_name": "openai",
        "model_name": "gpt-4o",
        "temperature": 0.5,
    }

    response = api_client.post("/api/v1/chat", json=payload)
    assert response.status_code == status.HTTP_200_OK

    data = response.json()
    assert data["content"] == "Hello from API!"
    assert data["provider_name"] == "openai"
    assert data["model_name"] == "gpt-4o"
    assert data["usage"]["total_tokens"] == 13


@pytest.mark.unit
@pytest.mark.asyncio
@patch("app.api.v1.chat.ProviderAdapterRegistry.get_provider")
async def test_stream_chat_endpoint(mock_get_provider: AsyncMock, api_client: TestClient) -> None:
    """Tests POST /api/v1/chat/stream SSE streaming endpoint.

    Args:
        mock_stream (AsyncMock): Mocked stream method on OpenAIProvider.
        api_client (TestClient): TestClient fixture instance.
    """

    async def mock_chunks(*args: Any, **kwargs: Any) -> AsyncGenerator[ModelResponseChunk, None]:
        yield ModelResponseChunk(delta_content="Hello ")
        yield ModelResponseChunk(delta_content="World!", finish_reason="stop")

    mock_provider = MagicMock()
    mock_provider.stream.side_effect = mock_chunks
    mock_get_provider.return_value = mock_provider

    payload = {
        "messages": [{"role": "user", "content": "Stream me"}],
        "provider_name": "openai",
        "model_name": "gpt-4o",
    }

    response = api_client.post("/api/v1/chat/stream", json=payload)
    assert response.status_code == status.HTTP_200_OK
    assert "text/event-stream" in response.headers["content-type"]

    content = response.text
    assert "Hello " in content
    assert "World!" in content
    assert "[DONE]" in content
