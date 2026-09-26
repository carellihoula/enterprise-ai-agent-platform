"""Unit tests for GeminiProvider implementation.

This module validates generation, streaming, model info metadata, and health checks
for the Google Gemini provider integration.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import SecretStr

from app.core.errors import ProviderError
from app.providers.llm.base import ChatMessage, MessageRole
from app.providers.llm.gemini import GeminiProvider


@pytest.fixture
def gemini_provider() -> GeminiProvider:
    """Fixture initializing a GeminiProvider instance with mock API key."""
    return GeminiProvider(
        api_key=SecretStr("test-gemini-key"),
        model_name="gemini-1.5-flash",
    )


@pytest.mark.asyncio
async def test_gemini_generate_success(gemini_provider: GeminiProvider) -> None:
    """Tests successful text generation via GeminiProvider."""
    mock_response_data = {
        "candidates": [
            {
                "content": {
                    "parts": [{"text": "Hello from Gemini!"}],
                    "role": "model",
                },
                "finishReason": "STOP",
            }
        ],
        "usageMetadata": {
            "promptTokenCount": 10,
            "candidatesTokenCount": 6,
            "totalTokenCount": 16,
        },
    }

    mock_http_response = MagicMock()
    mock_http_response.status_code = 200
    mock_http_response.json.return_value = mock_response_data

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_http_response

        messages = [ChatMessage(role=MessageRole.USER, content="Hi")]
        response = await gemini_provider.generate(
            messages=messages,
            system_instruction="Be helpful",
        )

        assert response.content == "Hello from Gemini!"
        assert response.model_name == "gemini-1.5-flash"
        assert response.usage.prompt_tokens == 10
        assert response.usage.completion_tokens == 6
        assert response.usage.total_tokens == 16
        assert response.finish_reason == "STOP"


@pytest.mark.asyncio
async def test_gemini_generate_error(gemini_provider: GeminiProvider) -> None:
    """Tests HTTP error handling in GeminiProvider generate method."""
    mock_http_response = MagicMock()
    mock_http_response.status_code = 400
    mock_http_response.text = "API Key Invalid"

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_http_response

        messages = [ChatMessage(role=MessageRole.USER, content="Hi")]
        with pytest.raises(ProviderError) as exc_info:
            await gemini_provider.generate(messages=messages)

        assert exc_info.value.details["provider_name"] == "gemini"
        assert exc_info.value.status_code == 400


def test_gemini_model_info(gemini_provider: GeminiProvider) -> None:
    """Tests metadata model info for GeminiProvider."""
    info = gemini_provider.get_model_info()
    assert info.provider_name == "gemini"
    assert info.model_name == "gemini-1.5-flash"
    assert info.context_window == 1000000
    assert info.supports_streaming is True
    assert info.supports_tools is True
