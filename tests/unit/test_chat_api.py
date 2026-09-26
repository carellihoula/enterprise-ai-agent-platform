"""Unit tests for the Chat API routes (/chat and /chat/stream).

This module tests synchronous generate_chat and SSE streaming stream_chat
endpoints via the FastAPI TestClient.
"""

from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import status
from fastapi.testclient import TestClient

from app.providers.llm.base import ModelResponse, ModelResponseChunk, TokenUsage


@pytest.mark.unit
@pytest.mark.asyncio
@patch("app.api.v1.chat.OpenAIProvider.generate")
async def test_generate_chat_endpoint(mock_generate: AsyncMock, api_client: TestClient) -> None:
    """Tests POST /api/v1/chat synchronous completion endpoint.

    Args:
        mock_generate (AsyncMock): Mocked generate method on OpenAIProvider.
        api_client (TestClient): TestClient fixture instance.
    """
    mock_generate.return_value = ModelResponse(
        content="Hello from API!",
        model_name="gpt-4o",
        usage=TokenUsage(prompt_tokens=5, completion_tokens=8, total_tokens=13),
    )

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
@patch("app.api.v1.chat.OpenAIProvider.stream")
async def test_stream_chat_endpoint(mock_stream: AsyncMock, api_client: TestClient) -> None:
    """Tests POST /api/v1/chat/stream SSE streaming endpoint.

    Args:
        mock_stream (AsyncMock): Mocked stream method on OpenAIProvider.
        api_client (TestClient): TestClient fixture instance.
    """

    async def mock_chunks() -> AsyncGenerator[ModelResponseChunk, None]:
        yield ModelResponseChunk(delta_content="Hello ")
        yield ModelResponseChunk(delta_content="World!", finish_reason="stop")

    mock_stream.return_value = mock_chunks()

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
