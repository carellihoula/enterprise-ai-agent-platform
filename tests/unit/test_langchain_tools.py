"""Unit tests for LangChain tool adapters and the agent tool-calling loop."""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.database import Base
from app.engine.langchain_tools import build_langchain_tools_for_agent, run_agent_tool_loop
from app.models.entities import Agent, McpServer


def _make_memory_db() -> Session:
    """Creates an isolated in-memory SQLite session with all ORM tables initialized.

    Returns:
        Session: Active SQLAlchemy session for testing.
    """
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return session_local()


@pytest.mark.asyncio
async def test_build_langchain_tools_resolves_builtin_and_mcp() -> None:
    """Verifies builtin and enabled MCP tools on an Agent convert into StructuredTools."""
    db = _make_memory_db()
    try:
        mcp_row = McpServer(
            name="playwright",
            transport="stdio",
            command="npx",
            args=["-y", "@playwright/mcp@latest"],
            env={},
            headers={},
            extra={},
        )
        agent = Agent(
            name="Research Agent",
            instructions="Use tools when needed.",
            provider_id="openai",
            model_name="gpt-4o-mini",
            tools=[
                {"type": "builtin", "name": "calculator"},
                {"type": "mcp", "name": "playwright"},
            ],
        )
        db.add(mcp_row)
        db.add(agent)
        db.commit()

        fake_mcp_schemas = [
            {
                "name": "browser_navigate",
                "description": "Navigate to a URL.",
                "inputSchema": {
                    "type": "object",
                    "required": ["url"],
                    "properties": {"url": {"type": "string", "description": "Target URL"}},
                },
            }
        ]
        with patch(
            "app.engine.langchain_tools.list_mcp_tool_schemas",
            new=AsyncMock(return_value=fake_mcp_schemas),
        ):
            tools = await build_langchain_tools_for_agent(agent, db)

        tool_names = {t.name for t in tools}
        assert tool_names == {"calculator", "playwright__browser_navigate"}
    finally:
        db.close()


@pytest.mark.asyncio
async def test_run_agent_tool_loop_executes_tool_calls_and_streams_final_answer() -> None:
    """Verifies run_agent_tool_loop runs a tool_call round and emits lifecycle + token events."""
    db = _make_memory_db()
    try:
        agent = Agent(
            name="Math Agent",
            instructions="Calculate accurately.",
            provider_id="openai",
            model_name="gpt-4o-mini",
            tools=[{"type": "builtin", "name": "calculator"}],
        )
        tools = await build_langchain_tools_for_agent(agent, db)

        first_ai = AIMessage(
            content="",
            tool_calls=[
                {
                    "name": "calculator",
                    "args": {"expression": "6 * 7"},
                    "id": "call_1",
                    "type": "tool_call",
                }
            ],
        )
        second_ai = AIMessage(content="The result is 42.")

        bound_model = MagicMock()
        bound_model.ainvoke = AsyncMock(side_effect=[first_ai, second_ai])

        chat_model = MagicMock()
        chat_model.bind_tools = MagicMock(return_value=bound_model)

        events: list[dict[str, Any]] = []
        async for evt in run_agent_tool_loop(
            chat_model, [HumanMessage(content="What is 6 * 7?")], tools
        ):
            events.append(evt)

        assert [e["type"] for e in events] == ["tool_start", "tool_end", "token"]
        assert events[0]["tool_name"] == "calculator"
        assert events[1]["ok"] is True
        assert events[2]["delta_content"] == "The result is 42."

        # Verify ToolMessage was appended before the second model call
        second_call_messages = bound_model.ainvoke.call_args_list[1].args[0]
        tool_msg_payload = json.loads(str(second_call_messages[-1].content))
        assert tool_msg_payload["ok"] is True
        assert tool_msg_payload["result"]["result"] == 42
    finally:
        db.close()
