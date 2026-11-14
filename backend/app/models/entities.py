"""Relational database entity models for conversation sessions and message history.

This module defines the SQLAlchemy ORM models representing persistent chat sessions
and individual messages within a conversation history.
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def generate_uuid() -> str:
    """Generates a string representation of a random UUID.

    Returns:
        str: Random UUID string identifier.
    """
    return str(uuid.uuid4())


def current_utc_time() -> datetime:
    """Generates a timezone-aware current UTC datetime.

    Returns:
        datetime: Current UTC timestamp.
    """
    return datetime.now(UTC)


class Agent(Base):
    """SQLAlchemy ORM model representing an Enterprise AI Agent.

    Attributes:
        id (str): Primary key UUID string identifier.
        name (str): Display name of the agent (e.g., 'Jira Triage Agent', 'HR Policy Expert').
        description (str | None): Brief description of the agent's specialty and domain.
        instructions (str): Core behavioral instructions and prompt persona.
        avatar (str | None): UI avatar icon identifier.
        provider_id (str): Foundational model provider identifier (e.g., 'groq', 'openai').
        model_name (str): Target model identifier (e.g., 'llama-3.3-70b-versatile').
        temperature (float): Sampling temperature parameter (0.0 to 1.0).
        max_tokens (int | None): Optional ceiling on generation tokens.
        api_key_encrypted (str | None): Fernet-encrypted API key string.
        base_url (str | None): Optional custom endpoint base URL.
        is_default (bool): Whether this agent serves as the workspace default.
        tools (list[dict[str, Any]]): JSON array of tool specifications and MCP servers.
        knowledge (list[dict[str, Any]]): JSON array of connected knowledge bases queried by RAG agents.
        policies (dict[str, Any] | list[dict[str, Any]]): JSON governance and guardrail policies.
        created_at (datetime): Creation timestamp with timezone.
        updated_at (datetime): Last modification timestamp with timezone.
    """

    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    instructions: Mapped[str] = mapped_column(Text, nullable=False)
    avatar: Mapped[str | None] = mapped_column(String(50), nullable=True, default="Bot")
    provider_id: Mapped[str] = mapped_column(String(50), nullable=False, default="groq")
    model_name: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    temperature: Mapped[float] = mapped_column(Float, nullable=False, default=0.7)
    max_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    enable_reasoning: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, server_default=false()
    )
    reasoning_effort: Mapped[str] = mapped_column(
        String(16), default="medium", nullable=False, server_default="medium"
    )
    api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    base_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    tools: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    knowledge: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    policies: Mapped[dict[str, Any] | list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=dict
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=current_utc_time)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=current_utc_time, onupdate=current_utc_time
    )


class ConversationSession(Base):
    """SQLAlchemy ORM model representing a conversation session.

    Attributes:
        id (str): Primary key UUID string identifier.
        title (str): Title or summary of the conversation session.
        agent_id (str | None): Optional foreign key referencing the associated Agent.
        rolling_summary (str | None): Progressive summary of older conversation turns.
        summary_message_count (int): Number of earliest session messages covered by `rolling_summary`.
        working_state (dict[str, Any]): Structured session state isolated from narrative summaries.
        created_at (datetime): Timestamp when the session was created.
        updated_at (datetime): Timestamp when the session was last updated.
        messages (list[SessionMessage]): Relationship to associated session messages.
        agent (Agent | None): Relationship to associated Agent.
    """

    __tablename__ = "conversation_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="New Conversation")
    agent_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("agents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    rolling_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_message_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    working_state: Mapped[dict[str, Any]] = mapped_column(
        JSON, nullable=False, default=dict, server_default="{}"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=current_utc_time)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=current_utc_time, onupdate=current_utc_time
    )

    # [Relationship] Associated Agent
    agent: Mapped[Agent | None] = relationship("Agent")

    # [Relationship] Cascade deletion of all messages when session is deleted
    messages: Mapped[list["SessionMessage"]] = relationship(
        "SessionMessage",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="SessionMessage.created_at",
    )


class SessionMessage(Base):
    """SQLAlchemy ORM model representing a single message within a conversation session.

    Attributes:
        id (str): Primary key UUID string identifier.
        session_id (str): Foreign key referencing the parent ConversationSession.
        role (str): Role of the message author (system, user, assistant, tool).
        content (str): Textual content of the message.
        created_at (datetime): Timestamp when the message was created.
        session (ConversationSession): Parent session ORM relationship.
    """

    __tablename__ = "session_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("conversation_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    trace_steps: Mapped[list[dict[str, Any]] | None] = mapped_column(
        JSON, nullable=True, default=None
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=current_utc_time)

    # [Relationship] Reference to parent ConversationSession
    session: Mapped["ConversationSession"] = relationship(
        "ConversationSession", back_populates="messages"
    )


class McpServer(Base):
    """SQLAlchemy ORM model representing a Model Context Protocol (MCP) server configuration.

    Attributes:
        id (str): Primary key UUID string identifier.
        agent_id (str | None): Optional foreign key referencing a specific Agent, or None for workspace-level.
        name (str): Unique server key identifier within mcpServers (e.g., 'github', 'postgres').
        transport (str): Transport protocol ('stdio', 'http', or 'sse').
        command (str): Executable command for stdio transport (e.g., 'npx', 'uvx').
        args (list[str]): Command-line arguments array for stdio transport.
        env (dict[str, str]): Environment variables dictionary for stdio transport.
        url (str): Remote endpoint URL for http or sse transport.
        headers (dict[str, str]): HTTP headers dictionary for http or sse transport.
        disabled (bool): Whether the MCP server is currently disabled.
        extra (dict[str, Any]): Additional custom properties preserved from raw mcp.json.
        sort_order (int): Display ordering index.
        created_at (datetime): Creation timestamp with timezone.
        updated_at (datetime): Last modification timestamp with timezone.
    """

    __tablename__ = "mcp_servers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    agent_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("agents.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    transport: Mapped[str] = mapped_column(String(20), nullable=False, default="stdio")
    command: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    args: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    env: Mapped[dict[str, str]] = mapped_column(JSON, nullable=False, default=dict)
    url: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    headers: Mapped[dict[str, str]] = mapped_column(JSON, nullable=False, default=dict)
    disabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    extra: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    connection_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="idle", server_default="idle"
    )
    connection_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    tools_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    discovered_tools: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list, server_default="[]"
    )
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=current_utc_time)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=current_utc_time, onupdate=current_utc_time
    )


class AgentMemory(Base):
    """SQLAlchemy ORM model representing a persistent long-term memory entry.

    Attributes:
        id (str): Primary key UUID string identifier.
        agent_id (str | None): Optional foreign key isolating memory to a specific Agent.
        source_session_id (str | None): Optional originating ConversationSession UUID.
        memory_type (str): Category (`semantic`, `episodic`, or `procedural`).
        content (str): Concise atomic memory fact, preference, or lesson.
        tags (list[str]): Keywords/tags used for lexical relevance scoring.
        importance (float): Salience score in `[0.0, 1.0]`.
        access_count (int): Number of times this memory was injected into prompts.
        last_accessed_at (datetime | None): Timestamp of the most recent retrieval.
        created_at (datetime): Creation timestamp with timezone.
        updated_at (datetime): Last modification timestamp with timezone.
    """

    __tablename__ = "agent_memories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    agent_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("agents.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    source_session_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("conversation_sessions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    memory_type: Mapped[str] = mapped_column(
        String(32), nullable=False, default="semantic", server_default="semantic", index=True
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    tags: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list, server_default="[]")
    importance: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.5, server_default="0.5"
    )
    access_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    last_accessed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=current_utc_time)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=current_utc_time, onupdate=current_utc_time
    )

    # [Relationship] Optional parent Agent association
    agent: Mapped[Agent | None] = relationship("Agent")
