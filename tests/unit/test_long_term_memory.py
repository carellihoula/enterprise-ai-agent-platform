"""Unit tests for long-term memory persistence, scored retrieval, and turn consolidation."""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from langchain_core.messages import AIMessage
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.database import Base
from app.engine.long_term_memory import (
    consolidate_turn_memories,
    format_long_term_memory_block,
    should_run_llm_consolidation,
)
from app.models.entities import Agent
from app.services.memory_service import MemoryService


def _make_memory_session() -> Session:
    """Creates an isolated in-memory SQLite session for long-term memory tests."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(bind=engine, class_=Session)
    return factory()


def test_memory_service_crud_and_scored_retrieval() -> None:
    """Verifies MemoryService CRUD and lexical+importance ranking on retrieval."""
    with _make_memory_session() as db:
        agent = Agent(name="Analyst", instructions="Be helpful", provider_id="groq")
        db.add(agent)
        db.commit()
        db.refresh(agent)

        service = MemoryService(db)
        m1 = service.create_memory(
            content="Main user table in Supabase is public.users.",
            memory_type="semantic",
            agent_id=agent.id,
            tags=["supabase", "users", "table"],
            importance=0.9,
        )
        service.create_memory(
            content="User likes concise French summaries.",
            memory_type="semantic",
            agent_id=agent.id,
            tags=["french", "style"],
            importance=0.6,
        )

        ranked = service.retrieve_relevant_memories(
            query="List users from supabase table", agent_id=agent.id, limit=2
        )
        assert len(ranked) == 2
        assert ranked[0].id == m1.id
        assert ranked[0].access_count == 1

        updated = service.update_memory(m1.id, content="Primary table is public.accounts.")
        assert updated.content == "Primary table is public.accounts."
        assert service.delete_memory(m1.id) is True


def test_format_long_term_memory_block_bounds() -> None:
    """Verifies `<long_term_memory>` formatting and max_chars truncation."""
    with _make_memory_session() as db:
        service = MemoryService(db)
        m1 = service.create_memory(content="Fact A", memory_type="semantic")
        m2 = service.create_memory(content="Fact B " + ("z" * 300), memory_type="procedural")

        block = format_long_term_memory_block([m1, m2], max_chars=240)
        assert block is not None
        assert "<long_term_memory>" in block
        assert "Fact A" in block
        assert "Fact B" not in block


@pytest.mark.asyncio
async def test_consolidate_turn_memories_add_and_update() -> None:
    """Verifies LLM-driven ADD and UPDATE consolidation operations."""
    with _make_memory_session() as db:
        agent = Agent(name="Ops", instructions="Assist ops", provider_id="groq")
        db.add(agent)
        db.commit()
        db.refresh(agent)

        service = MemoryService(db)
        existing = service.create_memory(
            content="Default SQL limit is 5.",
            memory_type="procedural",
            agent_id=agent.id,
            importance=0.5,
        )

        ops_payload = json.dumps(
            [
                {
                    "op": "UPDATE",
                    "id": existing.id,
                    "type": "procedural",
                    "content": "Default SQL limit is 10.",
                    "tags": ["sql", "limit"],
                    "importance": 0.8,
                },
                {
                    "op": "ADD",
                    "type": "semantic",
                    "content": "User prefers responses in French.",
                    "tags": ["language", "french"],
                    "importance": 0.9,
                },
            ]
        )
        fake_chat_model = SimpleNamespace(
            ainvoke=AsyncMock(return_value=AIMessage(content=ops_payload))
        )
        fake_provider = SimpleNamespace(chat_model=fake_chat_model)

        applied = await consolidate_turn_memories(
            session_id="sess-1",
            agent_id=agent.id,
            user_text="Utilise toujours LIMIT 10 et réponds en français.",
            assistant_text="Compris, je vais appliquer LIMIT 10 et répondre en français.",
            recorded_steps=None,
            db=db,
            provider=fake_provider,
        )

        assert applied == 2
        all_mems = service.list_memories(agent_id=agent.id)
        contents = {m.content for m in all_mems}
        assert "Default SQL limit is 10." in contents
        assert "User prefers responses in French." in contents


def test_should_run_llm_consolidation_gating() -> None:
    """Verifies LLM consolidation only runs on durable signals, tool events, or batch cadence."""
    assert should_run_llm_consolidation("ok merci beaucoup !", [], message_count=2) is False
    assert (
        should_run_llm_consolidation("Quel temps fait-il a Paris ?", [], message_count=2) is False
    )
    assert (
        should_run_llm_consolidation("Retiens que j'utilise Postgres.", [], message_count=2) is True
    )
    assert (
        should_run_llm_consolidation("ok", [{"type": "tool_end", "ok": True}], message_count=2)
        is True
    )
    assert (
        should_run_llm_consolidation("Explique moi cette architecture.", [], message_count=8)
        is True
    )
