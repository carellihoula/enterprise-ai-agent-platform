"""Service layer for conversation session management and message persistence.

This module provides business logic for creating sessions, persisting conversation messages,
retrieving session histories, and deleting conversation sessions.
"""

from collections.abc import Sequence

from sqlalchemy.orm import Session

from app.core.errors import DomainError
from app.models.entities import ConversationSession, SessionMessage, current_utc_time


class SessionService:
    """Service class encapsulating CRUD operations for conversation sessions.

    Attributes:
        db (Session): Active SQLAlchemy database session.
    """

    def __init__(self, db: Session) -> None:
        self.db = db

    def create_session(self, title: str | None = None) -> ConversationSession:
        """Creates a new conversation session in the database.

        Args:
            title (str | None, optional): Optional title for the conversation session.

        Returns:
            ConversationSession: Newly created ORM session instance.
        """
        session_title = title or "New Conversation"
        # [Persistence] Instantiate and save new session object
        db_session = ConversationSession(title=session_title)
        self.db.add(db_session)
        self.db.commit()
        self.db.refresh(db_session)
        return db_session

    def list_sessions(self) -> Sequence[ConversationSession]:
        """Retrieves all conversation sessions sorted by last updated timestamp descending.

        Returns:
            Sequence[ConversationSession]: List of all active conversation sessions.
        """
        # [Query] Fetch sessions ordered by recent activity
        return (
            self.db.query(ConversationSession).order_by(ConversationSession.updated_at.desc()).all()
        )

    def get_session(self, session_id: str) -> ConversationSession:
        """Retrieves a specific conversation session by UUID identifier.

        Args:
            session_id (str): UUID string identifier of the target session.

        Returns:
            ConversationSession: The target conversation session object.

        Raises:
            DomainError: If no session with the specified identifier exists.
        """
        db_session = (
            self.db.query(ConversationSession).filter(ConversationSession.id == session_id).first()
        )
        if not db_session:
            raise DomainError(
                message=f"Conversation session '{session_id}' not found.",
                error_code="SESSION_NOT_FOUND",
                status_code=404,
            )
        return db_session

    def add_message(self, session_id: str, role: str, content: str) -> SessionMessage:
        """Appends a new message to an existing conversation session.

        Args:
            session_id (str): Target session UUID string identifier.
            role (str): Message author role (system, user, assistant, tool).
            content (str): Textual content of the message.

        Returns:
            SessionMessage: Newly created message ORM instance.

        Raises:
            DomainError: If the target session does not exist.
        """
        # [Validation] Verify target session exists before appending message
        db_session = self.get_session(session_id)

        # [Persistence] Instantiate and attach new message
        message = SessionMessage(session_id=db_session.id, role=role, content=content)
        self.db.add(message)

        # [Update] Touch parent session updated_at timestamp
        db_session.updated_at = current_utc_time()
        self.db.commit()
        self.db.refresh(message)
        return message

    def delete_session(self, session_id: str) -> bool:
        """Deletes a conversation session and all its associated messages.

        Args:
            session_id (str): UUID string identifier of the session to delete.

        Returns:
            bool: True if the session was successfully deleted.

        Raises:
            DomainError: If no session with the specified identifier exists.
        """
        db_session = self.get_session(session_id)
        # [Deletion] Remove session and cascade delete all child messages
        self.db.delete(db_session)
        self.db.commit()
        return True
