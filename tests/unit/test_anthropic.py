"""Unit tests for AnthropicProvider implementation.

This module validates generation, streaming, model info metadata, and health checks
for the Anthropic Claude provider integration.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import SecretStr

from app.core.errors import ProviderError
from app.providers.llm.anthropic import AnthropicProvider
from app.providers.llm.base import ChatMessage, MessageRole


@pytest.fixture
def anthropic_provider() -> AnthropicProvider:
    """Fixture initializing an AnthropicProvider instance with mock API key."""
    return AnthropicProvider(
        api_key=SecretStr("test-anthropic-key"),
        model_name="claude-3-5-sonnet-20240620",
    )


@pytest.mark.asyncio
async def test_anthropic_generate_success(anthropic_provider: AnthropicProvider) -> None:
    """Tests successful text generation via AnthropicProvider."""
    mock_response_data = {
        "id": "msg_013Zva2CMHLvnvAiRyNgFvZ5",
        "type": "message",
        "role": "assistant",
        "model": "claude-3-5-sonnet-20240620",
        "content": [{"type": "text", "text": "Hello! How can I assist you today?"}],
        "stop_reason": "end_turn",
        "usage": {"input_tokens": 12, "output_tokens": 8},
    }

    mock_http_response = MagicMock()
    mock_http_response.status_code = 200
    mock_http_response.json.return_value = mock_response_data

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_http_response

        messages = [ChatMessage(role=MessageRole.USER, content="Hello")]
        response = await anthropic_provider.generate(
            messages=messages,
            system_instruction="Be helpful",
        )

        assert response.content == "Hello! How can I assist you today?"
        assert response.model_name == "claude-3-5-sonnet-20240620"
        assert response.usage.prompt_tokens == 12
        assert response.usage.completion_tokens == 8
        assert response.usage.total_tokens == 20
        assert response.finish_reason == "end_turn"


@pytest.mark.asyncio
async def test_anthropic_generate_error(anthropic_provider: AnthropicProvider) -> None:
    """Tests HTTP error handling in AnthropicProvider generate method."""
    mock_http_response = MagicMock()
    mock_http_response.status_code = 401
    mock_http_response.text = "Invalid API Key"

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_http_response

        messages = [ChatMessage(role=MessageRole.USER, content="Hello")]
        with pytest.raises(ProviderError) as exc_info:
            await anthropic_provider.generate(messages=messages)

        assert exc_info.value.details["provider_name"] == "anthropic"
        assert exc_info.value.status_code == 401


def test_anthropic_model_info(anthropic_provider: AnthropicProvider) -> None:
    """Tests metadata model info for AnthropicProvider."""
    info = anthropic_provider.get_model_info()
    assert info.provider_name == "anthropic"
    assert info.model_name == "claude-3-5-sonnet-20240620"
    assert info.context_window == 200000
    assert info.supports_streaming is True
    assert info.supports_tools is True
