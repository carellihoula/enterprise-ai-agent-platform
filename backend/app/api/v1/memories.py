"""REST API endpoints for inspecting, creating, updating, and deleting agent memories."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.memory import MemoryCreate, MemoryResponse, MemoryType, MemoryUpdate
from app.services.memory_service import MemoryService

router = APIRouter(prefix="/memories", tags=["memories"])


@router.get("", response_model=list[MemoryResponse], status_code=status.HTTP_200_OK)
def list_memories(
    db: Annotated[Session, Depends(get_db)],
    agent_id: Annotated[str | None, Query()] = None,
    memory_type: Annotated[MemoryType | None, Query()] = None,
) -> list[MemoryResponse]:
    """Lists persisted long-term memories with optional agent and category filters.

    Args:
        db (Session): Database session dependency.
        agent_id (str | None, optional): Filter memories by Agent UUID.
        memory_type (MemoryType | None, optional): Filter by category.

    Returns:
        list[MemoryResponse]: Ordered list of persisted long-term memories.
    """
    service = MemoryService(db)
    rows = service.list_memories(agent_id=agent_id, memory_type=memory_type)
    return [MemoryResponse.model_validate(row) for row in rows]


@router.post("", response_model=MemoryResponse, status_code=status.HTTP_201_CREATED)
def create_memory(
    payload: MemoryCreate,
    db: Annotated[Session, Depends(get_db)],
) -> MemoryResponse:
    """Creates a new persistent long-term memory entry manually.

    Args:
        payload (MemoryCreate): Memory creation payload.
        db (Session): Database session dependency.

    Returns:
        MemoryResponse: Newly persisted memory entry.
    """
    service = MemoryService(db)
    created = service.create_memory(
        content=payload.content,
        memory_type=payload.memory_type,
        agent_id=payload.agent_id,
        source_session_id=payload.source_session_id,
        tags=payload.tags,
        importance=payload.importance,
    )
    return MemoryResponse.model_validate(created)


@router.patch("/{memory_id}", response_model=MemoryResponse, status_code=status.HTTP_200_OK)
def update_memory(
    memory_id: str,
    payload: MemoryUpdate,
    db: Annotated[Session, Depends(get_db)],
) -> MemoryResponse:
    """Updates an existing long-term memory entry.

    Args:
        memory_id (str): Target memory UUID string.
        payload (MemoryUpdate): Fields to update.
        db (Session): Database session dependency.

    Returns:
        MemoryResponse: Updated memory entry.
    """
    service = MemoryService(db)
    updated = service.update_memory(
        memory_id=memory_id,
        content=payload.content,
        memory_type=payload.memory_type,
        tags=payload.tags,
        importance=payload.importance,
    )
    return MemoryResponse.model_validate(updated)


@router.delete("/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_memory(
    memory_id: str,
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Deletes a long-term memory entry by UUID.

    Args:
        memory_id (str): Target memory UUID string.
        db (Session): Database session dependency.
    """
    service = MemoryService(db)
    service.delete_memory(memory_id)
