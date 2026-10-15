"""API endpoints for managing AI Assistant configurations and custom agent personas.

This module provides FastAPI routes for creating, listing, retrieving, updating, and deleting
custom AI Assistants, serving as the foundational catalog for multi-assistant workflows.
"""

from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decrypt_api_key, encrypt_api_key, mask_api_key
from app.models.entities import Assistant

router = APIRouter(prefix="/assistants", tags=["Assistants"])


class AssistantCreate(BaseModel):
    """Payload schema for creating a new custom assistant.

    Attributes:
        name (str): Human-readable title of the assistant.
        description (str | None): Optional summary of the assistant's specialty.
        avatar (str | None): UI icon or avatar key.
        provider_id (str): Underlying model provider identifier.
        model_name (str): Target model version identifier.
        temperature (float): Generation temperature parameter (0.0 to 1.0).
        max_tokens (int | None): Max token output generation limit.
        system_prompt (str | None): Core persona and system instructions.
        api_key (str | None): Optional plaintext API key to encrypt and save.
        base_url (str | None): Optional custom base URL endpoint.
        is_default (bool): Whether this assistant is the default for new sessions.
        tools (list[dict[str, Any]]): Extensible tool specifications for agentic execution.
    """

    name: str = Field(min_length=1, max_length=100, description="Display name of the assistant")
    description: str | None = Field(default=None, max_length=255, description="Brief description")
    avatar: str | None = Field(
        default="Bot", max_length=50, description="Icon or avatar identifier"
    )
    provider_id: str = Field(default="groq", description="Provider identifier")
    model_name: str = Field(default="", description="Model version identifier")
    temperature: float = Field(default=0.7, ge=0.0, le=1.0, description="Sampling temperature")
    max_tokens: int | None = Field(default=None, description="Max generation tokens")
    system_prompt: str | None = Field(default=None, description="System persona instructions")
    api_key: str | None = Field(default=None, description="Optional plaintext API key to encrypt")
    base_url: str | None = Field(default=None, description="Optional custom base URL endpoint")
    is_default: bool = Field(default=False, description="Default assistant flag")
    tools: list[dict[str, Any]] = Field(default_factory=list, description="Agentic tools list")


class AssistantUpdate(BaseModel):
    """Payload schema for updating an existing assistant.

    Attributes:
        name (str | None): Updated display name.
        description (str | None): Updated brief description.
        avatar (str | None): Updated icon or avatar identifier.
        provider_id (str | None): Updated provider identifier.
        model_name (str | None): Updated model identifier.
        temperature (float | None): Updated sampling temperature.
        max_tokens (int | None): Updated max tokens limit.
        system_prompt (str | None): Updated system prompt instructions.
        api_key (str | None): Updated API key. Empty string clears it. None preserves it.
        base_url (str | None): Updated base URL endpoint.
        is_default (bool | None): Updated default assistant flag.
        tools (list[dict[str, Any]] | None): Updated agentic tools list.
    """

    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=255)
    avatar: str | None = Field(default=None, max_length=50)
    provider_id: str | None = Field(default=None)
    model_name: str | None = Field(default=None)
    temperature: float | None = Field(default=None, ge=0.0, le=1.0)
    max_tokens: int | None = Field(default=None)
    system_prompt: str | None = Field(default=None)
    api_key: str | None = Field(default=None)
    base_url: str | None = Field(default=None)
    is_default: bool | None = Field(default=None)
    tools: list[dict[str, Any]] | None = Field(default=None)


class AssistantResponse(BaseModel):
    """Response model representing a persistent AI Assistant with masked credentials.

    Attributes:
        id (str): Primary key UUID string identifier.
        name (str): Display name of the assistant.
        description (str | None): Brief description.
        avatar (str | None): Icon or avatar identifier.
        provider_id (str): Associated LLM provider.
        model_name (str): Associated model name.
        temperature (float): Configured sampling temperature.
        max_tokens (int | None): Configured max token output.
        system_prompt (str | None): System instruction persona.
        base_url (str | None): Configured custom base URL.
        masked_api_key (str | None): Masked representation of encrypted key.
        has_api_key (bool): Whether an encrypted API key is stored.
        is_default (bool): Default assistant status flag.
        tools (list[dict[str, Any]]): Configured agentic tools.
        created_at (datetime): Timestamp when record was created.
        updated_at (datetime): Timestamp when record was last updated.
    """

    id: str
    name: str
    description: str | None = None
    avatar: str | None = None
    provider_id: str
    model_name: str
    temperature: float
    max_tokens: int | None = None
    system_prompt: str | None = None
    base_url: str | None = None
    masked_api_key: str | None = None
    has_api_key: bool = False
    is_default: bool
    tools: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


def _to_response(assistant: Assistant) -> AssistantResponse:
    """Converts an Assistant ORM entity into a public AssistantResponse schema.

    Args:
        assistant (Assistant): Database ORM entity.

    Returns:
        AssistantResponse: Response schema with masked credentials.
    """
    plain_key = (
        decrypt_api_key(assistant.api_key_encrypted) if assistant.api_key_encrypted else None
    )
    return AssistantResponse(
        id=assistant.id,
        name=assistant.name,
        description=assistant.description,
        avatar=assistant.avatar,
        provider_id=assistant.provider_id,
        model_name=assistant.model_name,
        temperature=assistant.temperature,
        max_tokens=assistant.max_tokens,
        system_prompt=assistant.system_prompt,
        base_url=assistant.base_url,
        masked_api_key=mask_api_key(plain_key),
        has_api_key=bool(assistant.api_key_encrypted),
        is_default=assistant.is_default,
        tools=assistant.tools or [],
        created_at=assistant.created_at,
        updated_at=assistant.updated_at,
    )


def _seed_default_assistant_if_empty(db: Session) -> None:
    """Seeds a starter assistant if the assistants table is completely empty.

    Args:
        db (Session): Active database session.
    """
    count = db.query(Assistant).count()
    if count == 0:
        # [Initialization] Provide a clean baseline assistant out-of-the-box
        starter = Assistant(
            name="General Assistant",
            description="Versatile AI assistant for everyday coding, problem-solving, and analysis.",
            avatar="Bot",
            provider_id="groq",
            model_name="",
            temperature=0.7,
            system_prompt="You are a helpful, precise, and thoughtful AI assistant.",
            is_default=True,
            tools=[],
        )
        db.add(starter)
        db.commit()


@router.get("", response_model=list[AssistantResponse], status_code=status.HTTP_200_OK)
def list_assistants(db: Annotated[Session, Depends(get_db)]) -> list[AssistantResponse]:
    """Retrieves all registered assistants ordered by default status and creation date.

    Args:
        db (Session): Database session dependency.

    Returns:
        list[AssistantResponse]: Array of all configured assistant schemas.
    """
    _seed_default_assistant_if_empty(db)
    records = (
        db.query(Assistant).order_by(Assistant.is_default.desc(), Assistant.created_at.asc()).all()
    )
    return [_to_response(record) for record in records]


@router.post("", response_model=AssistantResponse, status_code=status.HTTP_201_CREATED)
def create_assistant(
    payload: AssistantCreate,
    db: Annotated[Session, Depends(get_db)],
) -> AssistantResponse:
    """Creates a new custom AI Assistant configuration.

    Args:
        payload (AssistantCreate): Creation payload data.
        db (Session): Database session dependency.

    Returns:
        AssistantResponse: Newly persisted assistant response with masked credentials.
    """
    # [Mutual Exclusivity] Unmark previous default if new assistant is set as default
    if payload.is_default:
        db.query(Assistant).filter(Assistant.is_default == True).update({"is_default": False})  # noqa: E712

    encrypted_key = (
        encrypt_api_key(payload.api_key.strip())
        if payload.api_key and payload.api_key.strip()
        else None
    )

    record = Assistant(
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        avatar=payload.avatar or "Bot",
        provider_id=payload.provider_id.strip().lower(),
        model_name=payload.model_name.strip(),
        temperature=payload.temperature,
        max_tokens=payload.max_tokens,
        system_prompt=payload.system_prompt.strip() if payload.system_prompt else None,
        api_key_encrypted=encrypted_key,
        base_url=payload.base_url.strip() if payload.base_url else None,
        is_default=payload.is_default,
        tools=payload.tools,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return _to_response(record)


@router.get("/{assistant_id}", response_model=AssistantResponse, status_code=status.HTTP_200_OK)
def get_assistant(
    assistant_id: str,
    db: Annotated[Session, Depends(get_db)],
) -> AssistantResponse:
    """Fetches a specific assistant by UUID identifier.

    Args:
        assistant_id (str): Target assistant identifier.
        db (Session): Database session dependency.

    Returns:
        AssistantResponse: Found assistant entity response.

    Raises:
        HTTPException: If the assistant does not exist.
    """
    record = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assistant '{assistant_id}' not found",
        )
    return _to_response(record)


@router.put("/{assistant_id}", response_model=AssistantResponse, status_code=status.HTTP_200_OK)
def update_assistant(
    assistant_id: str,
    payload: AssistantUpdate,
    db: Annotated[Session, Depends(get_db)],
) -> AssistantResponse:
    """Updates fields of an existing assistant entity.

    Args:
        assistant_id (str): Target assistant identifier.
        payload (AssistantUpdate): Partial update payload.
        db (Session): Database session dependency.

    Returns:
        AssistantResponse: Updated assistant response.

    Raises:
        HTTPException: If the assistant does not exist.
    """
    record = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assistant '{assistant_id}' not found",
        )

    # [Mutual Exclusivity] Unmark previous default if this assistant is promoted to default
    if payload.is_default is True and not record.is_default:
        db.query(Assistant).filter(Assistant.is_default == True).update({"is_default": False})  # noqa: E712

    if payload.name is not None:
        record.name = payload.name.strip()
    if payload.description is not None:
        record.description = payload.description.strip() if payload.description else None
    if payload.avatar is not None:
        record.avatar = payload.avatar
    if payload.provider_id is not None:
        record.provider_id = payload.provider_id.strip().lower()
    if payload.model_name is not None:
        record.model_name = payload.model_name.strip()
    if payload.temperature is not None:
        record.temperature = payload.temperature
    if payload.max_tokens is not None:
        record.max_tokens = payload.max_tokens
    if payload.system_prompt is not None:
        record.system_prompt = payload.system_prompt.strip() if payload.system_prompt else None
    if payload.api_key is not None:
        if payload.api_key.strip():
            record.api_key_encrypted = encrypt_api_key(payload.api_key.strip())
        else:
            record.api_key_encrypted = None
    if payload.base_url is not None:
        record.base_url = payload.base_url.strip() if payload.base_url else None
    if payload.is_default is not None:
        record.is_default = payload.is_default
    if payload.tools is not None:
        record.tools = payload.tools

    db.commit()
    db.refresh(record)
    return _to_response(record)


@router.delete("/{assistant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assistant(
    assistant_id: str,
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Deletes an assistant by UUID identifier.

    Args:
        assistant_id (str): Target assistant identifier.
        db (Session): Database session dependency.

    Raises:
        HTTPException: If the assistant does not exist.
    """
    record = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assistant '{assistant_id}' not found",
        )

    db.delete(record)
    db.commit()
