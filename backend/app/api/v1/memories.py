"""REST API endpoints for inspecting, creating, updating, and deleting agent memories."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.auth import AuthContext, require_permission
from app.core.database import get_db
from app.core.errors import DomainError
from app.core.permissions import Permission
from app.models.entities import AgentMemory
from app.models.memory import MemoryCreate, MemoryResponse, MemoryType, MemoryUpdate
from app.services.memory_service import MemoryService

router = APIRouter(prefix="/memories", tags=["memories"])


@router.get("", response_model=list[MemoryResponse], status_code=status.HTTP_200_OK)
def list_memories(
    ctx: Annotated[AuthContext, Depends(require_permission(Permission.MEMORIES_READ.value))],
    db: Annotated[Session, Depends(get_db)],
    agent_id: Annotated[str | None, Query()] = None,
    memory_type: Annotated[MemoryType | None, Query()] = None,
) -> list[MemoryResponse]:
    """Lists persisted long-term memories scoped to the active workspace."""
    query = db.query(AgentMemory).filter(AgentMemory.workspace_id == ctx.workspace_id)
    if agent_id is not None:
        query = query.filter(AgentMemory.agent_id == agent_id)
    if memory_type is not None:
        query = query.filter(AgentMemory.memory_type == memory_type)
    rows = query.order_by(AgentMemory.importance.desc(), AgentMemory.updated_at.desc()).all()
    return [MemoryResponse.model_validate(row) for row in rows]


@router.post("", response_model=MemoryResponse, status_code=status.HTTP_201_CREATED)
def create_memory(
    payload: MemoryCreate,
    ctx: Annotated[AuthContext, Depends(require_permission(Permission.MEMORIES_WRITE.value))],
    db: Annotated[Session, Depends(get_db)],
) -> MemoryResponse:
    """Creates a new persistent long-term memory entry inside the active workspace."""
    service = MemoryService(db)
    created = service.create_memory(
        content=payload.content,
        memory_type=payload.memory_type,
        agent_id=payload.agent_id,
        source_session_id=payload.source_session_id,
        tags=payload.tags,
        importance=payload.importance,
    )
    created.workspace_id = ctx.workspace_id
    created.user_id = ctx.user_id
    db.commit()
    db.refresh(created)
    return MemoryResponse.model_validate(created)


@router.patch("/{memory_id}", response_model=MemoryResponse, status_code=status.HTTP_200_OK)
def update_memory(
    memory_id: str,
    payload: MemoryUpdate,
    ctx: Annotated[AuthContext, Depends(require_permission(Permission.MEMORIES_WRITE.value))],
    db: Annotated[Session, Depends(get_db)],
) -> MemoryResponse:
    """Updates an existing long-term memory entry within the active workspace."""
    existing = (
        db.query(AgentMemory)
        .filter(AgentMemory.id == memory_id, AgentMemory.workspace_id == ctx.workspace_id)
        .first()
    )
    if not existing:
        raise DomainError(f"Memory '{memory_id}' not found", status_code=404)
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
    ctx: Annotated[AuthContext, Depends(require_permission(Permission.MEMORIES_WRITE.value))],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Deletes a long-term memory entry by UUID within the active workspace."""
    existing = (
        db.query(AgentMemory)
        .filter(AgentMemory.id == memory_id, AgentMemory.workspace_id == ctx.workspace_id)
        .first()
    )
    if not existing:
        raise DomainError(f"Memory '{memory_id}' not found", status_code=404)
    service = MemoryService(db)
    service.delete_memory(memory_id)
