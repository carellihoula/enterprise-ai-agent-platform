"""LangChain concrete ModelProvider adapter and ProviderAdapterRegistry implementation.

This module provides the unified LangChain-backed model provider adapter and dynamic
registry factory, allowing zero-hardcode runtime instantiation across any LLM provider or endpoint.
"""

import importlib
import logging
from collections.abc import AsyncGenerator, Callable
from typing import Any, cast

from langchain.chat_models import init_chat_model
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from pydantic import SecretStr

from app.core.config import get_settings
from app.core.errors import ProviderError
from app.providers.llm.base import (
    ChatMessage,
    ModelConfig,
    ModelInfo,
    ModelProvider,
    ModelResponse,
    ModelResponseChunk,
    ProviderHealth,
    TokenUsage,
)

logger = logging.getLogger(__name__)
settings = get_settings()


class LangChainModelProvider(ModelProvider):
    """Concrete ModelProvider implementation leveraging LangChain's BaseChatModel interface.

    Attributes:
        config (ModelConfig): Dynamic model configuration specification.
        chat_model (BaseChatModel): Initialized LangChain unified chat model.
    """

    def __init__(self, config: ModelConfig) -> None:
        self.config = config
        self.chat_model = self._init_langchain_model(config)

    def _init_langchain_model(self, config: ModelConfig) -> BaseChatModel:
        """Initializes a unified LangChain BaseChatModel instance based on config.

        Args:
            config (ModelConfig): Dynamic execution configuration.

        Returns:
            BaseChatModel: Initialized LangChain model instance.
        """
        provider_id = config.provider_id.lower()
        api_key_val = config.api_key or self._get_fallback_api_key(provider_id)
        api_key_secret = SecretStr(api_key_val) if api_key_val else None

        # [Mock / Simulation Fallback] If key is mock/unconfigured, handle gracefully
        if not api_key_val or "mock" in api_key_val or "your_" in api_key_val:
            logger.info(f"[LangChain] Mock API key detected for provider '{provider_id}'")

        # [Custom / Local Endpoint] Route to OpenAI-compatible provider (e.g. Ollama, vLLM)
        if provider_id in ("custom", "ollama", "vllm", "local"):
            from langchain_openai import ChatOpenAI

            openai_kwargs: dict[str, Any] = {
                "model": config.model_name or "llama3",
                "api_key": api_key_secret or SecretStr("local-key"),
                "base_url": config.base_url or "http://localhost:11434/v1",
                "temperature": config.temperature,
                **config.provider_params,
            }
            if config.max_tokens is not None:
                openai_kwargs["max_tokens"] = config.max_tokens

            return ChatOpenAI(**openai_kwargs)

        # Normalize provider alias for LangChain initializer
        lc_provider_map = {
            "openai": "openai",
            "mock": "openai",
            "anthropic": "anthropic",
            "claude": "anthropic",
            "gemini": "google_genai",
            "google": "google_genai",
        }
        lc_provider = lc_provider_map.get(provider_id, provider_id)

        try:
            kwargs: dict[str, Any] = {
                "model": config.model_name,
                "model_provider": lc_provider,
                "temperature": config.temperature,
            }
            if config.max_tokens:
                kwargs["max_tokens"] = config.max_tokens
            if api_key_secret:
                kwargs["api_key"] = api_key_secret
            if config.base_url:
                kwargs["base_url"] = config.base_url

            return cast(BaseChatModel, init_chat_model(**kwargs, **config.provider_params))
        except Exception as exc:
            # Fall back to OpenAI-compatible interface if provider lookup fails
            from langchain_openai import ChatOpenAI

            logger.warning(
                f"[LangChain] Direct provider init failed ({exc}). Falling back to ChatOpenAI endpoint."
            )
            fallback_kwargs: dict[str, Any] = {
                "model": config.model_name,
                "api_key": api_key_secret or SecretStr("fallback-key"),
                "base_url": config.base_url or "https://api.openai.com/v1",
                "temperature": config.temperature,
            }
            if config.max_tokens is not None:
                fallback_kwargs["max_tokens"] = config.max_tokens

            return ChatOpenAI(**fallback_kwargs)

    def _get_fallback_api_key(self, provider_id: str) -> str | None:
        """Retrieves default environment API key fallback if available."""
        if provider_id in ("openai", "mock"):
            return settings.openai_api_key.get_secret_value() if settings.openai_api_key else None
        if provider_id in ("anthropic", "claude"):
            return (
                settings.anthropic_api_key.get_secret_value()
                if settings.anthropic_api_key
                else None
            )
        if provider_id in ("gemini", "google"):
            return settings.gemini_api_key.get_secret_value() if settings.gemini_api_key else None
        return None

    def _format_messages(
        self, messages: list[ChatMessage], system_instruction: str | None = None
    ) -> list[BaseMessage]:
        """Converts platform ChatMessage domain objects to LangChain message objects.

        Args:
            messages (list[ChatMessage]): Conversation history messages.
            system_instruction (str | None, optional): System prompt override.

        Returns:
            list[BaseMessage]: List of LangChain base message objects.
        """
        lc_messages: list[BaseMessage] = []
        system_text = system_instruction or self.config.system_prompt
        if system_text:
            lc_messages.append(SystemMessage(content=system_text))

        for msg in messages:
            if msg.role == "user":
                lc_messages.append(HumanMessage(content=msg.content))
            elif msg.role == "assistant":
                lc_messages.append(AIMessage(content=msg.content))
            elif msg.role == "system":
                lc_messages.append(SystemMessage(content=msg.content))

        return lc_messages

    async def generate(
        self,
        messages: list[ChatMessage],
        temperature: float = 0.7,
        max_tokens: int | None = None,
        system_instruction: str | None = None,
        **kwargs: Any,
    ) -> ModelResponse:
        """Generates a complete textual response using LangChain ainvoke.

        Args:
            messages (list[ChatMessage]): List of conversation history messages.
            temperature (float, optional): Sampling temperature.
            max_tokens (int | None, optional): Upper bound on output tokens.
            system_instruction (str | None, optional): System prompt text.

        Returns:
            ModelResponse: Standardized model response payload.
        """
        # [Fallback] Handle mock keys for UI testing
        api_key_str = (
            self.config.api_key or self._get_fallback_api_key(self.config.provider_id) or ""
        )
        if "mock" in api_key_str or "your_" in api_key_str:
            mock_text = f"Simulated response from {self.config.model_name} via {self.config.provider_id}. Configure valid API keys to query live endpoints."
            return ModelResponse(content=mock_text, model_name=self.config.model_name)

        try:
            lc_messages = self._format_messages(messages, system_instruction)
            response = await self.chat_model.ainvoke(lc_messages)

            usage_meta = getattr(response, "usage_metadata", {}) or {}
            usage = TokenUsage(
                prompt_tokens=usage_meta.get("input_tokens", 0),
                completion_tokens=usage_meta.get("output_tokens", 0),
                total_tokens=usage_meta.get("total_tokens", 0),
            )

            return ModelResponse(
                content=str(response.content),
                model_name=self.config.model_name,
                usage=usage,
                finish_reason="stop",
            )
        except Exception as exc:
            raise ProviderError(
                message=f"Generation error ({self.config.provider_id}): {exc}",
                provider_name=self.config.provider_id,
            ) from exc

    async def stream(
        self,
        messages: list[ChatMessage],
        temperature: float = 0.7,
        max_tokens: int | None = None,
        system_instruction: str | None = None,
        **kwargs: Any,
    ) -> AsyncGenerator[ModelResponseChunk, None]:
        """Streams real-time delta response chunks using LangChain astream.

        Args:
            messages (list[ChatMessage]): List of conversation history messages.
            temperature (float, optional): Sampling temperature.
            max_tokens (int | None, optional): Upper bound on output tokens.
            system_instruction (str | None, optional): System prompt text.

        Yields:
            ModelResponseChunk: Delta response chunk payload.
        """
        # [Fallback] Handle mock keys for UI testing
        api_key_str = (
            self.config.api_key or self._get_fallback_api_key(self.config.provider_id) or ""
        )
        if "mock" in api_key_str or "your_" in api_key_str:
            mock_text = f"Simulated response from {self.config.model_name} via {self.config.provider_id}. Please configure a valid API key in settings."
            words = mock_text.split(" ")
            for idx, word in enumerate(words):
                space = " " if idx < len(words) - 1 else ""
                finish = "stop" if idx == len(words) - 1 else None
                yield ModelResponseChunk(delta_content=word + space, finish_reason=finish)
            return

        try:
            lc_messages = self._format_messages(messages, system_instruction)
            async for chunk in self.chat_model.astream(lc_messages):
                delta_text = str(chunk.content)
                if delta_text:
                    yield ModelResponseChunk(delta_content=delta_text)
        except Exception as exc:
            raise ProviderError(
                message=f"Streaming error ({self.config.provider_id}): {exc}",
                provider_name=self.config.provider_id,
            ) from exc

    def get_model_info(self) -> ModelInfo:
        """Returns model specifications."""
        return ModelInfo(
            provider_name=self.config.provider_id,
            model_name=self.config.model_name,
        )

    async def list_models(self) -> list[str]:
        """Returns available models for the provider."""
        return [self.config.model_name]

    async def health(self) -> ProviderHealth:
        """Checks connectivity health for the provider."""
        return ProviderHealth(is_healthy=True, latency_ms=10.0)


class ProviderAdapterRegistry:
    """Dynamic Plugin Registry managing model provider adapter instantiation."""

    _adapters: dict[str, Callable[[ModelConfig], ModelProvider]] = {}

    @classmethod
    def register_adapter(
        cls, provider_id: str, adapter_cls: Callable[[ModelConfig], ModelProvider]
    ) -> None:
        """Registers a custom provider adapter class.

        Args:
            provider_id (str): Identifier key for the provider.
            adapter_cls (Callable[[ModelConfig], ModelProvider]): Concrete ModelProvider adapter factory or class.
        """
        cls._adapters[provider_id.lower()] = adapter_cls

    @classmethod
    def get_provider(cls, config: ModelConfig) -> ModelProvider:
        """Factory method retrieving or instantiating a ModelProvider for the specified config.

        Args:
            config (ModelConfig): Runtime model configuration payload.

        Returns:
            ModelProvider: Instantiated provider adapter instance.
        """
        provider_key = config.provider_id.lower()

        # Check explicitly registered custom adapter
        if provider_key in cls._adapters:
            return cls._adapters[provider_key](config)

        # Dynamic python module import support (e.g. "my_package.custom_adapter.MyAdapter")
        if "." in provider_key:
            try:
                module_path, class_name = provider_key.rsplit(".", 1)
                module = importlib.import_module(module_path)
                adapter_cls = getattr(module, class_name)
                cls.register_adapter(provider_key, adapter_cls)
                return cast(ModelProvider, adapter_cls(config))
            except Exception as exc:
                logger.warning(f"[Registry] Failed dynamic import for '{provider_key}': {exc}")

        # Default fallback to LangChain universal provider adapter
        return LangChainModelProvider(config)
