"""Relational database entity models for conversation sessions and message history.

This module defines the SQLAlchemy ORM models representing persistent chat sessions
and individual messages within a conversation history.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
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
