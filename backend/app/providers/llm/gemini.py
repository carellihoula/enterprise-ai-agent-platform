"""Google Gemini concrete ModelProvider implementation for the platform.

This module provides the Gemini model provider integration supporting Google Gemini models
(e.g., gemini-1.5-pro, gemini-1.5-flash, gemini-2.0-flash), text generation, SSE token streaming,
model specs, and health check capabilities.
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


class GeminiProvider(ModelProvider):
    """Concrete ModelProvider implementation connecting to Google Gemini REST API.

    Attributes:
        api_key (SecretStr): Google Gemini API key secret for authentication.
        model_name (str): Identifier of the target Gemini model (e.g., gemini-1.5-pro, gemini-1.5-flash).
        base_url (str): Base HTTP URL for Google Generative Language API endpoint.
        timeout (float): Request timeout limit in seconds.
    """

    def __init__(
        self,
        api_key: SecretStr | None = None,
        model_name: str = "gemini-1.5-pro",
        base_url: str = "https://generativelanguage.googleapis.com/v1beta",
        timeout: float = 30.0,
    ) -> None:
        self.api_key = api_key or SecretStr("mock-api-key")
        self.model_name = model_name
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def _format_messages(
        self, messages: list[ChatMessage], system_instruction: str | None = None
    ) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
        """Formats ChatMessage domain objects into Google Gemini API contents payload.

        Args:
            messages (list[ChatMessage]): List of conversation history messages.
            system_instruction (str | None, optional): System prompt text.

        Returns:
            tuple[dict[str, Any] | None, list[dict[str, Any]]]: Formatted system instruction payload and contents list.
        """
        system_payload: dict[str, Any] | None = None
        if system_instruction:
            system_payload = {"parts": [{"text": system_instruction}]}

        contents: list[dict[str, Any]] = []
        for msg in messages:
            if msg.role == MessageRole.SYSTEM:
                if not system_payload:
                    system_payload = {"parts": [{"text": msg.content}]}
                continue

            role_str = "user" if msg.role == MessageRole.USER else "model"
            contents.append(
                {
                    "role": role_str,
                    "parts": [{"text": msg.content}],
                }
            )

        return system_payload, contents

    async def generate(
        self,
        messages: list[ChatMessage],
        temperature: float = 0.7,
        max_tokens: int | None = None,
        system_instruction: str | None = None,
        **kwargs: Any,
    ) -> ModelResponse:
        """Generates a complete textual completion response from Google Gemini.

        Args:
            messages (list[ChatMessage]): List of conversation history messages.
            temperature (float, optional): Sampling temperature. Defaults to 0.7.
            max_tokens (int | None, optional): Max output tokens. Defaults to None.
            system_instruction (str | None, optional): System prompt. Defaults to None.
            **kwargs (Any): Additional Gemini parameters.

        Returns:
            ModelResponse: Standardized model response payload.

        Raises:
            ProviderError: If the HTTP request fails or returns an API error.
        """
        system_payload, contents = self._format_messages(messages, system_instruction)

        payload: dict[str, Any] = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
            },
        }
        if system_payload:
            payload["systemInstruction"] = system_payload
        if max_tokens:
            payload["generationConfig"]["maxOutputTokens"] = max_tokens

        url = f"{self.base_url}/models/{self.model_name}:generateContent?key={self.api_key.get_secret_value()}"

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(url, json=payload)

            if response.status_code != 200:
                raise ProviderError(
                    message=f"Gemini API error ({response.status_code}): {response.text}",
                    provider_name="gemini",
                    status_code=response.status_code,
                )

            data = response.json()
            candidates = data.get("candidates", [])
            text_content = ""
            finish_reason = "STOP"

            if candidates:
                candidate = candidates[0]
                finish_reason = candidate.get("finishReason", "STOP")
                parts = candidate.get("content", {}).get("parts", [])
                text_content = "".join([p.get("text", "") for p in parts])

            usage_meta = data.get("usageMetadata", {})
            usage = TokenUsage(
                prompt_tokens=usage_meta.get("promptTokenCount", 0),
                completion_tokens=usage_meta.get("candidatesTokenCount", 0),
                total_tokens=usage_meta.get("totalTokenCount", 0),
            )

            return ModelResponse(
                content=text_content,
                model_name=self.model_name,
                usage=usage,
                finish_reason=finish_reason,
                raw_response=data,
            )
        except httpx.HTTPError as exc:
            raise ProviderError(
                message=f"Gemini connection error: {exc}",
                provider_name="gemini",
            ) from exc

    async def stream(
        self,
        messages: list[ChatMessage],
        temperature: float = 0.7,
        max_tokens: int | None = None,
        system_instruction: str | None = None,
        **kwargs: Any,
    ) -> AsyncGenerator[ModelResponseChunk, None]:
        """Streams real-time delta response chunks from Google Gemini via SSE.

        Args:
            messages (list[ChatMessage]): List of conversation history messages.
            temperature (float, optional): Sampling temperature. Defaults to 0.7.
            max_tokens (int | None, optional): Max output tokens. Defaults to None.
            system_instruction (str | None, optional): System prompt. Defaults to None.
            **kwargs (Any): Additional completion parameters.

        Yields:
            ModelResponseChunk: Delta response chunk payload.

        Raises:
            ProviderError: If the SSE stream fails or breaks unexpectedly.
        """
        system_payload, contents = self._format_messages(messages, system_instruction)

        payload: dict[str, Any] = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
            },
        }
        if system_payload:
            payload["systemInstruction"] = system_payload
        if max_tokens:
            payload["generationConfig"]["maxOutputTokens"] = max_tokens

        url = f"{self.base_url}/models/{self.model_name}:streamGenerateContent?alt=sse&key={self.api_key.get_secret_value()}"

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                async with client.stream("POST", url, json=payload) as response:
                    if response.status_code != 200:
                        error_body = await response.aread()
                        raise ProviderError(
                            message=f"Gemini streaming error ({response.status_code}): {error_body.decode('utf-8')}",
                            provider_name="gemini",
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
                                candidates = chunk_json.get("candidates", [])
                                if candidates:
                                    candidate = candidates[0]
                                    finish_reason = candidate.get("finishReason")
                                    parts = candidate.get("content", {}).get("parts", [])
                                    delta_text = "".join([p.get("text", "") for p in parts])
                                    if delta_text or finish_reason:
                                        yield ModelResponseChunk(
                                            delta_content=delta_text,
                                            finish_reason=finish_reason,
                                        )
                            except json.JSONDecodeError:
                                continue
        except httpx.HTTPError as exc:
            raise ProviderError(
                message=f"Gemini streaming connection error: {exc}",
                provider_name="gemini",
            ) from exc

    def get_model_info(self) -> ModelInfo:
        """Returns specification and capabilities for the configured Google Gemini model.

        Returns:
            ModelInfo: Model info metadata object.
        """
        return ModelInfo(
            provider_name="gemini",
            model_name=self.model_name,
            context_window=1000000,
            max_output_tokens=8192,
            supports_streaming=True,
            supports_tools=True,
        )

    async def health(self) -> ProviderHealth:
        """Measures ping latency and health status against Gemini endpoint.

        Returns:
            ProviderHealth: Provider health status measurement.
        """
        start_time = time.perf_counter()
        try:
            url = f"{self.base_url}/models/{self.model_name}?key={self.api_key.get_secret_value()}"
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(url)

            latency = (time.perf_counter() - start_time) * 1000.0
            is_healthy = response.status_code in (200, 400, 401, 403)
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
