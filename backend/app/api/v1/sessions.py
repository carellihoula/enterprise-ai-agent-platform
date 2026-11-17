"""API endpoints for managing conversation sessions and retrieving session history.

This module provides FastAPI routes for creating, listing, retrieving, and deleting
conversation sessions, as well as viewing message history within a session.
"""

from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.v1.attachments import AttachmentResponse
from app.core.auth import AuthContext, require_permission
from app.core.database import get_db
from app.core.errors import DomainError
from app.core.permissions import Permission
from app.models.entities import ConversationSession
from app.services.session_service import SessionService

router = APIRouter(prefix="/sessions", tags=["Sessions"])


class CreateSessionRequest(BaseModel):
    """Data model representing a request payload to create a new conversation session.

    Attributes:
        title (str | None): Optional title for the conversation session.
        agent_id (str | None): Optional associated agent identifier.
    """

    title: str | None = Field(default=None, description="Optional conversation session title")
    agent_id: str | None = Field(default=None, description="Optional associated agent identifier")


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
    trace_steps: list[dict[str, Any]] | None = Field(
        default=None, description="Persisted reasoning and tool execution trace steps"
    )
    attachments: list[AttachmentResponse] = Field(
        default_factory=list, description="Attached files or images associated with this message"
    )
    created_at: datetime = Field(description="Timestamp when message was created")


class SessionResponse(BaseModel):
    """Data model representing a conversation session summary response.

    Attributes:
        id (str): Unique UUID string identifier of the session.
        title (str): Title or summary of the conversation session.
        agent_id (str | None): Associated agent identifier.
        created_at (datetime): Timestamp when session was created.
        updated_at (datetime): Timestamp when session was last updated.
    """

    id: str = Field(description="Unique session identifier")
    title: str = Field(description="Session title")
    agent_id: str | None = Field(default=None, description="Associated agent identifier")
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
    ctx: Annotated[AuthContext, Depends(require_permission(Permission.SESSIONS_WRITE.value))],
    db: Annotated[Session, Depends(get_db)],
) -> SessionResponse:
    """Endpoint to create a new private conversation session inside the active workspace."""
    service = SessionService(db)
    session = service.create_session(title=request.title, agent_id=request.agent_id)
    session.workspace_id = ctx.workspace_id
    session.user_id = ctx.user_id
    db.commit()
    db.refresh(session)
    return SessionResponse(
        id=session.id,
        title=session.title,
        agent_id=session.agent_id,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


@router.get("", response_model=list[SessionResponse], status_code=status.HTTP_200_OK)
async def list_sessions(
    ctx: Annotated[AuthContext, Depends(require_permission(Permission.SESSIONS_READ.value))],
    db: Annotated[Session, Depends(get_db)],
) -> list[SessionResponse]:
    """Lists the authenticated user's conversation sessions in the active workspace."""
    sessions = (
        db.query(ConversationSession)
        .filter(
            ConversationSession.workspace_id == ctx.workspace_id,
            ConversationSession.user_id == ctx.user_id,
        )
        .order_by(ConversationSession.updated_at.desc())
        .all()
    )
    return [
        SessionResponse(
            id=s.id,
            title=s.title,
            agent_id=s.agent_id,
            created_at=s.created_at,
            updated_at=s.updated_at,
        )
        for s in sessions
    ]


@router.get("/{session_id}", response_model=SessionDetailResponse, status_code=status.HTTP_200_OK)
async def get_session(
    session_id: str,
    ctx: Annotated[AuthContext, Depends(require_permission(Permission.SESSIONS_READ.value))],
    db: Annotated[Session, Depends(get_db)],
) -> SessionDetailResponse:
    """Retrieves a detailed conversation session owned by the authenticated user."""
    service = SessionService(db)
    session = service.get_session(session_id)
    if session.workspace_id != ctx.workspace_id or session.user_id != ctx.user_id:
        raise DomainError(f"Session with id '{session_id}' not found.", status_code=404)
    return SessionDetailResponse(
        id=session.id,
        title=session.title,
        agent_id=session.agent_id,
        created_at=session.created_at,
        updated_at=session.updated_at,
        messages=[
            SessionMessageResponse(
                id=m.id,
                session_id=m.session_id,
                role=m.role,
                content=m.content,
                trace_steps=m.trace_steps,
                attachments=[
                    AttachmentResponse.model_validate(att)
                    for att in (getattr(m, "attachments", None) or [])
                ],
                created_at=m.created_at,
            )
            for m in session.messages
        ],
    )


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: str,
    ctx: Annotated[AuthContext, Depends(require_permission(Permission.SESSIONS_WRITE.value))],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Deletes a conversation session owned by the authenticated user."""
    service = SessionService(db)
    session = service.get_session(session_id)
    if session.workspace_id != ctx.workspace_id or session.user_id != ctx.user_id:
        raise DomainError(f"Session with id '{session_id}' not found.", status_code=404)
    service.delete_session(session_id)
