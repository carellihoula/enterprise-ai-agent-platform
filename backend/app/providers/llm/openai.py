"""OpenAI concrete ModelProvider implementation for the platform.

This module provides the OpenAI model provider integration supporting chat completions,
token streaming via Server-Sent Events (SSE), model specifications, and health checks.
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


class OpenAIProvider(ModelProvider):
    """Concrete ModelProvider implementation connecting to OpenAI-compatible endpoints.

    Attributes:
        api_key (SecretStr): API key secret for authentication.
        model_name (str): Identifier of the target OpenAI model (e.g., gpt-4o, gpt-4o-mini).
        base_url (str): Base HTTP URL for the OpenAI API endpoint.
        timeout (float): Request timeout limit in seconds.
    """

    def __init__(
        self,
        api_key: SecretStr | None = None,
        model_name: str = "gpt-4o",
        base_url: str = "https://api.openai.com/v1",
        timeout: float = 30.0,
    ) -> None:
        self.api_key = api_key or SecretStr("mock-api-key")
        self.model_name = model_name
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def _build_headers(self) -> dict[str, str]:
        """Builds HTTP headers for API authentication and content type.

        Returns:
            dict[str, str]: Dictionary of HTTP request headers.
        """
        # [Security] Pass bearer token safely from SecretStr
        return {
            "Authorization": f"Bearer {self.api_key.get_secret_value()}",
            "Content-Type": "application/json",
        }

    def _format_messages(
        self, messages: list[ChatMessage], system_instruction: str | None = None
    ) -> list[dict[str, Any]]:
        """Formats ChatMessage domain objects into OpenAI API message payloads.

        Args:
            messages (list[ChatMessage]): List of conversation history messages.
            system_instruction (str | None, optional): Optional system instruction prompt.

        Returns:
            list[dict[str, Any]]: List of dictionary message payloads for the API.
        """
        formatted: list[dict[str, Any]] = []

        # [Instruction] Inject system prompt at start of conversation payload if provided
        if system_instruction:
            formatted.append({"role": MessageRole.SYSTEM.value, "content": system_instruction})

        for msg in messages:
            payload: dict[str, Any] = {"role": msg.role.value, "content": msg.content}
            if msg.name:
                payload["name"] = msg.name
            formatted.append(payload)

        return formatted

    async def generate(
        self,
        messages: list[ChatMessage],
        temperature: float = 0.7,
        max_tokens: int | None = None,
        system_instruction: str | None = None,
        **kwargs: Any,
    ) -> ModelResponse:
        """Generates a complete textual completion response from OpenAI.

        Args:
            messages (list[ChatMessage]): List of conversation history messages.
            temperature (float, optional): Sampling temperature. Defaults to 0.7.
            max_tokens (int | None, optional): Max tokens parameter. Defaults to None.
            system_instruction (str | None, optional): System prompt. Defaults to None.
            **kwargs (Any): Additional OpenAI completion options.

        Returns:
            ModelResponse: Standardized model response payload.

        Raises:
            ProviderError: If the HTTP request fails or returns an API error.
        """
        payload: dict[str, Any] = {
            "model": self.model_name,
            "messages": self._format_messages(messages, system_instruction),
            "temperature": temperature,
            "stream": False,
        }
        if max_tokens:
            payload["max_tokens"] = max_tokens

        url = f"{self.base_url}/chat/completions"

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                # [Network] Dispatch POST request to OpenAI completions endpoint
                response = await client.post(url, headers=self._build_headers(), json=payload)

            if response.status_code != 200:
                raise ProviderError(
                    message=f"OpenAI API error ({response.status_code}): {response.text}",
                    provider_name="openai",
                    status_code=response.status_code,
                )

            data = response.json()
            choice = data["choices"][0]
            content = choice["message"]["content"] or ""
            finish_reason = choice.get("finish_reason", "stop")

            raw_usage = data.get("usage", {})
            usage = TokenUsage(
                prompt_tokens=raw_usage.get("prompt_tokens", 0),
                completion_tokens=raw_usage.get("completion_tokens", 0),
                total_tokens=raw_usage.get("total_tokens", 0),
            )

            return ModelResponse(
                content=content,
                model_name=self.model_name,
                usage=usage,
                finish_reason=finish_reason,
                raw_response=data,
            )
        except httpx.HTTPError as exc:
            # [Resilience] Wrap HTTP network errors in domain ProviderError
            raise ProviderError(
                message=f"OpenAI connection error: {exc}",
                provider_name="openai",
            ) from exc

    async def stream(
        self,
        messages: list[ChatMessage],
        temperature: float = 0.7,
        max_tokens: int | None = None,
        system_instruction: str | None = None,
        **kwargs: Any,
    ) -> AsyncGenerator[ModelResponseChunk, None]:
        """Streams real-time delta response chunks from OpenAI via SSE.

        Args:
            messages (list[ChatMessage]): List of conversation history messages.
            temperature (float, optional): Sampling temperature. Defaults to 0.7.
            max_tokens (int | None, optional): Max completion tokens. Defaults to None.
            system_instruction (str | None, optional): System prompt. Defaults to None.
            **kwargs (Any): Additional completion parameters.

        Yields:
            ModelResponseChunk: Delta response chunk payload.

        Raises:
            ProviderError: If the SSE stream fails or breaks unexpectedly.
        """
        payload: dict[str, Any] = {
            "model": self.model_name,
            "messages": self._format_messages(messages, system_instruction),
            "temperature": temperature,
            "stream": True,
        }
        if max_tokens:
            payload["max_tokens"] = max_tokens

        url = f"{self.base_url}/chat/completions"

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                async with client.stream(
                    "POST", url, headers=self._build_headers(), json=payload
                ) as response:
                    if response.status_code != 200:
                        error_body = await response.aread()
                        raise ProviderError(
                            message=f"OpenAI streaming error ({response.status_code}): {error_body.decode('utf-8')}",
                            provider_name="openai",
                            status_code=response.status_code,
                        )

                    async for line in response.aiter_lines():
                        line = line.strip()
                        if not line or line.startswith(":"):
                            continue
                        if line.startswith("data: "):
                            data_str = line[6:]
                            if data_str == "[DONE]":
                                break
                            try:
                                chunk_json = json.loads(data_str)
                                choice = chunk_json["choices"][0]
                                delta = choice.get("delta", {})
                                content_delta = delta.get("content", "")
                                finish_reason = choice.get("finish_reason")
                                if content_delta or finish_reason:
                                    yield ModelResponseChunk(
                                        delta_content=content_delta,
                                        finish_reason=finish_reason,
                                    )
                            except json.JSONDecodeError:
                                continue
        except httpx.HTTPError as exc:
            # [Resilience] Wrap streaming network failures in ProviderError
            raise ProviderError(
                message=f"OpenAI streaming connection error: {exc}",
                provider_name="openai",
            ) from exc

    def get_model_info(self) -> ModelInfo:
        """Returns specification and capabilities for the configured OpenAI model.

        Returns:
            ModelInfo: Model info metadata object.
        """
        return ModelInfo(
            provider_name="openai",
            model_name=self.model_name,
            context_window=128000,
            max_output_tokens=4096,
            supports_streaming=True,
            supports_tools=True,
        )

    async def health(self) -> ProviderHealth:
        """Measures ping latency and health status against OpenAI endpoint.

        Returns:
            ProviderHealth: Provider health status measurement.
        """
        start_time = time.perf_counter()
        try:
            # [Ping] Use lightweight models endpoint to verify connectivity
            url = f"{self.base_url}/models/{self.model_name}"
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(url, headers=self._build_headers())

            latency = (time.perf_counter() - start_time) * 1000.0
            is_healthy = response.status_code in (
                200,
                401,
            )  # 401 indicates endpoint is up but auth failed
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
