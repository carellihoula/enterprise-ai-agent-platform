"""API endpoints for synchronous and streaming chat interactions.

This module provides the /chat and /chat/stream FastAPI endpoints for interacting
with LLM providers behind the ModelProvider abstraction layer.
"""

import json
from collections.abc import AsyncGenerator

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.providers.llm.base import ChatMessage, ModelResponse
from app.providers.llm.openai import OpenAIProvider

router = APIRouter(prefix="/chat", tags=["Chat"])
settings = get_settings()


class ChatRequest(BaseModel):
    """Data model representing a request payload for chat completion endpoints.

    Attributes:
        messages (list[ChatMessage]): Conversation history messages.
        provider_name (str): Identifier of the model provider (e.g., openai, gemini, mock).
        model_name (str): Model version identifier.
        temperature (float): Sampling temperature value between 0.0 and 2.0.
        max_tokens (int | None): Optional upper bound on completion tokens.
        system_instruction (str | None): Optional system prompt instructions.
    """

    messages: list[ChatMessage] = Field(description="Conversation history messages")
    provider_name: str = Field(default="openai", description="Model provider identifier")
    model_name: str = Field(default="gpt-4o", description="Target model version identifier")
    temperature: float = Field(default=0.7, ge=0.0, le=2.0, description="Sampling temperature")
    max_tokens: int | None = Field(default=None, description="Max completion tokens limit")
    system_instruction: str | None = Field(default=None, description="System prompt instructions")


class ChatResponse(BaseModel):
    """Data model representing a synchronous chat completion API response.

    Attributes:
        content (str): The generated response text.
        provider_name (str): Identifier of the model provider used.
        model_name (str): Model version used.
        usage (dict[str, int]): Token usage breakdown dictionary.
        finish_reason (str | None): Termination reason for generation.
    """

    content: str = Field(description="Generated response text")
    provider_name: str = Field(description="Provider identifier used")
    model_name: str = Field(description="Model version used")
    usage: dict[str, int] = Field(default_factory=dict, description="Token usage statistics")
    finish_reason: str | None = Field(default="stop", description="Termination reason")


def _get_provider(provider_name: str, model_name: str) -> OpenAIProvider:
    """Factory helper to instantiate a concrete ModelProvider instance.

    Args:
        provider_name (str): Name of the target provider.
        model_name (str): Target model identifier.

    Returns:
        OpenAIProvider: Instantiated model provider.

    Raises:
        HTTPException: If an unsupported provider name is specified.
    """
    if provider_name.lower() in ("openai", "mock"):
        return OpenAIProvider(
            api_key=settings.secret_key,
            model_name=model_name,
        )

    # [Validation] Reject unsupported provider names
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Unsupported provider: '{provider_name}'. Supported providers: ['openai', 'mock'].",
    )


@router.post("", response_model=ChatResponse, status_code=status.HTTP_200_OK)
async def generate_chat(request: ChatRequest) -> ChatResponse:
    """Synchronous chat endpoint generating a complete response.

    Args:
        request (ChatRequest): Incoming chat request payload.

    Returns:
        ChatResponse: Structured chat completion response.

    Raises:
        ProviderError: If the model provider endpoint fails.
    """
    provider = _get_provider(request.provider_name, request.model_name)

    model_response: ModelResponse = await provider.generate(
        messages=request.messages,
        temperature=request.temperature,
        max_tokens=request.max_tokens,
        system_instruction=request.system_instruction,
    )

    return ChatResponse(
        content=model_response.content,
        provider_name=request.provider_name,
        model_name=model_response.model_name,
        usage={
            "prompt_tokens": model_response.usage.prompt_tokens,
            "completion_tokens": model_response.usage.completion_tokens,
            "total_tokens": model_response.usage.total_tokens,
        },
        finish_reason=model_response.finish_reason,
    )


@router.post("/stream", status_code=status.HTTP_200_OK)
async def stream_chat(request: ChatRequest) -> StreamingResponse:
    """Streaming chat endpoint serving real-time Server-Sent Events (SSE).

    Args:
        request (ChatRequest): Incoming chat request payload.

    Returns:
        StreamingResponse: SSE stream formatted with text/event-stream MIME type.
    """
    provider = _get_provider(request.provider_name, request.model_name)

    async def event_generator() -> AsyncGenerator[str, None]:
        """Async generator formatting chunks into SSE event lines."""
        try:
            async for chunk in provider.stream(
                messages=request.messages,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
                system_instruction=request.system_instruction,
            ):
                payload = {
                    "delta_content": chunk.delta_content,
                    "finish_reason": chunk.finish_reason,
                }
                yield f"data: {json.dumps(payload)}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as exc:
            error_payload = {"error": str(exc)}
            yield f"data: {json.dumps(error_payload)}\n\n"

    # [Streaming] Return HTTP StreamingResponse with SSE headers
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
