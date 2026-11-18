"""API endpoints for uploading, previewing, and deleting chat file attachments."""

from datetime import datetime
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    Response,
    UploadFile,
    status,
)
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.core.auth import AuthContext, require_permission
from app.core.database import get_db
from app.core.permissions import Permission
from app.core.rate_limit import get_rate_limit_key, limiter
from app.models.entities import ChatAttachment
from app.services.attachment_service import save_uploaded_attachment
from app.services.storage_service import get_storage_backend

router = APIRouter(prefix="/attachments", tags=["Attachments"])


class AttachmentResponse(BaseModel):
    """Public metadata schema for an uploaded chat attachment."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    session_id: str | None = None
    message_id: str | None = None
    filename: str
    mime_type: str
    size_bytes: int
    is_image: bool
    is_pdf: bool
    created_at: datetime


@router.post(
    "",
    response_model=AttachmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a chat file or image attachment",
)
@limiter.limit("20/minute", key_func=get_rate_limit_key)
async def upload_attachment(
    request: Request,
    response: Response,
    ctx: Annotated[AuthContext, Depends(require_permission(Permission.ATTACHMENTS_WRITE.value))],
    db: Annotated[Session, Depends(get_db)],
    file: Annotated[UploadFile, File(...)],
    session_id: Annotated[str | None, Form()] = None,
) -> AttachmentResponse:
    """Validates, extracts text (if applicable), and stores a user-scoped chat attachment."""
    raw_bytes = await file.read()
    record = save_uploaded_attachment(
        db=db,
        filename=file.filename,
        content_type=file.content_type,
        raw_bytes=raw_bytes,
        session_id=session_id,
        workspace_id=ctx.workspace_id,
        user_id=ctx.user_id,
    )
    return AttachmentResponse.model_validate(record)


@router.get(
    "/{attachment_id}/content",
    summary="Download or preview binary attachment content",
)
def get_attachment_content(
    attachment_id: str,
    ctx: Annotated[AuthContext, Depends(require_permission(Permission.ATTACHMENTS_READ.value))],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    """Serves stored binary content owned by the authenticated user in the active workspace."""
    record = (
        db.query(ChatAttachment)
        .filter(
            ChatAttachment.id == attachment_id,
            ChatAttachment.workspace_id == ctx.workspace_id,
            ChatAttachment.user_id == ctx.user_id,
        )
        .first()
    )
    if not record or not record.storage_path:
        raise HTTPException(status_code=404, detail="Attachment binary content not found.")
    raw_bytes = get_storage_backend().get_bytes(record.storage_path)
    if raw_bytes is None:
        raise HTTPException(status_code=404, detail="Attachment file missing in storage.")
    return Response(
        content=raw_bytes,
        media_type=record.mime_type,
        headers={"Content-Disposition": f'inline; filename="{record.filename}"'},
    )


@router.delete(
    "/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an uploaded attachment",
)
def delete_attachment(
    attachment_id: str,
    ctx: Annotated[AuthContext, Depends(require_permission(Permission.ATTACHMENTS_WRITE.value))],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Deletes an attachment record owned by the authenticated user and its stored object."""
    record = (
        db.query(ChatAttachment)
        .filter(
            ChatAttachment.id == attachment_id,
            ChatAttachment.workspace_id == ctx.workspace_id,
            ChatAttachment.user_id == ctx.user_id,
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Attachment not found.")
    if record.storage_path:
        get_storage_backend().delete(record.storage_path)
    db.delete(record)
    db.commit()
