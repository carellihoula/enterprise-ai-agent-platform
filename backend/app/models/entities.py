"""Relational database entity models for conversation sessions and message history.

This module defines the SQLAlchemy ORM models representing persistent chat sessions
and individual messages within a conversation history.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, String, Text
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


class ConversationSession(Base):
    """SQLAlchemy ORM model representing a conversation session.

    Attributes:
        id (str): Primary key UUID string identifier.
        title (str): Title or summary of the conversation session.
        created_at (datetime): Timestamp when the session was created.
        updated_at (datetime): Timestamp when the session was last updated.
        messages (list[SessionMessage]): Relationship to associated session messages.
    """

    __tablename__ = "conversation_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="New Conversation")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=current_utc_time)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=current_utc_time, onupdate=current_utc_time
    )

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


class ProviderConfig(Base):
    """SQLAlchemy ORM model representing persisted LLM provider and assistant settings.

    Attributes:
        id (str): Primary key identifier, typically matching provider_id.
        provider_id (str): Canonical provider identifier (e.g., 'gemini', 'openai', 'anthropic', 'custom').
        models (list[str]): Persisted list of model identifiers added by the user (JSON list).
        active_model (str | None): Currently selected active model name.
        temperature (float): Configured sampling temperature (0.0 to 2.0).
        system_prompt (str | None): Configured system prompt instructions.
        api_key_encrypted (str | None): Fernet-encrypted API key string.
        base_url (str | None): Custom base URL endpoint for local or proxy providers.
        created_at (datetime): Timestamp when configuration record was created.
        updated_at (datetime): Timestamp when configuration record was last updated.
    """

    __tablename__ = "provider_configs"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    provider_id: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    models: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    active_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    temperature: Mapped[float] = mapped_column(Float, nullable=False, default=0.7)
    system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    base_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=current_utc_time)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=current_utc_time, onupdate=current_utc_time
    )
