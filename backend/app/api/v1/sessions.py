"""API endpoints for managing conversation sessions and retrieving session history.

This module provides FastAPI routes for creating, listing, retrieving, and deleting
conversation sessions, as well as viewing message history within a session.
"""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.session_service import SessionService

router = APIRouter(prefix="/sessions", tags=["Sessions"])


class CreateSessionRequest(BaseModel):
    """Data model representing a request payload to create a new conversation session.

    Attributes:
        title (str | None): Optional title for the conversation session.
    """

    title: str | None = Field(default=None, description="Optional conversation session title")


class SessionMessageResponse(BaseModel):
    """Data model representing a single message response inside a conversation session.

    Attributes:
        id (str): Unique UUID string identifier of the message.
        session_id (str): Target session UUID string identifier.
        role (str): Message author role (system, user, assistant, tool).
        content (str): Textual content of the message.
        created_at (datetime): Timestamp when the message was created.
    """

    id: str = Field(description="Unique message identifier")
    session_id: str = Field(description="Parent session identifier")
    role: str = Field(description="Role of the message author")
    content: str = Field(description="Textual content of the message")
    created_at: datetime = Field(description="Timestamp when message was created")


class SessionResponse(BaseModel):
    """Data model representing a conversation session summary response.

    Attributes:
        id (str): Unique UUID string identifier of the session.
        title (str): Title or summary of the conversation session.
        created_at (datetime): Timestamp when session was created.
        updated_at (datetime): Timestamp when session was last updated.
    """

    id: str = Field(description="Unique session identifier")
    title: str = Field(description="Session title")
    created_at: datetime = Field(description="Timestamp when session was created")
    updated_at: datetime = Field(description="Timestamp when session was last updated")


class SessionDetailResponse(SessionResponse):
    """Data model representing a conversation session with its complete message history.

    Attributes:
        messages (list[SessionMessageResponse]): List of messages in the session.
    """

    messages: list[SessionMessageResponse] = Field(
        default_factory=list, description="Ordered list of session messages"
    )


@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    request: CreateSessionRequest,
    db: Annotated[Session, Depends(get_db)],
) -> SessionResponse:
    """Endpoint to create a new conversation session.

    Args:
        request (CreateSessionRequest): Request payload containing optional title.
        db (Session): Database session dependency.

    Returns:
        SessionResponse: Structured response of the created session.
    """
    service = SessionService(db)
    # [Persistence] Delegate session creation to service layer
    session = service.create_session(title=request.title)
    return SessionResponse(
        id=session.id,
        title=session.title,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


@router.get("", response_model=list[SessionResponse], status_code=status.HTTP_200_OK)
async def list_sessions(
    db: Annotated[Session, Depends(get_db)],
) -> list[SessionResponse]:
    """Endpoint to list all conversation sessions ordered by recency.

    Args:
        db (Session): Database session dependency.

    Returns:
        list[SessionResponse]: List of active conversation session summaries.
    """
    service = SessionService(db)
    # [Query] Fetch all session summaries sorted by updated_at descending
    sessions = service.list_sessions()
    return [
        SessionResponse(
            id=s.id,
            title=s.title,
            created_at=s.created_at,
            updated_at=s.updated_at,
        )
        for s in sessions
    ]


@router.get("/{session_id}", response_model=SessionDetailResponse, status_code=status.HTTP_200_OK)
async def get_session(
    session_id: str,
    db: Annotated[Session, Depends(get_db)],
) -> SessionDetailResponse:
    """Endpoint to retrieve a detailed conversation session including message history.

    Args:
        session_id (str): UUID string identifier of the target session.
        db (Session): Database session dependency.

    Returns:
        SessionDetailResponse: Detailed session response containing all messages.

    Raises:
        DomainError: If the session with specified ID does not exist.
    """
    service = SessionService(db)
    # [Query] Fetch session and populated message relationship
    session = service.get_session(session_id)
    return SessionDetailResponse(
        id=session.id,
        title=session.title,
        created_at=session.created_at,
        updated_at=session.updated_at,
        messages=[
            SessionMessageResponse(
                id=m.id,
                session_id=m.session_id,
                role=m.role,
                content=m.content,
                created_at=m.created_at,
            )
            for m in session.messages
        ],
    )


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: str,
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Endpoint to delete a conversation session and all associated messages.

    Args:
        session_id (str): UUID string identifier of the target session.
        db (Session): Database session dependency.

    Raises:
        DomainError: If the session with specified ID does not exist.
    """
    service = SessionService(db)
    # [Deletion] Cascading deletion of target session and messages
    service.delete_session(session_id)
