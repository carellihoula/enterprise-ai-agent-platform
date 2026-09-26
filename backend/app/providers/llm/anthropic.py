"""Anthropic Claude concrete ModelProvider implementation for the platform.

This module provides the Anthropic model provider integration supporting Claude models
(e.g., claude-3-5-sonnet, claude-3-opus, claude-3-haiku), text generation, SSE token streaming,
model info specs, and health check capabilities.
"""

import json
import time
from collections.abc import AsyncGenerator
from typing import Any

import httpx
from pydantic import SecretStr

from app.core.errors import ProviderError
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


class AnthropicProvider(ModelProvider):
    """Concrete ModelProvider implementation connecting to Anthropic Messages API.

    Attributes:
        api_key (SecretStr): Anthropic API key secret for authentication.
        model_name (str): Identifier of the target Claude model (e.g., claude-3-5-sonnet-20240620).
        base_url (str): Base HTTP URL for the Anthropic API endpoint.
        anthropic_version (str): API version header value required by Anthropic.
        timeout (float): Request timeout limit in seconds.
    """

    def __init__(
        self,
        api_key: SecretStr | None = None,
        model_name: str = "claude-3-5-sonnet-20240620",
        base_url: str = "https://api.anthropic.com/v1",
        anthropic_version: str = "2023-06-01",
        timeout: float = 30.0,
    ) -> None:
        self.api_key = api_key or SecretStr("mock-api-key")
        self.model_name = model_name
        self.base_url = base_url.rstrip("/")
        self.anthropic_version = anthropic_version
        self.timeout = timeout

    def _build_headers(self) -> dict[str, str]:
        """Builds HTTP headers for Anthropic API authentication.

        Returns:
            dict[str, str]: Dictionary of HTTP request headers.
        """
        # [Security] Pass x-api-key safely from SecretStr
        return {
            "x-api-key": self.api_key.get_secret_value(),
            "anthropic-version": self.anthropic_version,
            "content-type": "application/json",
        }

    def _format_messages(self, messages: list[ChatMessage]) -> list[dict[str, Any]]:
        """Formats ChatMessage domain objects into Anthropic API message payloads.

        Note: Anthropic API separates system instructions from the messages list.
        System messages in history are omitted here and should be passed via system parameter.

        Args:
            messages (list[ChatMessage]): List of conversation history messages.

        Returns:
            list[dict[str, Any]]: List of dictionary message payloads for Anthropic API.
        """
        formatted: list[dict[str, Any]] = []
        for msg in messages:
            # Anthropic expects role to be either 'user' or 'assistant'
            if msg.role == MessageRole.SYSTEM:
                continue
            role_str = "user" if msg.role == MessageRole.USER else "assistant"
            formatted.append({"role": role_str, "content": msg.content})

        return formatted

    async def generate(
        self,
        messages: list[ChatMessage],
        temperature: float = 0.7,
        max_tokens: int | None = None,
        system_instruction: str | None = None,
        **kwargs: Any,
    ) -> ModelResponse:
        """Generates a complete textual completion response from Anthropic Claude.

        Args:
            messages (list[ChatMessage]): List of conversation history messages.
            temperature (float, optional): Sampling temperature. Defaults to 0.7.
            max_tokens (int | None, optional): Max tokens limit. Defaults to 1024.
            system_instruction (str | None, optional): System prompt. Defaults to None.
            **kwargs (Any): Additional Anthropic completion options.

        Returns:
            ModelResponse: Standardized model response payload.

        Raises:
            ProviderError: If the HTTP request fails or returns an API error.
        """
        payload: dict[str, Any] = {
            "model": self.model_name,
            "messages": self._format_messages(messages),
            "max_tokens": max_tokens or 1024,
            "temperature": temperature,
        }
        if system_instruction:
            payload["system"] = system_instruction

        url = f"{self.base_url}/messages"

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                # [Network] Dispatch POST request to Anthropic messages endpoint
                response = await client.post(url, headers=self._build_headers(), json=payload)

            if response.status_code != 200:
                raise ProviderError(
                    message=f"Anthropic API error ({response.status_code}): {response.text}",
                    provider_name="anthropic",
                    status_code=response.status_code,
                )

            data = response.json()
            content_blocks = data.get("content", [])
            text_content = "".join(
                [block.get("text", "") for block in content_blocks if block.get("type") == "text"]
            )
            stop_reason = data.get("stop_reason", "end_turn")

            raw_usage = data.get("usage", {})
            usage = TokenUsage(
                prompt_tokens=raw_usage.get("input_tokens", 0),
                completion_tokens=raw_usage.get("output_tokens", 0),
                total_tokens=raw_usage.get("input_tokens", 0) + raw_usage.get("output_tokens", 0),
            )

            return ModelResponse(
                content=text_content,
                model_name=self.model_name,
                usage=usage,
                finish_reason=stop_reason,
                raw_response=data,
            )
        except httpx.HTTPError as exc:
            # [Resilience] Wrap HTTP network errors in domain ProviderError
            raise ProviderError(
                message=f"Anthropic connection error: {exc}",
                provider_name="anthropic",
            ) from exc

    async def stream(
        self,
        messages: list[ChatMessage],
        temperature: float = 0.7,
        max_tokens: int | None = None,
        system_instruction: str | None = None,
        **kwargs: Any,
    ) -> AsyncGenerator[ModelResponseChunk, None]:
        """Streams real-time delta response chunks from Anthropic Claude via SSE.

        Args:
            messages (list[ChatMessage]): List of conversation history messages.
            temperature (float, optional): Sampling temperature. Defaults to 0.7.
            max_tokens (int | None, optional): Max completion tokens. Defaults to 1024.
            system_instruction (str | None, optional): System prompt. Defaults to None.
            **kwargs (Any): Additional completion parameters.

        Yields:
            ModelResponseChunk: Delta response chunk payload.

        Raises:
            ProviderError: If the SSE stream fails or breaks unexpectedly.
        """
        payload: dict[str, Any] = {
            "model": self.model_name,
            "messages": self._format_messages(messages),
            "max_tokens": max_tokens or 1024,
            "temperature": temperature,
            "stream": True,
        }
        if system_instruction:
            payload["system"] = system_instruction

        url = f"{self.base_url}/messages"

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                async with client.stream(
                    "POST", url, headers=self._build_headers(), json=payload
                ) as response:
                    if response.status_code != 200:
                        error_body = await response.aread()
                        raise ProviderError(
                            message=f"Anthropic streaming error ({response.status_code}): {error_body.decode('utf-8')}",
                            provider_name="anthropic",
                            status_code=response.status_code,
                        )

                    async for line in response.aiter_lines():
                        line = line.strip()
                        if not line or line.startswith(":"):
                            continue
                        if line.startswith("data: "):
                            data_str = line[6:]
                            try:
                                chunk_json = json.loads(data_str)
                                event_type = chunk_json.get("type")

                                if event_type == "content_block_delta":
                                    delta = chunk_json.get("delta", {})
                                    content_text = delta.get("text", "")
                                    if content_text:
                                        yield ModelResponseChunk(delta_content=content_text)
                                elif event_type == "message_delta":
                                    delta = chunk_json.get("delta", {})
                                    stop_reason = delta.get("stop_reason")
                                    if stop_reason:
                                        yield ModelResponseChunk(
                                            delta_content="", finish_reason=stop_reason
                                        )
                            except json.JSONDecodeError:
                                continue
        except httpx.HTTPError as exc:
            # [Resilience] Wrap streaming network failures in ProviderError
            raise ProviderError(
                message=f"Anthropic streaming connection error: {exc}",
                provider_name="anthropic",
            ) from exc

    def get_model_info(self) -> ModelInfo:
        """Returns specification and capabilities for the configured Anthropic Claude model.

        Returns:
            ModelInfo: Model info metadata object.
        """
        return ModelInfo(
            provider_name="anthropic",
            model_name=self.model_name,
            context_window=200000,
            max_output_tokens=4096,
            supports_streaming=True,
            supports_tools=True,
        )

    async def health(self) -> ProviderHealth:
        """Measures ping latency and health status against Anthropic endpoint.

        Returns:
            ProviderHealth: Provider health status measurement.
        """
        start_time = time.perf_counter()
        try:
            # [Ping] Send dummy request to check endpoint accessibility
            url = f"{self.base_url}/messages"
            payload = {
                "model": self.model_name,
                "messages": [{"role": "user", "content": "ping"}],
                "max_tokens": 1,
            }
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.post(url, headers=self._build_headers(), json=payload)

            latency = (time.perf_counter() - start_time) * 1000.0
            is_healthy = response.status_code in (200, 401)
            return ProviderHealth(
                is_healthy=is_healthy,
                latency_ms=round(latency, 2),
                details={"status_code": response.status_code},
            )
        except Exception as exc:
            latency = (time.perf_counter() - start_time) * 1000.0
            return ProviderHealth(
                is_healthy=False,
                latency_ms=round(latency, 2),
                details={"error": str(exc)},
            )
