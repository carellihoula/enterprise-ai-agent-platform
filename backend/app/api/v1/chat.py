"""API endpoints for synchronous and streaming chat interactions.

This module provides the /chat and /chat/stream FastAPI endpoints for interacting
with LLM providers behind the ModelProvider abstraction layer.
"""

import json
import logging
from collections.abc import AsyncGenerator
from typing import Annotated, Any

from fastapi import APIRouter, Depends, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import SessionLocal, get_db
from app.core.security import decrypt_api_key
from app.engine.langchain_tools import build_langchain_tools_for_agent, run_agent_tool_loop
from app.models.entities import Agent
from app.providers.llm.base import (
    ChatMessage,
    MessageRole,
    ModelConfig,
    ModelProvider,
    ModelResponse,
)
from app.providers.llm.langchain_provider import LangChainModelProvider, ProviderAdapterRegistry
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
    model_name: str = Field(default="", description="Target model version identifier")
    temperature: float = Field(default=0.7, ge=0.0, le=2.0, description="Sampling temperature")
    max_tokens: int | None = Field(default=None, description="Max completion tokens limit")
    enable_reasoning: bool | None = Field(
        default=None,
        description="Optional override to request native reasoning/thinking tokens",
    )
    system_instruction: str | None = Field(default=None, description="System prompt instructions")
    session_id: str | None = Field(default=None, description="Optional session ID for persistence")
    agent_id: str | None = Field(default=None, description="Optional target agent identifier")
    assistant_id: str | None = Field(default=None, description="Deprecated alias for agent_id")
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
    enable_reasoning: bool = False,
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
        enable_reasoning (bool): Whether to request native reasoning/thinking tokens.

    Returns:
        ModelProvider: Instantiated model provider.
    """
    config = ModelConfig(
        provider_id=provider_name,
        model_name=model_name,
        temperature=temperature,
        max_tokens=max_tokens,
        enable_reasoning=enable_reasoning,
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
    """Endpoint listing all supported providers with empty model catalogs.

    Returns:
        list[ProviderModelsResponse]: List of provider objects with empty model lists.
    """
    supported_providers = [
        "openai",
        "anthropic",
        "gemini",
        "mistral",
        "groq",
        "openrouter",
    ]
    # [No Predefined Models] Catalogs start empty; users register model IDs on each assistant
    return [
        ProviderModelsResponse(provider_name=provider_name, models=[])
        for provider_name in supported_providers
    ]


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


def _resolve_provider_credentials(
    request: ChatRequest,
    db: Session,
) -> tuple[str | None, str | None, str | None]:
    """Resolves API key, base URL, and system instruction from request or persisted database config.

    Args:
        request (ChatRequest): Incoming chat request payload.
        db (Session): Active database session.

    Returns:
        tuple[str | None, str | None, str | None]: Tuple of (api_key, base_url, system_instruction).
    """
    api_key = request.api_key
    base_url = request.base_url
    system_instruction = request.system_instruction

    # [Agent Override] If agent_id (or legacy assistant_id) provided, adopt agent's persona and model configuration
    target_agent_id = request.agent_id or request.assistant_id
    if target_agent_id:
        agent = db.query(Agent).filter(Agent.id == target_agent_id).first()
        if agent:
            if not system_instruction and agent.instructions:
                system_instruction = agent.instructions
            if not request.provider_name or request.provider_name == "openai":
                request.provider_name = agent.provider_id
            if not request.model_name:
                request.model_name = agent.model_name
            if not api_key and agent.api_key_encrypted:
                api_key = decrypt_api_key(agent.api_key_encrypted)
            if not base_url and agent.base_url:
                base_url = agent.base_url
    elif request.provider_name:
        # [Fallback to Provider Match] Check if an agent matches the requested provider
        matched_agent = (
            db.query(Agent)
            .filter(Agent.provider_id == request.provider_name.lower().strip())
            .first()
        )
        if matched_agent:
            if not api_key and matched_agent.api_key_encrypted:
                api_key = decrypt_api_key(matched_agent.api_key_encrypted)
            if not base_url and matched_agent.base_url:
                base_url = matched_agent.base_url
            if not system_instruction and matched_agent.instructions:
                system_instruction = matched_agent.instructions

    return api_key, base_url, system_instruction


def _resolve_target_agent(request: ChatRequest, db: Session) -> Agent | None:
    """Resolves the target Agent ORM entity for a chat request if specified.

    Args:
        request (ChatRequest): Incoming chat request payload.
        db (Session): Active database session.

    Returns:
        Agent | None: Matched Agent ORM record, or None.
    """
    target_agent_id = request.agent_id or request.assistant_id
    if target_agent_id:
        return db.query(Agent).filter(Agent.id == target_agent_id).first()
    if request.provider_name:
        return (
            db.query(Agent)
            .filter(Agent.provider_id == request.provider_name.lower().strip())
            .first()
        )
    return None


def _record_trace_event(recorded_steps: list[dict[str, Any]], evt: dict[str, Any]) -> None:
    """Appends or updates a trace step dictionary from an agent loop lifecycle event.

    Args:
        recorded_steps (list[dict[str, Any]]): Mutable list of trace steps to persist.
        evt (dict[str, Any]): Event payload emitted by run_agent_tool_loop.
    """
    evt_type = evt.get("type")
    if evt_type == "think_delta" and evt.get("delta"):
        delta = str(evt["delta"])
        if recorded_steps and recorded_steps[-1].get("type") == "think":
            recorded_steps[-1]["text"] = str(recorded_steps[-1].get("text") or "") + delta
        else:
            recorded_steps.append(
                {
                    "id": f"think-{len(recorded_steps)}",
                    "type": "think",
                    "name": "Reasoning",
                    "status": "done",
                    "text": delta,
                }
            )
    elif evt_type == "think" and evt.get("text"):
        recorded_steps.append(
            {
                "id": f"think-{len(recorded_steps)}",
                "type": "think",
                "name": "Reasoning",
                "status": "done",
                "text": str(evt["text"]),
            }
        )
    elif evt_type == "tool_start" and evt.get("tool_name"):
        recorded_steps.append(
            {
                "id": f"tool-{len(recorded_steps)}",
                "type": "tool",
                "name": str(evt["tool_name"]),
                "status": "running",
                "arguments": evt.get("arguments") or {},
            }
        )
    elif evt_type == "tool_end" and evt.get("tool_name"):
        tool_name = str(evt["tool_name"])
        for step in reversed(recorded_steps):
            if step.get("name") == tool_name and step.get("status") == "running":
                step["status"] = "error" if evt.get("ok") is False else "done"
                step["latencyMs"] = evt.get("latency_ms")
                step["output"] = evt.get("output")
                return
        recorded_steps.append(
            {
                "id": f"tool-{len(recorded_steps)}",
                "type": "tool",
                "name": tool_name,
                "status": "error" if evt.get("ok") is False else "done",
                "latencyMs": evt.get("latency_ms"),
                "output": evt.get("output"),
            }
        )


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
    resolved_api_key, resolved_base_url, resolved_system_prompt = _resolve_provider_credentials(
        request, db
    )
    target_agent = _resolve_target_agent(request, db)
    resolved_enable_reasoning = (
        request.enable_reasoning
        if request.enable_reasoning is not None
        else (target_agent.enable_reasoning if target_agent else False)
    )
    provider = _get_provider(
        request.provider_name,
        request.model_name,
        api_key=resolved_api_key,
        base_url=resolved_base_url,
        temperature=request.temperature,
        max_tokens=request.max_tokens,
        system_instruction=resolved_system_prompt,
        enable_reasoning=resolved_enable_reasoning,
    )
    full_messages, target_session_id = _prepare_messages_context(
        request.messages, request.session_id, db
    )
    agent_tools = await build_langchain_tools_for_agent(target_agent, db)

    if agent_tools and isinstance(provider, LangChainModelProvider):
        lc_messages = provider._format_messages(full_messages, resolved_system_prompt)
        collected_parts: list[str] = []
        recorded_steps: list[dict[str, Any]] = []
        async for evt in run_agent_tool_loop(provider.chat_model, lc_messages, agent_tools):
            if evt.get("type") == "token":
                collected_parts.append(str(evt.get("delta_content", "")))
            else:
                _record_trace_event(recorded_steps, evt)
        final_text = "".join(collected_parts)
        if target_session_id:
            service = SessionService(db)
            for msg in request.messages:
                service.add_message(target_session_id, msg.role, msg.content)
            service.add_message(
                target_session_id,
                "assistant",
                final_text,
                trace_steps=recorded_steps or None,
            )
        return ChatResponse(
            content=final_text,
            provider_name=request.provider_name,
            model_name=request.model_name,
            usage={"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
            finish_reason="stop",
            session_id=target_session_id,
        )

    model_response: ModelResponse = await provider.generate(
        messages=full_messages,
        temperature=request.temperature,
        max_tokens=request.max_tokens,
        system_instruction=resolved_system_prompt,
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
    resolved_api_key, resolved_base_url, resolved_system_prompt = _resolve_provider_credentials(
        request, db
    )
    target_agent = _resolve_target_agent(request, db)
    resolved_enable_reasoning = (
        request.enable_reasoning
        if request.enable_reasoning is not None
        else (target_agent.enable_reasoning if target_agent else False)
    )
    provider = _get_provider(
        request.provider_name,
        request.model_name,
        api_key=resolved_api_key,
        base_url=resolved_base_url,
        temperature=request.temperature,
        max_tokens=request.max_tokens,
        system_instruction=resolved_system_prompt,
        enable_reasoning=resolved_enable_reasoning,
    )
    full_messages, target_session_id = _prepare_messages_context(
        request.messages, request.session_id, db
    )
    agent_tools = await build_langchain_tools_for_agent(target_agent, db)

    async def event_generator() -> AsyncGenerator[str, None]:
        """Async generator formatting chunks into SSE event lines and persisting messages."""
        accumulated_content = ""
        recorded_steps: list[dict[str, Any]] = []
        logger.info(
            f"[Stream] Starting stream for provider='{request.provider_name}', model='{request.model_name}'"
        )
        try:
            if agent_tools and isinstance(provider, LangChainModelProvider):
                lc_messages = provider._format_messages(full_messages, resolved_system_prompt)
                async for evt in run_agent_tool_loop(provider.chat_model, lc_messages, agent_tools):
                    evt_type = evt.get("type")
                    if evt_type in ("tool_start", "tool_end", "think", "think_delta"):
                        _record_trace_event(recorded_steps, evt)
                        yield f"data: {json.dumps({'tool_event': evt})}\n\n"
                    elif evt_type == "token":
                        delta = str(evt.get("delta_content", ""))
                        accumulated_content += delta
                        stream_payload: dict[str, Any] = {
                            "delta_content": delta,
                            "finish_reason": "stop",
                        }
                        yield f"data: {json.dumps(stream_payload)}\n\n"
            else:
                async for chunk in provider.stream(
                    messages=full_messages,
                    temperature=request.temperature,
                    max_tokens=request.max_tokens,
                    system_instruction=resolved_system_prompt,
                ):
                    if chunk.delta_reasoning:
                        think_evt: dict[str, Any] = {
                            "type": "think_delta",
                            "delta": chunk.delta_reasoning,
                        }
                        _record_trace_event(recorded_steps, think_evt)
                        yield f"data: {json.dumps({'tool_event': think_evt})}\n\n"
                    if chunk.delta_content:
                        accumulated_content += chunk.delta_content
                        stream_payload = {
                            "delta_content": chunk.delta_content,
                            "finish_reason": chunk.finish_reason,
                        }
                        yield f"data: {json.dumps(stream_payload)}\n\n"

            logger.info(f"[Stream] Stream completed. Generated length={len(accumulated_content)}")

            # [Persistence] Store complete conversation exchange after stream finishes using dedicated DB session
            if target_session_id and (accumulated_content or recorded_steps):
                db_session = SessionLocal()
                try:
                    service = SessionService(db_session)
                    for msg in request.messages:
                        service.add_message(target_session_id, msg.role, msg.content)
                    service.add_message(
                        target_session_id,
                        "assistant",
                        accumulated_content,
                        trace_steps=recorded_steps or None,
                    )
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
