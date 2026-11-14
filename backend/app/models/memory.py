"""Pydantic schemas for long-term agent memory CRUD API endpoints."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

MemoryType = Literal["semantic", "episodic", "procedural"]


class MemoryCreate(BaseModel):
    """Request payload for creating a persistent long-term memory entry.

    Attributes:
        content (str): Concise atomic memory fact, preference, or procedural lesson.
        memory_type (MemoryType): Category (`semantic`, `episodic`, or `procedural`).
        agent_id (str | None): Optional Agent UUID scoping the memory.
        source_session_id (str | None): Optional originating session UUID.
        tags (list[str]): Optional keywords/tags for lexical retrieval.
        importance (float): Salience score in `[0.0, 1.0]`.
    """

    content: str = Field(..., min_length=1, max_length=2000)
    memory_type: MemoryType = Field(default="semantic")
    agent_id: str | None = Field(default=None)
    source_session_id: str | None = Field(default=None)
    tags: list[str] = Field(default_factory=list)
    importance: float = Field(default=0.5, ge=0.0, le=1.0)


class MemoryUpdate(BaseModel):
    """Request payload for updating an existing long-term memory entry.

    Attributes:
        content (str | None): Updated memory text.
        memory_type (MemoryType | None): Updated category.
        tags (list[str] | None): Updated tag list.
        importance (float | None): Updated salience score in `[0.0, 1.0]`.
    """

    content: str | None = Field(default=None, min_length=1, max_length=2000)
    memory_type: MemoryType | None = Field(default=None)
    tags: list[str] | None = Field(default=None)
    importance: float | None = Field(default=None, ge=0.0, le=1.0)


class MemoryResponse(BaseModel):
    """Serialized long-term memory entry returned by REST endpoints."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    agent_id: str | None
    source_session_id: str | None
    memory_type: str
    content: str
    tags: list[str]
    importance: float
    access_count: int
    last_accessed_at: datetime | None
    created_at: datetime
    updated_at: datetime
