"""API endpoints for managing dynamic LLM provider configurations.

This module provides endpoints for persisting, retrieving, and updating model lists,
sampling parameters, system prompts, and encrypted API key credentials for each provider.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decrypt_api_key, encrypt_api_key, mask_api_key
from app.models.entities import ProviderConfig

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/providers", tags=["Providers"])


class ProviderConfigPayload(BaseModel):
    """Request payload schema for creating or updating provider configuration.

    Attributes:
        models (list[str]): List of model identifiers configured for this provider.
        active_model (str | None): Selected active model name.
        temperature (float): Sampling temperature value between 0.0 and 2.0.
        system_prompt (str | None): Optional custom system prompt instructions.
        api_key (str | None): Plaintext API key to encrypt and save. Empty string clears existing key. None preserves it.
        base_url (str | None): Optional custom base URL endpoint (e.g. for Ollama or vLLM).
    """

    models: list[str] = Field(default_factory=list, description="Configured model identifiers")
    active_model: str | None = Field(default=None, description="Active model identifier")
    temperature: float = Field(default=0.7, ge=0.0, le=2.0, description="Sampling temperature")
    system_prompt: str | None = Field(default=None, description="System instructions prompt")
    api_key: str | None = Field(default=None, description="Optional plaintext API key to encrypt")
    base_url: str | None = Field(default=None, description="Optional custom base URL")


class ProviderConfigResponse(BaseModel):
    """Response schema for provider configuration with masked credentials.

    Attributes:
        provider_id (str): Canonical provider identifier (e.g. 'gemini', 'openai', 'anthropic', 'custom').
        models (list[str]): Persisted list of model identifiers.
        active_model (str | None): Currently active model name.
        temperature (float): Configured sampling temperature.
        system_prompt (str | None): Configured system prompt.
        masked_api_key (str | None): Safe masked representation of the API key (e.g. 'sk-proj...1a2b').
        has_api_key (bool): Whether an encrypted API key is securely persisted in database.
        base_url (str | None): Configured custom base URL endpoint.
        updated_at (str | None): ISO timestamp string of last modification.
    """

    provider_id: str = Field(description="Canonical provider identifier")
    models: list[str] = Field(default_factory=list, description="Configured model identifiers")
    active_model: str | None = Field(default=None, description="Active model identifier")
    temperature: float = Field(default=0.7, description="Sampling temperature")
    system_prompt: str | None = Field(default=None, description="System instructions prompt")
    masked_api_key: str | None = Field(default=None, description="Masked API key representation")
    has_api_key: bool = Field(default=False, description="Whether API key is persisted")
    base_url: str | None = Field(default=None, description="Custom base URL")
    updated_at: str | None = Field(default=None, description="Last update timestamp")


def _to_response(config: ProviderConfig) -> ProviderConfigResponse:
    """Converts a ProviderConfig ORM entity into a public ProviderConfigResponse schema.

    Args:
        config (ProviderConfig): Database ORM entity.

    Returns:
        ProviderConfigResponse: Public schema with masked API key.
    """
    plain_key = decrypt_api_key(config.api_key_encrypted) if config.api_key_encrypted else None
    return ProviderConfigResponse(
        provider_id=config.provider_id,
        models=config.models or [],
        active_model=config.active_model,
        temperature=config.temperature,
        system_prompt=config.system_prompt,
        masked_api_key=mask_api_key(plain_key),
        has_api_key=bool(config.api_key_encrypted),
        base_url=config.base_url,
        updated_at=config.updated_at.isoformat() if config.updated_at else None,
    )


@router.get("/config", response_model=list[ProviderConfigResponse])
def get_all_provider_configs(
    db: Annotated[Session, Depends(get_db)],
) -> list[ProviderConfigResponse]:
    """Retrieves all persisted provider configurations.

    Args:
        db (Session): Database session dependency.

    Returns:
        list[ProviderConfigResponse]: List of provider configurations with masked credentials.
    """
    records = db.query(ProviderConfig).all()
    return [_to_response(record) for record in records]


@router.get("/config/{provider_id}", response_model=ProviderConfigResponse)
def get_provider_config(
    provider_id: str,
    db: Annotated[Session, Depends(get_db)],
) -> ProviderConfigResponse:
    """Retrieves configuration for a specific provider by identifier.

    Args:
        provider_id (str): Identifier of the target provider (e.g. 'gemini', 'openai').
        db (Session): Database session dependency.

    Returns:
        ProviderConfigResponse: Provider configuration record or empty default schema.
    """
    normalized_id = provider_id.lower().strip()
    record = db.query(ProviderConfig).filter(ProviderConfig.provider_id == normalized_id).first()

    if not record:
        # [Fallback] Return clean empty structure if provider has not yet been persisted
        return ProviderConfigResponse(
            provider_id=normalized_id,
            models=[],
            active_model=None,
            temperature=0.7,
            system_prompt=None,
            masked_api_key=None,
            has_api_key=False,
            base_url=None,
            updated_at=None,
        )

    return _to_response(record)


@router.put("/config/{provider_id}", response_model=ProviderConfigResponse)
def save_provider_config(
    provider_id: str,
    payload: ProviderConfigPayload,
    db: Annotated[Session, Depends(get_db)],
) -> ProviderConfigResponse:
    """Persists or updates configuration, models, parameters, and encrypted credentials for a provider.

    Args:
        provider_id (str): Identifier of the provider to configure.
        payload (ProviderConfigPayload): Configuration parameters and optional plaintext key.
        db (Session): Database session dependency.

    Returns:
        ProviderConfigResponse: Updated configuration record.

    Raises:
        HTTPException: If an unexpected persistence error occurs.
    """
    normalized_id = provider_id.lower().strip()
    record = db.query(ProviderConfig).filter(ProviderConfig.provider_id == normalized_id).first()

    # [Encryption] Handle API key persistence logic
    encrypted_key: str | None = None
    if payload.api_key is not None:
        if payload.api_key.strip():
            # [Security] Encrypt plaintext key with Fernet AES before storing in database
            encrypted_key = encrypt_api_key(payload.api_key.strip())
        else:
            # [Clear Key] Empty string explicitly removes the saved key
            encrypted_key = None
    elif record:
        # [Preserve] Retain existing encrypted key if payload.api_key is None
        encrypted_key = record.api_key_encrypted

    if not record:
        # [Creation] Insert new provider configuration record
        record = ProviderConfig(
            id=normalized_id,
            provider_id=normalized_id,
            models=payload.models,
            active_model=payload.active_model,
            temperature=payload.temperature,
            system_prompt=payload.system_prompt,
            api_key_encrypted=encrypted_key,
            base_url=payload.base_url,
        )
        db.add(record)
    else:
        # [Update] Update existing provider configuration attributes
        record.models = payload.models
        record.active_model = payload.active_model
        record.temperature = payload.temperature
        record.system_prompt = payload.system_prompt
        record.api_key_encrypted = encrypted_key
        record.base_url = payload.base_url

    db.commit()
    db.refresh(record)

    logger.info(
        "Persisted provider configuration for '%s' with %d models",
        normalized_id,
        len(record.models),
    )
    return _to_response(record)
