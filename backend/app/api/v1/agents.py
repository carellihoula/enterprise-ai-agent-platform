"""API endpoints for managing Enterprise AI Agent configurations.

This module provides FastAPI routes for creating, listing, retrieving, updating, and deleting
Enterprise AI Agents, serving as the central registry for autonomous agents, knowledge bases, and tools.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decrypt_api_key, encrypt_api_key, mask_api_key
from app.models.agent import (
    AgentCreate,
    AgentResponse,
    AgentUpdate,
    KnowledgeSource,
    ModelSpec,
)
from app.models.entities import Agent

router = APIRouter(prefix="/agents", tags=["Agents"])


def _to_response(agent: Agent) -> AgentResponse:
    """Converts an Agent ORM entity into a public AgentResponse schema with masked credentials.

    Args:
        agent (Agent): Database ORM entity.

    Returns:
        AgentResponse: Public response schema with masked API key credentials.
    """
    plain_key = decrypt_api_key(agent.api_key_encrypted) if agent.api_key_encrypted else None
    masked_key = mask_api_key(plain_key)

    # [Model Packaging] Synthesize nested ModelSpec schema from flattened database columns
    model_spec = ModelSpec(
        provider_id=agent.provider_id,
        model_name=agent.model_name,
        temperature=agent.temperature,
        max_tokens=agent.max_tokens,
        base_url=agent.base_url,
        api_key=masked_key,
    )

    # [Knowledge Formatting] Parse raw JSON dicts into validated KnowledgeSource instances
    knowledge_sources = [
        KnowledgeSource(**k) if isinstance(k, dict) else k for k in (agent.knowledge or [])
    ]

    return AgentResponse(
        id=agent.id,
        name=agent.name,
        description=agent.description,
        instructions=agent.instructions,
        avatar=agent.avatar,
        model=model_spec,
        tools=agent.tools or [],
        knowledge=knowledge_sources,
        policies=agent.policies or {},
        is_default=agent.is_default,
        has_api_key=bool(agent.api_key_encrypted),
        created_at=agent.created_at,
        updated_at=agent.updated_at,
    )


@router.get("", response_model=list[AgentResponse], status_code=status.HTTP_200_OK)
def list_agents(db: Annotated[Session, Depends(get_db)]) -> list[AgentResponse]:
    """Retrieves all registered agents ordered by default status and creation date.

    Args:
        db (Session): Database session dependency.

    Returns:
        list[AgentResponse]: Array of all configured agent schemas.
    """
    # [Query] Return agents ordered by default flag first, then creation timestamp
    records = db.query(Agent).order_by(Agent.is_default.desc(), Agent.created_at.asc()).all()
    return [_to_response(record) for record in records]


@router.post("", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
def create_agent(
    payload: AgentCreate,
    db: Annotated[Session, Depends(get_db)],
) -> AgentResponse:
    """Creates a new custom Enterprise AI Agent configuration.

    Args:
        payload (AgentCreate): Creation payload data.
        db (Session): Database session dependency.

    Returns:
        AgentResponse: Newly persisted agent response with masked credentials.
    """
    # [Mutual Exclusivity] Unmark previous default if new agent is marked as default
    if payload.is_default:
        db.query(Agent).filter(Agent.is_default == True).update({"is_default": False})  # noqa: E712

    encrypted_key = (
        encrypt_api_key(payload.model.api_key.strip())
        if payload.model.api_key and payload.model.api_key.strip()
        else None
    )

    # [Serialization] Convert knowledge source models to raw JSON dictionaries for storage
    serialized_knowledge = [
        k.model_dump() if hasattr(k, "model_dump") else k for k in payload.knowledge
    ]

    record = Agent(
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        avatar=payload.avatar or "Bot",
        instructions=payload.instructions.strip(),
        provider_id=payload.model.provider_id.strip().lower(),
        model_name=payload.model.model_name.strip(),
        temperature=payload.model.temperature,
        max_tokens=payload.model.max_tokens,
        api_key_encrypted=encrypted_key,
        base_url=payload.model.base_url.strip() if payload.model.base_url else None,
        is_default=payload.is_default,
        tools=payload.tools,
        knowledge=serialized_knowledge,
        policies=payload.policies,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return _to_response(record)


@router.get("/{agent_id}", response_model=AgentResponse, status_code=status.HTTP_200_OK)
def get_agent(
    agent_id: str,
    db: Annotated[Session, Depends(get_db)],
) -> AgentResponse:
    """Retrieves an existing agent configuration by UUID.

    Args:
        agent_id (str): Primary key UUID of the agent.
        db (Session): Database session dependency.

    Returns:
        AgentResponse: Found agent entity response.

    Raises:
        HTTPException: If the agent is not found.
    """
    record = db.query(Agent).filter(Agent.id == agent_id).first()
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent '{agent_id}' not found",
        )
    return _to_response(record)


@router.put("/{agent_id}", response_model=AgentResponse, status_code=status.HTTP_200_OK)
def update_agent(
    agent_id: str,
    payload: AgentUpdate,
    db: Annotated[Session, Depends(get_db)],
) -> AgentResponse:
    """Updates an existing agent configuration.

    Args:
        agent_id (str): Primary key UUID of the agent to update.
        payload (AgentUpdate): Partial update payload.
        db (Session): Database session dependency.

    Returns:
        AgentResponse: Updated agent response.

    Raises:
        HTTPException: If the agent is not found.
    """
    record = db.query(Agent).filter(Agent.id == agent_id).first()
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent '{agent_id}' not found",
        )

    if payload.is_default is True:
        db.query(Agent).filter(Agent.is_default == True).update({"is_default": False})  # noqa: E712
        record.is_default = True
    elif payload.is_default is False:
        record.is_default = False

    if payload.name is not None:
        record.name = payload.name.strip()
    if payload.description is not None:
        record.description = payload.description.strip() or None
    if payload.instructions is not None:
        record.instructions = payload.instructions.strip()
    if payload.avatar is not None:
        record.avatar = payload.avatar.strip() or "Bot"

    # [Model Attributes] Apply nested model configuration updates if provided
    if payload.model is not None:
        if payload.model.provider_id:
            record.provider_id = payload.model.provider_id.strip().lower()
        if payload.model.model_name:
            record.model_name = payload.model.model_name.strip()
        record.temperature = payload.model.temperature
        record.max_tokens = payload.model.max_tokens
        if payload.model.base_url is not None:
            record.base_url = payload.model.base_url.strip() or None
        if payload.model.api_key is not None:
            if payload.model.api_key.strip():
                record.api_key_encrypted = encrypt_api_key(payload.model.api_key.strip())
            else:
                record.api_key_encrypted = None

    if payload.tools is not None:
        record.tools = payload.tools
    if payload.knowledge is not None:
        record.knowledge = [k.model_dump() for k in payload.knowledge]
    if payload.policies is not None:
        record.policies = payload.policies

    db.commit()
    db.refresh(record)

    return _to_response(record)


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent(
    agent_id: str,
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Deletes an agent configuration permanently.

    Args:
        agent_id (str): Primary key UUID of the agent to delete.
        db (Session): Database session dependency.

    Raises:
        HTTPException: If the agent is not found.
    """
    record = db.query(Agent).filter(Agent.id == agent_id).first()
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent '{agent_id}' not found",
        )

    db.delete(record)
    db.commit()
