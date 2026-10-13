"""Unit tests for LangChainModelProvider and ProviderAdapterRegistry.

This module tests dynamic ModelConfig instantiation, ProviderAdapterRegistry routing,
and LangChain generation and streaming fallback mechanisms.
"""

import pytest

from app.providers.llm.base import ChatMessage, MessageRole, ModelConfig
from app.providers.llm.langchain_provider import LangChainModelProvider, ProviderAdapterRegistry


@pytest.mark.unit
def test_provider_adapter_registry_get_provider() -> None:
    """Tests ProviderAdapterRegistry retrieves LangChainModelProvider for any configuration."""
    config = ModelConfig(
        provider_id="openai",
        model_name="gpt-4o",
        temperature=0.5,
    )
    provider = ProviderAdapterRegistry.get_provider(config)
    assert isinstance(provider, LangChainModelProvider)
    assert provider.config.model_name == "gpt-4o"
    assert provider.config.provider_id == "openai"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_langchain_provider_mock_generate() -> None:
    """Tests LangChainModelProvider handles mock keys with simulated response."""
    config = ModelConfig(
        provider_id="mock",
        model_name="gpt-4o",
        api_key="mock-api-key",
    )
    provider = LangChainModelProvider(config)
    messages = [ChatMessage(role=MessageRole.USER, content="Hello")]

    response = await provider.generate(messages)
    assert response.model_name == "gpt-4o"
    assert "Simulated response" in response.content


@pytest.mark.unit
@pytest.mark.asyncio
async def test_langchain_provider_mock_stream() -> None:
    """Tests LangChainModelProvider handles mock keys with simulated stream chunks."""
    config = ModelConfig(
        provider_id="mock",
        model_name="gpt-4o",
        api_key="mock-api-key",
    )
    provider = LangChainModelProvider(config)
    messages = [ChatMessage(role=MessageRole.USER, content="Stream test")]

    chunks = []
    async for chunk in provider.stream(messages):
        chunks.append(chunk.delta_content)

    full_text = "".join(chunks)
    assert "Simulated response" in full_text


@pytest.mark.unit
def test_extract_text_content_blocks() -> None:
    """Tests that _extract_text_content extracts pure text from Google GenAI list chunks and raw blocks."""
    # [Extraction] Test list of dictionary blocks from Google GenAI
    list_chunk = [
        {"type": "text", "text": "Hello!", "index": 0},
        {"type": "text", "text": " How can I help you today?", "index": 0},
        {"type": "text", "text": "", "extras": {"signature": "abc123xyz"}, "index": 0},
    ]
    extracted = LangChainModelProvider._extract_text_content(list_chunk)
    assert extracted == "Hello! How can I help you today?"

    # [Extraction] Test empty list payload
    assert LangChainModelProvider._extract_text_content([]) == ""

    # [Sanitization] Test stringified serialized blocks from stored history
    serialized_str = (
        "[{'type': 'text', 'text': 'Hello!', 'index': 0}]"
        "[{'type': 'text', 'text': ' How can I help you today?', 'index': 0}]"
        "[{'type': 'text', 'text': '', 'extras': {'signature': 'abc123xyz'}, 'index': 0}][]"
    )
    cleaned = LangChainModelProvider._extract_text_content(serialized_str)
    assert cleaned == "Hello! How can I help you today?"

    # [Preservation] Test standard string input is preserved intact
    normal_str = "Standard plain text string"
    assert LangChainModelProvider._extract_text_content(normal_str) == normal_str
