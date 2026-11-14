"""Service layer for persistent long-term agent memory management and retrieval."""

from __future__ import annotations

import re
from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.errors import DomainError
from app.models.entities import AgentMemory, current_utc_time

_TOKEN_RE = re.compile(r"[a-zA-Z0-9_\u00C0-\u017F]{2,}")


def _tokenize(text: str) -> set[str]:
    """Extracts normalized lowercase lexical tokens for relevance matching.

    Args:
        text (str): Input query or memory content.

    Returns:
        set[str]: Set of normalized lowercase tokens.
    """
    return {tok.lower() for tok in _TOKEN_RE.findall(text or "")}


def _score_memory(
    memory: AgentMemory,
    query_tokens: set[str],
    now: datetime,
) -> float:
    """Computes a composite relevance score from lexical overlap, importance, and recency.

    Args:
        memory (AgentMemory): Candidate long-term memory ORM record.
        query_tokens (set[str]): Normalized tokens extracted from the current user query.
        now (datetime): Reference UTC timestamp for recency decay.

    Returns:
        float: Composite ranking score (higher is more relevant).
    """
    mem_text = f"{memory.content} {' '.join(memory.tags or [])}"
    mem_tokens = _tokenize(mem_text)
    if query_tokens and mem_tokens:
        overlap = len(query_tokens & mem_tokens) / max(len(query_tokens), 1)
    else:
        overlap = 0.0

    updated = memory.updated_at or memory.created_at or now
    if updated.tzinfo is None:
        updated = updated.replace(tzinfo=UTC)
    age_days = max((now - updated).total_seconds() / 86400.0, 0.0)
    recency = 1.0 / (1.0 + (age_days / 14.0))

    importance = max(0.0, min(float(memory.importance), 1.0))
    # [Ranking] Favor lexical match first, then importance and recency
    return (overlap * 2.0) + (importance * 0.8) + (recency * 0.4)


class MemoryService:
    """Service encapsulating CRUD and scored retrieval for `AgentMemory` records.

    Attributes:
        db (Session): Active SQLAlchemy database session.
    """

    def __init__(self, db: Session) -> None:
        self.db = db

    def list_memories(
        self,
        agent_id: str | None = None,
        memory_type: str | None = None,
        include_global: bool = False,
    ) -> Sequence[AgentMemory]:
        """Lists persisted long-term memories filtered by optional agent and type.

        Args:
            agent_id (str | None, optional): Filter to a specific agent UUID.
            memory_type (str | None, optional): Filter by category (`semantic`, `episodic`,
                `procedural`).
            include_global (bool, optional): When True with `agent_id`, also include global
                memories where `agent_id` is None. Defaults to False.

        Returns:
            Sequence[AgentMemory]: Matching memories ordered by most recently updated.
        """
        query = self.db.query(AgentMemory)
        if agent_id is not None:
            if include_global:
                query = query.filter(
                    or_(AgentMemory.agent_id == agent_id, AgentMemory.agent_id.is_(None))
                )
            else:
                query = query.filter(AgentMemory.agent_id == agent_id)
        if memory_type is not None:
            query = query.filter(AgentMemory.memory_type == memory_type)
        return query.order_by(AgentMemory.updated_at.desc()).all()

    def get_memory(self, memory_id: str) -> AgentMemory:
        """Retrieves a single long-term memory entry by UUID.

        Args:
            memory_id (str): Target memory UUID string identifier.

        Returns:
            AgentMemory: Matching ORM memory instance.

        Raises:
            DomainError: If no memory exists with the given identifier.
        """
        memory = self.db.query(AgentMemory).filter(AgentMemory.id == memory_id).first()
        if not memory:
            raise DomainError(
                message=f"Memory '{memory_id}' not found.",
                error_code="MEMORY_NOT_FOUND",
                status_code=404,
            )
        return memory

    def create_memory(
        self,
        content: str,
        memory_type: str = "semantic",
        agent_id: str | None = None,
        source_session_id: str | None = None,
        tags: list[str] | None = None,
        importance: float = 0.5,
    ) -> AgentMemory:
        """Persists a new long-term memory entry.

        Args:
            content (str): Concise atomic memory text.
            memory_type (str, optional): Category (`semantic`, `episodic`, `procedural`).
                Defaults to `"semantic"`.
            agent_id (str | None, optional): Optional Agent UUID scoping the memory.
            source_session_id (str | None, optional): Optional originating session UUID.
            tags (list[str] | None, optional): Keywords for lexical retrieval.
            importance (float, optional): Salience score in `[0.0, 1.0]`. Defaults to 0.5.

        Returns:
            AgentMemory: Newly created ORM memory instance.
        """
        memory = AgentMemory(
            agent_id=agent_id,
            source_session_id=source_session_id,
            memory_type=memory_type,
            content=content.strip(),
            tags=[str(t).strip().lower() for t in (tags or []) if str(t).strip()],
            importance=max(0.0, min(float(importance), 1.0)),
        )
        self.db.add(memory)
        self.db.commit()
        self.db.refresh(memory)
        return memory

    def update_memory(
        self,
        memory_id: str,
        content: str | None = None,
        memory_type: str | None = None,
        tags: list[str] | None = None,
        importance: float | None = None,
    ) -> AgentMemory:
        """Updates fields on an existing long-term memory entry.

        Args:
            memory_id (str): Target memory UUID string.
            content (str | None, optional): Updated memory text.
            memory_type (str | None, optional): Updated category.
            tags (list[str] | None, optional): Updated tag list.
            importance (float | None, optional): Updated importance score.

        Returns:
            AgentMemory: Updated ORM memory instance.

        Raises:
            DomainError: If no memory exists with the given identifier.
        """
        memory = self.get_memory(memory_id)
        if content is not None:
            memory.content = content.strip()
        if memory_type is not None:
            memory.memory_type = memory_type
        if tags is not None:
            memory.tags = [str(t).strip().lower() for t in tags if str(t).strip()]
        if importance is not None:
            memory.importance = max(0.0, min(float(importance), 1.0))
        memory.updated_at = current_utc_time()
        self.db.commit()
        self.db.refresh(memory)
        return memory

    def delete_memory(self, memory_id: str) -> bool:
        """Deletes a long-term memory entry by UUID.

        Args:
            memory_id (str): Target memory UUID string.

        Returns:
            bool: True when deleted successfully.

        Raises:
            DomainError: If no memory exists with the given identifier.
        """
        memory = self.get_memory(memory_id)
        self.db.delete(memory)
        self.db.commit()
        return True

    def _fetch_bounded_candidates(
        self,
        query: str,
        agent_id: str | None = None,
        include_global: bool = True,
        pool_limit: int = 80,
    ) -> list[AgentMemory]:
        """Fetches a bounded candidate pool from SQL using lexical pre-filters and salience order.

        Args:
            query (str): Query text used to build SQL ILIKE pre-filter clauses.
            agent_id (str | None, optional): Active agent UUID.
            include_global (bool, optional): Include global (`agent_id IS NULL`) memories.
            pool_limit (int, optional): Maximum total candidates loaded from SQL. Defaults to 80.

        Returns:
            list[AgentMemory]: Deduplicated bounded list of candidate memories.
        """
        base = self.db.query(AgentMemory)
        if agent_id is not None:
            if include_global:
                base = base.filter(
                    or_(AgentMemory.agent_id == agent_id, AgentMemory.agent_id.is_(None))
                )
            else:
                base = base.filter(AgentMemory.agent_id == agent_id)

        query_tokens = sorted(_tokenize(query), key=len, reverse=True)[:5]
        by_id: dict[str, AgentMemory] = {}

        if query_tokens:
            lexical_filters = [AgentMemory.content.ilike(f"%{tok}%") for tok in query_tokens]
            lexical_rows = (
                base.filter(or_(*lexical_filters))
                .order_by(AgentMemory.importance.desc(), AgentMemory.updated_at.desc())
                .limit(pool_limit // 2)
                .all()
            )
            for row in lexical_rows:
                by_id[row.id] = row

        salient_rows = (
            base.order_by(AgentMemory.importance.desc(), AgentMemory.updated_at.desc())
            .limit(pool_limit)
            .all()
        )
        for row in salient_rows:
            if len(by_id) >= pool_limit:
                break
            by_id.setdefault(row.id, row)

        return list(by_id.values())

    def find_candidate_memories_for_update(
        self,
        agent_id: str | None,
        query_text: str,
        limit: int = 10,
    ) -> list[AgentMemory]:
        """Selects the closest existing agent memories for targeted deduplication/consolidation.

        Args:
            agent_id (str | None): Agent UUID scoping the memories.
            query_text (str): Current turn text used to find related memories.
            limit (int, optional): Maximum candidates returned. Defaults to 10.

        Returns:
            list[AgentMemory]: Top related existing memories for this agent.
        """
        candidates = self._fetch_bounded_candidates(
            query=query_text,
            agent_id=agent_id,
            include_global=False,
            pool_limit=40,
        )
        if not candidates:
            return []
        query_tokens = _tokenize(query_text)
        now = current_utc_time()
        return sorted(
            candidates,
            key=lambda m: _score_memory(m, query_tokens, now),
            reverse=True,
        )[: max(1, limit)]

    def retrieve_relevant_memories(
        self,
        query: str,
        agent_id: str | None = None,
        limit: int = 6,
    ) -> list[AgentMemory]:
        """Retrieves and ranks the most relevant long-term memories for a user query.

        Args:
            query (str): Current user message text used for lexical relevance scoring.
            agent_id (str | None, optional): Active agent UUID (includes global memories).
            limit (int, optional): Maximum number of memories returned. Defaults to 6.

        Returns:
            list[AgentMemory]: Top-ranked long-term memories with refreshed access stats.
        """
        candidates = self._fetch_bounded_candidates(
            query=query,
            agent_id=agent_id,
            include_global=agent_id is not None,
            pool_limit=80,
        )
        if not candidates:
            return []

        query_tokens = _tokenize(query)
        now = current_utc_time()
        scored = sorted(
            candidates,
            key=lambda m: _score_memory(m, query_tokens, now),
            reverse=True,
        )
        selected = scored[: max(1, limit)]

        for mem in selected:
            mem.access_count = (mem.access_count or 0) + 1
            mem.last_accessed_at = now
        self.db.commit()
        return selected
