"""Relational database entity models for conversation sessions and message history.

This module defines the SQLAlchemy ORM models representing persistent chat sessions
and individual messages within a conversation history.
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
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


class Assistant(Base):
    """SQLAlchemy ORM model representing a customized AI Assistant.

    Attributes:
        id (str): Primary key UUID string identifier.
        name (str): Display name of the assistant (e.g., 'Python Architect', 'SQL Guru').
        description (str | None): Brief description of what this assistant does.
        avatar (str | None): Icon or avatar identifier for UI representation.
        provider_id (str): Underlying provider identifier (e.g., 'groq', 'mistral', 'openai').
        model_name (str): Target model name (e.g., 'llama-3.3-70b-versatile').
        temperature (float): Sampling temperature (0.0 to 1.0).
        max_tokens (int | None): Optional max token limit.
        system_prompt (str | None): Persona and core instructions for this assistant.
        is_default (bool): Whether this is the default assistant selected for new chats.
        tools (list[dict[str, Any]]): JSON list of tool specifications for agentic workflows.
        created_at (datetime): Timestamp when the assistant was created.
        updated_at (datetime): Timestamp when the assistant was last updated.
    """

    __tablename__ = "assistants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar: Mapped[str | None] = mapped_column(String(50), nullable=True)
    provider_id: Mapped[str] = mapped_column(String(50), nullable=False, default="groq")
    model_name: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    temperature: Mapped[float] = mapped_column(Float, nullable=False, default=0.7)
    max_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    base_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    tools: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=current_utc_time)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=current_utc_time, onupdate=current_utc_time
    )


class ConversationSession(Base):
    """SQLAlchemy ORM model representing a conversation session.

    Attributes:
        id (str): Primary key UUID string identifier.
        title (str): Title or summary of the conversation session.
        assistant_id (str | None): Optional foreign key referencing the associated Assistant.
        created_at (datetime): Timestamp when the session was created.
        updated_at (datetime): Timestamp when the session was last updated.
        messages (list[SessionMessage]): Relationship to associated session messages.
        assistant (Assistant | None): Relationship to associated Assistant.
    """

    __tablename__ = "conversation_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="New Conversation")
    assistant_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("assistants.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=current_utc_time)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=current_utc_time, onupdate=current_utc_time
    )

    # [Relationship] Associated Assistant
    assistant: Mapped[Assistant | None] = relationship("Assistant")

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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=current_utc_time)

    # [Relationship] Reference to parent ConversationSession
    session: Mapped["ConversationSession"] = relationship(
        "ConversationSession", back_populates="messages"
    )
