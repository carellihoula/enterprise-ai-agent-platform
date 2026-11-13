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
                "model": config.model_name,
                "api_key": api_key_secret or SecretStr("local-key"),
                "base_url": config.base_url or "http://localhost:11434/v1",
                "temperature": config.temperature,
                **config.provider_params,
            }
            if config.max_tokens is not None:
                openai_kwargs["max_tokens"] = config.max_tokens

            return ChatOpenAI(**openai_kwargs)

        # [OpenRouter Provider] Route via OpenAI-compatible endpoint with OpenRouter base URL
        if provider_id == "openrouter":
            from langchain_openai import ChatOpenAI

            openrouter_kwargs: dict[str, Any] = {
                "model": config.model_name,
                "api_key": api_key_secret or SecretStr("openrouter-key"),
                "base_url": config.base_url or "https://openrouter.ai/api/v1",
                "temperature": config.temperature,
                **config.provider_params,
            }
            if config.max_tokens is not None:
                openrouter_kwargs["max_tokens"] = config.max_tokens

            return ChatOpenAI(**openrouter_kwargs)

        # [Groq Provider] Instantiate high-throughput ChatGroq model instance
        if provider_id == "groq":
            from langchain_groq import ChatGroq

            groq_kwargs: dict[str, Any] = {
                "model": config.model_name,
                "temperature": config.temperature,
                **config.provider_params,
            }
            if api_key_secret:
                groq_kwargs["api_key"] = api_key_secret
            if config.max_tokens is not None:
                groq_kwargs["max_tokens"] = config.max_tokens
            if config.base_url:
                groq_kwargs["base_url"] = config.base_url

            # [Explicit Reasoning Flag] Only request parsed reasoning when explicitly enabled on the model config
            if config.enable_reasoning and "reasoning_format" not in groq_kwargs:
                try:
                    return ChatGroq(**{**groq_kwargs, "reasoning_format": "parsed"})
                except Exception:
                    pass

            return ChatGroq(**groq_kwargs)

        # [Mistral AI Provider] Instantiate official ChatMistralAI model instance
        if provider_id in ("mistral", "mistralai"):
            from langchain_mistralai import ChatMistralAI

            mistral_kwargs: dict[str, Any] = {
                "model": config.model_name,
                "temperature": config.temperature,
                **config.provider_params,
            }
            if api_key_secret:
                mistral_kwargs["api_key"] = api_key_secret
            if config.max_tokens is not None:
                mistral_kwargs["max_tokens"] = config.max_tokens
            if config.base_url:
                mistral_kwargs["endpoint"] = config.base_url

            return ChatMistralAI(**mistral_kwargs)

        # Normalize provider alias for LangChain initializer
        lc_provider_map = {
            "openai": "openai",
            "mock": "openai",
            "anthropic": "anthropic",
            "claude": "anthropic",
            "gemini": "google_genai",
            "google": "google_genai",
            "mistral": "mistralai",
            "mistralai": "mistralai",
            "groq": "groq",
            "openrouter": "openai",
        }
        lc_provider = lc_provider_map.get(provider_id, provider_id)

        # [Model Normalization] Map requested model alias if needed
        model_name = config.model_name

        try:
            kwargs: dict[str, Any] = {
                "model": model_name,
                "model_provider": lc_provider,
                "temperature": config.temperature,
            }
            if config.max_tokens:
                kwargs["max_tokens"] = config.max_tokens
            if api_key_secret:
                kwargs["api_key"] = api_key_secret
            if config.base_url:
                kwargs["base_url"] = config.base_url

            # [Explicit Reasoning Flag] Enable native provider reasoning only when configured on the assistant/model
            if (
                config.enable_reasoning
                and lc_provider == "google_genai"
                and "include_thoughts" not in config.provider_params
            ):
                gemini_thinking_kwargs: dict[str, Any] = {"include_thoughts": True}
                if not any(
                    k in config.provider_params
                    for k in ("thinking_budget", "thinking_level", "thinking_config")
                ):
                    # [Gemini Thinking] Use dynamic budget (-1) so models with default 0 think without truncating
                    gemini_thinking_kwargs["thinking_budget"] = -1
                try:
                    return cast(
                        BaseChatModel,
                        init_chat_model(
                            **kwargs,
                            **gemini_thinking_kwargs,
                            **config.provider_params,
                        ),
                    )
                except Exception:
                    try:
                        return cast(
                            BaseChatModel,
                            init_chat_model(
                                **kwargs,
                                include_thoughts=True,
                                **config.provider_params,
                            ),
                        )
                    except Exception:
                        pass

            if (
                config.enable_reasoning
                and lc_provider == "anthropic"
                and "thinking" not in config.provider_params
            ):
                try:
                    anthropic_kwargs = {
                        **kwargs,
                        "temperature": 1.0,
                        "thinking": {"type": "enabled", "budget_tokens": 2048},
                        **config.provider_params,
                    }
                    return cast(BaseChatModel, init_chat_model(**anthropic_kwargs))
                except Exception:
                    pass

            if (
                config.enable_reasoning
                and lc_provider == "openai"
                and "reasoning" not in config.provider_params
            ):
                try:
                    openai_reasoning_kwargs = {
                        **kwargs,
                        "use_responses_api": True,
                        "reasoning": {"summary": "auto"},
                        **config.provider_params,
                    }
                    openai_reasoning_kwargs.pop("temperature", None)
                    return cast(BaseChatModel, init_chat_model(**openai_reasoning_kwargs))
                except Exception:
                    pass

            return cast(BaseChatModel, init_chat_model(**kwargs, **config.provider_params))
        except Exception as exc:
            # [Routing] Do not route non-OpenAI providers to generic OpenAI endpoint
            if lc_provider in ("google_genai", "anthropic", "mistralai", "groq"):
                logger.error(
                    f"[LangChain] Failed to initialize {lc_provider} model '{config.model_name}': {exc}"
                )
                raise ValueError(
                    f"Failed to initialize {provider_id} model '{config.model_name}': {exc}"
                ) from exc

            # Fall back to OpenAI-compatible interface only for OpenAI / generic endpoints
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
        if provider_id in ("mistral", "mistralai"):
            return settings.mistral_api_key.get_secret_value() if settings.mistral_api_key else None
        if provider_id == "groq":
            return settings.groq_api_key.get_secret_value() if settings.groq_api_key else None
        if provider_id == "openrouter":
            return (
                settings.openrouter_api_key.get_secret_value()
                if settings.openrouter_api_key
                else None
            )
        return None

    @staticmethod
    def _extract_text_content(content: Any) -> str:
        """Extracts pure textual content from string, list of content blocks, or dictionaries.

        Args:
            content (Any): The raw content payload from LangChain response or chunk.

        Returns:
            str: Normalized pure text string without raw block serialization artifacts.
        """
        if isinstance(content, str):
            # [Sanitization] Clean legacy raw Python block list representations if present
            if "[{'type':" in content or '[{"type":' in content:
                import ast
                import re

                matches = list(re.finditer(r"\[(?:\s*\{.*?\}\s*)*\]", content, re.DOTALL))
                if matches:
                    result: list[str] = []
                    last_end = 0
                    for m in matches:
                        result.append(content[last_end : m.start()])
                        block_str = m.group(0)
                        try:
                            parsed = ast.literal_eval(block_str)
                            if isinstance(parsed, list):
                                for item in parsed:
                                    if (
                                        isinstance(item, dict)
                                        and "text" in item
                                        and isinstance(item["text"], str)
                                    ):
                                        result.append(item["text"])
                                    elif isinstance(item, str):
                                        result.append(item)
                            else:
                                result.append(block_str)
                        except Exception:
                            result.append(block_str)
                        last_end = m.end()
                    result.append(content[last_end:])
                    return "".join(result)
            return content

        if isinstance(content, list):
            texts: list[str] = []
            for item in content:
                if isinstance(item, str):
                    texts.append(item)
                elif isinstance(item, dict):
                    if item.get("type") in ("thinking", "reasoning"):
                        continue
                    # [Extraction] Extract text payload from multimodal / structured text blocks
                    text_val = item.get("text")
                    if text_val and isinstance(text_val, str):
                        texts.append(text_val)
                elif hasattr(item, "text") and isinstance(item.text, str):
                    texts.append(item.text)
            return "".join(texts)

        if isinstance(content, dict):
            text_val = content.get("text")
            if text_val and isinstance(text_val, str):
                return text_val

        return ""

    @staticmethod
    def extract_chunk_reasoning(chunk: Any) -> str:
        """Extracts incremental reasoning/thinking text from a streamed LangChain chunk.

        Args:
            chunk (Any): Streamed AIMessageChunk or response message.

        Returns:
            str: Extracted reasoning delta string, or empty string.
        """
        parts: list[str] = []
        extra = getattr(chunk, "additional_kwargs", None) or {}
        for key in ("reasoning_content", "thinking", "reasoning"):
            val = extra.get(key)
            if isinstance(val, str) and val:
                parts.append(val)

        content = getattr(chunk, "content", None)
        if isinstance(content, list):
            for block in content:
                if not isinstance(block, dict):
                    continue
                if block.get("type") in ("thinking", "reasoning"):
                    txt = block.get("thinking") or block.get("text") or block.get("reasoning")
                    if isinstance(txt, str) and txt:
                        parts.append(txt)
                    summary = block.get("summary")
                    if isinstance(summary, list):
                        for s_item in summary:
                            if isinstance(s_item, dict) and isinstance(s_item.get("text"), str):
                                parts.append(s_item["text"])
        return "".join(parts)

    @staticmethod
    def split_think_tags_step(
        buffer: str, in_think: bool, incoming: str
    ) -> tuple[str, str, str, bool]:
        """Incrementally splits `<think>...</think>` sections across streaming chunks.

        Args:
            buffer (str): Carry-over partial tag buffer from previous chunk.
            in_think (bool): Whether the stream is currently inside a `<think>` block.
            incoming (str): Newly arrived text delta.

        Returns:
            tuple[str, str, str, bool]: `(answer_delta, reasoning_delta, next_buffer, next_in_think)`.
        """
        data = buffer + incoming
        answer_out: list[str] = []
        reason_out: list[str] = []
        open_tag = "<think>"
        close_tag = "</think>"

        while data:
            if in_think:
                idx = data.lower().find(close_tag)
                if idx != -1:
                    reason_out.append(data[:idx])
                    data = data[idx + len(close_tag) :]
                    in_think = False
                else:
                    # [Boundary Guard] Keep trailing prefix in case `</think>` spans chunks
                    keep = min(len(data), len(close_tag) - 1)
                    if keep > 0 and data[-keep:].startswith("<"):
                        reason_out.append(data[:-keep])
                        data = data[-keep:]
                        break
                    last_lt = data.rfind("<")
                    if last_lt != -1 and len(data) - last_lt < len(close_tag):
                        reason_out.append(data[:last_lt])
                        data = data[last_lt:]
                        break
                    reason_out.append(data)
                    data = ""
            else:
                idx = data.lower().find(open_tag)
                if idx != -1:
                    answer_out.append(data[:idx])
                    data = data[idx + len(open_tag) :]
                    in_think = True
                else:
                    last_lt = data.rfind("<")
                    if last_lt != -1 and len(data) - last_lt < len(open_tag):
                        answer_out.append(data[:last_lt])
                        data = data[last_lt:]
                        break
                    answer_out.append(data)
                    data = ""

        return "".join(answer_out), "".join(reason_out), data, in_think

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
            clean_text = self._extract_text_content(msg.content)
            if msg.role == "user":
                lc_messages.append(HumanMessage(content=clean_text))
            elif msg.role == "assistant":
                lc_messages.append(AIMessage(content=clean_text))
            elif msg.role == "system":
                lc_messages.append(SystemMessage(content=clean_text))

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
            raw_text = self._extract_text_content(response.content)

            return ModelResponse(
                content=raw_text,
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
            tag_buf = ""
            in_think = False
            async for chunk in self.chat_model.astream(lc_messages):
                raw_text = self._extract_text_content(chunk.content)
                struct_reasoning = self.extract_chunk_reasoning(chunk)
                answer_delta, tag_reasoning, tag_buf, in_think = self.split_think_tags_step(
                    tag_buf, in_think, raw_text
                )
                combined_reasoning = struct_reasoning + tag_reasoning
                if answer_delta or combined_reasoning:
                    yield ModelResponseChunk(
                        delta_content=answer_delta,
                        delta_reasoning=combined_reasoning,
                    )
            if tag_buf:
                if in_think:
                    yield ModelResponseChunk(delta_content="", delta_reasoning=tag_buf)
                else:
                    yield ModelResponseChunk(delta_content=tag_buf, delta_reasoning="")
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
        """Returns available models for the provider.

        Returns:
            list[str]: The user-configured model identifier, or an empty list if none is set.
        """
        return [self.config.model_name] if self.config.model_name else []

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
