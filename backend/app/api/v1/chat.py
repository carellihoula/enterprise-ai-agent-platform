"""API endpoints for synchronous and streaming chat interactions.

This module provides the /chat and /chat/stream FastAPI endpoints for interacting
with LLM providers behind the ModelProvider abstraction layer.
"""

import json
import logging
from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import APIRouter, Depends, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import SessionLocal, get_db
from app.providers.llm.base import (
    ChatMessage,
    MessageRole,
    ModelConfig,
    ModelProvider,
    ModelResponse,
)
from app.providers.llm.langchain_provider import ProviderAdapterRegistry
from app.services.session_service import SessionService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["Chat"])
settings = get_settings()


class ChatRequest(BaseModel):
    """Data model representing a request payload for chat completion endpoints.

    Attributes:
        messages (list[ChatMessage]): Conversation history messages.
        provider_name (str): Identifier of the model provider (e.g., openai, gemini, anthropic, custom).
        model_name (str): Model version identifier.
        temperature (float): Sampling temperature value between 0.0 and 2.0.
        max_tokens (int | None): Optional upper bound on completion tokens.
        system_instruction (str | None): Optional system prompt instructions.
        session_id (str | None): Optional conversation session UUID for message persistence.
        api_key (str | None): Optional client-provided API key for the selected provider.
        base_url (str | None): Optional client-provided custom base URL (e.g., Ollama or vLLM).
    """

    messages: list[ChatMessage] = Field(
        default_factory=list, description="Conversation history messages"
    )
    provider_name: str = Field(default="openai", description="Model provider identifier")
    model_name: str = Field(default="gpt-4o", description="Target model version identifier")
    temperature: float = Field(default=0.7, ge=0.0, le=2.0, description="Sampling temperature")
    max_tokens: int | None = Field(default=None, description="Max completion tokens limit")
    system_instruction: str | None = Field(default=None, description="System prompt instructions")
    session_id: str | None = Field(default=None, description="Optional session ID for persistence")
    api_key: str | None = Field(default=None, description="Optional client API key")
    base_url: str | None = Field(default=None, description="Optional custom base URL endpoint")


class ChatResponse(BaseModel):
    """Data model representing a synchronous chat completion API response.

    Attributes:
        content (str): The generated response text.
        provider_name (str): Identifier of the model provider used.
        model_name (str): Model version used.
        usage (dict[str, int]): Token usage breakdown dictionary.
        finish_reason (str | None): Termination reason for generation.
        session_id (str | None): Associated session ID if persistence is enabled.
    """

    content: str = Field(description="Generated response text")
    provider_name: str = Field(description="Provider identifier used")
    model_name: str = Field(description="Model version used")
    usage: dict[str, int] = Field(default_factory=dict, description="Token usage statistics")
    finish_reason: str | None = Field(default="stop", description="Termination reason")
    session_id: str | None = Field(default=None, description="Associated session ID if persisted")


def _get_provider(
    provider_name: str,
    model_name: str = "",
    api_key: str | None = None,
    base_url: str | None = None,
    temperature: float = 0.7,
    max_tokens: int | None = None,
    system_instruction: str | None = None,
) -> ModelProvider:
    """Factory helper to instantiate a concrete ModelProvider instance via ProviderAdapterRegistry.

    Args:
        provider_name (str): Name of the target provider.
        model_name (str): Target model identifier.
        api_key (str | None): Optional client-supplied API key.
        base_url (str | None): Optional client-supplied Base URL endpoint.
        temperature (float): Sampling temperature value.
        max_tokens (int | None): Max token generation limit.
        system_instruction (str | None): Optional system prompt text.

    Returns:
        ModelProvider: Instantiated model provider.
    """
    config = ModelConfig(
        provider_id=provider_name,
        model_name=model_name or "gpt-4o",
        temperature=temperature,
        max_tokens=max_tokens,
        system_prompt=system_instruction,
        base_url=base_url,
        api_key=api_key,
    )
    return ProviderAdapterRegistry.get_provider(config)


class ProviderModelsResponse(BaseModel):
    """Response model listing available models for a provider."""

    provider_name: str = Field(description="Canonical provider name")
    models: list[str] = Field(description="Available model identifiers")


@router.get("/models", response_model=list[ProviderModelsResponse], status_code=status.HTTP_200_OK)
async def list_available_models() -> list[ProviderModelsResponse]:
    """Endpoint listing all supported providers and their dynamically fetched models.

    Returns:
        list[ProviderModelsResponse]: List of provider model availability objects.
    """
    supported_providers = ["openai", "anthropic", "gemini"]
    result: list[ProviderModelsResponse] = []

    for provider_name in supported_providers:
        provider_obj = _get_provider(provider_name)
        models_list = await provider_obj.list_models()
        result.append(
            ProviderModelsResponse(
                provider_name=provider_name,
                models=models_list,
            )
        )

    return result


def _prepare_messages_context(
    request_messages: list[ChatMessage],
    session_id: str | None,
    db: Session,
) -> tuple[list[ChatMessage], str | None]:
    """Prepares conversation history by combining persisted session history and new messages.

    Args:
        request_messages (list[ChatMessage]): User-provided payload messages.
        session_id (str | None): Optional existing session UUID.
        db (Session): Database session instance.

    Returns:
        tuple[list[ChatMessage], str | None]: Context messages array and validated session ID.
    """
    if not session_id:
        return request_messages, None

    service = SessionService(db)
    # [Validation] Fetch session to confirm existence and obtain historical messages
    session = service.get_session(session_id)

    historical_messages = [
        ChatMessage(role=MessageRole(m.role), content=m.content) for m in session.messages
    ]

    # [Context] Combine existing session history with incoming request messages
    full_messages = historical_messages + request_messages
    return full_messages, session.id


@router.post("", response_model=ChatResponse, status_code=status.HTTP_200_OK)
async def generate_chat(
    request: ChatRequest,
    db: Annotated[Session, Depends(get_db)],
) -> ChatResponse:
    """Synchronous chat endpoint generating a complete response.

    Args:
        request (ChatRequest): Incoming chat request payload.
        db (Session): Database session dependency.

    Returns:
        ChatResponse: Structured chat completion response.

    Raises:
        ProviderError: If the model provider endpoint fails.
        DomainError: If the specified session_id is not found.
    """
    provider = _get_provider(
        request.provider_name,
        request.model_name,
        api_key=request.api_key,
        base_url=request.base_url,
        temperature=request.temperature,
        max_tokens=request.max_tokens,
        system_instruction=request.system_instruction,
    )
    full_messages, target_session_id = _prepare_messages_context(
        request.messages, request.session_id, db
    )

    model_response: ModelResponse = await provider.generate(
        messages=full_messages,
        temperature=request.temperature,
        max_tokens=request.max_tokens,
        system_instruction=request.system_instruction,
    )

    # [Persistence] If session_id provided, store user prompt and assistant response
    if target_session_id:
        service = SessionService(db)
        for msg in request.messages:
            service.add_message(target_session_id, msg.role, msg.content)
        service.add_message(target_session_id, "assistant", model_response.content)

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
        session_id=target_session_id,
    )


@router.post("/stream", status_code=status.HTTP_200_OK)
async def stream_chat(
    request: ChatRequest,
    db: Annotated[Session, Depends(get_db)],
) -> StreamingResponse:
    """Streaming chat endpoint serving real-time Server-Sent Events (SSE).

    Args:
        request (ChatRequest): Incoming chat request payload.
        db (Session): Database session dependency.

    Returns:
        StreamingResponse: SSE stream formatted with text/event-stream MIME type.
    """
    provider = _get_provider(
        request.provider_name,
        request.model_name,
        api_key=request.api_key,
        base_url=request.base_url,
        temperature=request.temperature,
        max_tokens=request.max_tokens,
        system_instruction=request.system_instruction,
    )
    full_messages, target_session_id = _prepare_messages_context(
        request.messages, request.session_id, db
    )

    async def event_generator() -> AsyncGenerator[str, None]:
        """Async generator formatting chunks into SSE event lines and persisting messages."""
        accumulated_content = ""
        logger.info(
            f"[Stream] Starting stream for provider='{request.provider_name}', model='{request.model_name}'"
        )
        try:
            async for chunk in provider.stream(
                messages=full_messages,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
                system_instruction=request.system_instruction,
            ):
                accumulated_content += chunk.delta_content
                payload = {
                    "delta_content": chunk.delta_content,
                    "finish_reason": chunk.finish_reason,
                }
                yield f"data: {json.dumps(payload)}\n\n"

            logger.info(f"[Stream] Stream completed. Generated length={len(accumulated_content)}")

            # [Persistence] Store complete conversation exchange after stream finishes using dedicated DB session
            if target_session_id and accumulated_content:
                db_session = SessionLocal()
                try:
                    service = SessionService(db_session)
                    for msg in request.messages:
                        service.add_message(target_session_id, msg.role, msg.content)
                    service.add_message(target_session_id, "assistant", accumulated_content)
                    logger.info(f"[Stream] Saved messages to session_id='{target_session_id}'")
                finally:
                    db_session.close()

            yield "data: [DONE]\n\n"
        except Exception as exc:
            logger.error(f"[Stream ERROR] {exc}", exc_info=True)
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
