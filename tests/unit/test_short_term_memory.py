"""Unit tests for short-term memory sliding window, observation compaction, and rolling summary."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.database import Base
from app.engine.short_term_memory import (
    build_short_term_context,
    compact_old_tool_observations,
    compress_tool_output,
    extract_working_state_updates,
    maybe_update_rolling_summary,
    resolve_history_token_budget,
)
from app.providers.llm.base import ChatMessage, MessageRole
from app.services.session_service import SessionService


def test_build_short_term_context_with_summary_and_budget() -> None:
    """Verifies rolling summary injection, covered-message slicing, and budget trimming."""
    historical = [ChatMessage(role=MessageRole.USER, content=f"old-{i}") for i in range(4)] + [
        ChatMessage(role=MessageRole.USER, content="recent-1-" + ("x" * 60)),
        ChatMessage(role=MessageRole.ASSISTANT, content="recent-2-" + ("y" * 60)),
        ChatMessage(role=MessageRole.USER, content="recent-3"),
    ]
    request_msgs = [ChatMessage(role=MessageRole.USER, content="new-question")]

    ctx = build_short_term_context(
        historical_messages=historical,
        request_messages=request_msgs,
        rolling_summary="User wants to audit users table.",
        summary_message_count=4,
        max_history_tokens=30,
        min_recent_messages=2,
    )

    assert ctx[0].role == MessageRole.SYSTEM
    assert "<conversation_summary>" in ctx[0].content
    assert "User wants to audit users table." in ctx[0].content
    # [Assertion] Oldest unsummarized message (recent-1) trimmed by budget, last 2 + request kept
    contents = [m.content for m in ctx[1:]]
    assert not any(c.startswith("old-") for c in contents)
    assert not any(c.startswith("recent-1-") for c in contents)
    assert contents[-1] == "new-question"
    assert len(contents) == 3


def test_compact_old_tool_observations_preserves_recent_rounds() -> None:
    """Verifies stale bulky ToolMessages are compacted while recent rounds stay verbatim."""
    stale_payload = "A" * 1200
    recent_payload = "B" * 1200
    messages = [
        HumanMessage(content="Inspect DB"),
        AIMessage(content="", tool_calls=[{"id": "c1", "name": "t1", "args": {}}]),
        ToolMessage(content=stale_payload, tool_call_id="c1", name="t1"),
        AIMessage(content="", tool_calls=[{"id": "c2", "name": "t2", "args": {}}]),
        ToolMessage(content=recent_payload, tool_call_id="c2", name="t2"),
        AIMessage(content="", tool_calls=[{"id": "c3", "name": "t3", "args": {}}]),
        ToolMessage(content=recent_payload, tool_call_id="c3", name="t3"),
    ]

    compacted = compact_old_tool_observations(
        messages, keep_recent_tool_rounds=2, max_stale_chars=200
    )

    assert isinstance(compacted[2], ToolMessage)
    assert len(str(compacted[2].content)) < 300
    assert "older tool observation compacted" in str(compacted[2].content)
    # [Assertion] Last two tool rounds remain completely intact
    assert isinstance(compacted[4], ToolMessage)
    assert compacted[4].content == recent_payload
    assert isinstance(compacted[6], ToolMessage)
    assert compacted[6].content == recent_payload


@pytest.mark.asyncio
async def test_maybe_update_rolling_summary_incremental() -> None:
    """Verifies rolling summary compresses aged messages and updates summary_message_count."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(bind=engine, class_=Session)

    with session_factory() as db:
        service = SessionService(db)
        conv = service.create_session(title="Memory Test")
        for idx in range(6):
            role = "user" if idx % 2 == 0 else "assistant"
            service.add_message(conv.id, role, f"turn-{idx}-" + ("x" * 120))

        fake_chat_model = SimpleNamespace(
            ainvoke=AsyncMock(return_value=AIMessage(content="- Condensed summary of turns 0-3"))
        )
        fake_provider = SimpleNamespace(chat_model=fake_chat_model)

        # [Assertion] Below window budget -> no summary triggered
        skipped = await maybe_update_rolling_summary(
            session_id=conv.id,
            db=db,
            provider=fake_provider,
            max_history_tokens=5000,
            keep_recent=2,
        )
        assert skipped is None

        # [Assertion] Exceeding window budget -> summarizes aged messages while keeping recent 2
        summary = await maybe_update_rolling_summary(
            session_id=conv.id,
            db=db,
            provider=fake_provider,
            max_history_tokens=100,
            keep_recent=2,
        )

        assert summary == "- Condensed summary of turns 0-3"
        refreshed = service.get_session(conv.id)
        assert refreshed.rolling_summary == "- Condensed summary of turns 0-3"
        assert refreshed.summary_message_count == 4


def test_compress_tool_output_tabular_and_ceiling() -> None:
    """Verifies list-of-dict JSON converts to compact tabular JSON and respects max_chars."""
    rows = [{"id": i, "email": f"user{i}@example.com", "role": "member"} for i in range(25)]
    raw_json = __import__("json").dumps(rows, indent=2)

    compressed = compress_tool_output(raw_json, max_chars=12000)
    parsed = __import__("json").loads(compressed)
    assert parsed["columns"] == ["id", "email", "role"]
    assert parsed["total_rows"] == 25
    assert len(parsed["rows"]) == 25
    assert len(compressed) < len(raw_json)

    # [Assertion] Enforces ceiling when payload exceeds max_chars
    huge_rows = [{"id": i, "payload": "x" * 600} for i in range(40)]
    capped = compress_tool_output(__import__("json").dumps(huge_rows), max_chars=12000)
    assert len(capped) <= 12200


def test_resolve_history_token_budget_and_working_state() -> None:
    """Verifies fixed-window sentinel subtracts overhead and working_state injects cleanly."""
    heavy_overhead_budget = resolve_history_token_budget(
        system_prompt="x" * 24000,
    )
    light_overhead_budget = resolve_history_token_budget(
        system_prompt="x" * 400,
    )
    assert light_overhead_budget > heavy_overhead_budget

    state = extract_working_state_updates(
        [
            {
                "type": "tool_end",
                "tool_name": "supabase__list_tables",
                "ok": True,
                "output": "users",
            },
            {
                "type": "tool_end",
                "tool_name": "supabase__execute_sql",
                "ok": False,
                "output": "bad",
            },
        ]
    )
    assert state["verified_tools"] == ["supabase__list_tables"]
    assert "supabase__execute_sql: bad" in state["recent_tool_errors"]

    ctx = build_short_term_context(
        historical_messages=[],
        request_messages=[ChatMessage(role=MessageRole.USER, content="hi")],
        working_state=state,
    )
    assert "<working_state>" in ctx[0].content
    assert "supabase__list_tables" in ctx[0].content
