"""Unit tests for the ModelProvider abstract interface and Pydantic schemas.

This module tests the instantiation of ChatMessage, ModelResponse, TokenUsage,
ModelInfo, ProviderHealth, and a concrete MockModelProvider implementation.
"""

from collections.abc import AsyncGenerator
from typing import Any

import pytest

from app.providers.llm.base import (
    ChatMessage,
    MessageRole,
    ModelInfo,
    ModelProvider,
    ModelResponse,
    ModelResponseChunk,
    ProviderHealth,
    TokenUsage,
)


class MockModelProvider(ModelProvider):
    """Concrete mock implementation of ModelProvider for testing purposes."""

    def __init__(
        self, provider_name: str = "mock_provider", model_name: str = "mock-model-v1"
    ) -> None:
        self.provider_name = provider_name
        self.model_name = model_name

    async def generate(
        self,
        messages: list[ChatMessage],
        temperature: float = 0.7,
        max_tokens: int | None = None,
        system_instruction: str | None = None,
        **kwargs: Any,
    ) -> ModelResponse:
        """Generates a mock response."""
        prompt_text = " ".join([m.content for m in messages])
        content = f"Mock response to: {prompt_text}"
        return ModelResponse(
            content=content,
            model_name=self.model_name,
            usage=TokenUsage(prompt_tokens=10, completion_tokens=15, total_tokens=25),
        )

    async def stream(
        self,
        messages: list[ChatMessage],
        temperature: float = 0.7,
        max_tokens: int | None = None,
        system_instruction: str | None = None,
        **kwargs: Any,
    ) -> AsyncGenerator[ModelResponseChunk, None]:
        """Streams mock response chunks."""
        chunks = ["Hello ", "from ", "mock ", "stream!"]
        for idx, chunk in enumerate(chunks):
            finish_reason = "stop" if idx == len(chunks) - 1 else None
            yield ModelResponseChunk(delta_content=chunk, finish_reason=finish_reason)

    def get_model_info(self) -> ModelInfo:
        """Returns mock model info."""
        return ModelInfo(
            provider_name=self.provider_name,
            model_name=self.model_name,
            context_window=128000,
            max_output_tokens=4096,
        )

    async def health(self) -> ProviderHealth:
        """Returns mock provider health."""
        return ProviderHealth(is_healthy=True, latency_ms=12.5, details={"status": "online"})


@pytest.mark.unit
def test_chat_message_schema() -> None:
    """Tests ChatMessage instantiation and role assignment."""
    msg = ChatMessage(role=MessageRole.USER, content="Hello World")
    assert msg.role == MessageRole.USER
    assert msg.content == "Hello World"
    assert msg.name is None


@pytest.mark.unit
def test_model_info_schema() -> None:
    """Tests ModelInfo default attributes and values."""
    info = ModelInfo(provider_name="openai", model_name="gpt-4o")
    assert info.provider_name == "openai"
    assert info.model_name == "gpt-4o"
    assert info.supports_streaming is True
    assert info.supports_tools is True


@pytest.mark.unit
@pytest.mark.asyncio
async def test_mock_model_provider_generate() -> None:
    """Tests MockModelProvider generate implementation."""
    provider = MockModelProvider()
    messages = [ChatMessage(role=MessageRole.USER, content="Test prompt")]
    response = await provider.generate(messages)

    assert response.content == "Mock response to: Test prompt"
    assert response.model_name == "mock-model-v1"
    assert response.usage.total_tokens == 25


@pytest.mark.unit
@pytest.mark.asyncio
async def test_mock_model_provider_stream() -> None:
    """Tests MockModelProvider stream implementation."""
    provider = MockModelProvider()
    messages = [ChatMessage(role=MessageRole.USER, content="Test prompt")]

    chunks: list[ModelResponseChunk] = []
    async for chunk in provider.stream(messages):
        chunks.append(chunk)

    full_text = "".join([c.delta_content for c in chunks])
    assert full_text == "Hello from mock stream!"
    assert chunks[-1].finish_reason == "stop"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_mock_model_provider_health() -> None:
    """Tests MockModelProvider health check implementation."""
    provider = MockModelProvider()
    health = await provider.health()
    assert health.is_healthy is True
    assert health.latency_ms == 12.5
