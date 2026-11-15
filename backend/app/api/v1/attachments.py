"""API endpoints for uploading, previewing, and deleting chat file attachments."""

from datetime import datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.entities import ChatAttachment
from app.services.attachment_service import get_upload_dir, save_uploaded_attachment

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
async def upload_attachment(
    db: Annotated[Session, Depends(get_db)],
    file: Annotated[UploadFile, File(...)],
    session_id: Annotated[str | None, Form()] = None,
) -> AttachmentResponse:
    """Validates, extracts text (if applicable), and stores an uploaded chat attachment.

    Args:
        db (Session): Database session dependency.
        file (UploadFile): Multipart uploaded file.
        session_id (str | None, optional): Optional ConversationSession UUID.

    Returns:
        AttachmentResponse: Persisted attachment metadata.
    """
    raw_bytes = await file.read()
    record = save_uploaded_attachment(
        db=db,
        filename=file.filename,
        content_type=file.content_type,
        raw_bytes=raw_bytes,
        session_id=session_id,
    )
    return AttachmentResponse.model_validate(record)


@router.get(
    "/{attachment_id}/content",
    summary="Download or preview binary attachment content",
)
def get_attachment_content(
    attachment_id: str,
    db: Annotated[Session, Depends(get_db)],
) -> FileResponse:
    """Serves stored binary content (image or PDF) for UI preview or download.

    Args:
        attachment_id (str): Target attachment UUID.
        db (Session): Database session dependency.

    Returns:
        FileResponse: Binary file stream with appropriate MIME type.

    Raises:
        HTTPException: If attachment or stored file is missing.
    """
    record = db.query(ChatAttachment).filter(ChatAttachment.id == attachment_id).first()
    if not record or not record.storage_path:
        raise HTTPException(status_code=404, detail="Attachment binary content not found.")
    file_path = get_upload_dir() / Path(record.storage_path).name
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Attachment file missing on disk.")
    return FileResponse(path=file_path, media_type=record.mime_type, filename=record.filename)


@router.delete(
    "/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an uploaded attachment",
)
def delete_attachment(
    attachment_id: str,
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Deletes an attachment record and removes any associated binary file on disk.

    Args:
        attachment_id (str): Target attachment UUID.
        db (Session): Database session dependency.

    Raises:
        HTTPException: If no attachment exists with `attachment_id`.
    """
    record = db.query(ChatAttachment).filter(ChatAttachment.id == attachment_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Attachment not found.")
    if record.storage_path:
        file_path = get_upload_dir() / Path(record.storage_path).name
        if file_path.is_file():
            file_path.unlink(missing_ok=True)
    db.delete(record)
    db.commit()
