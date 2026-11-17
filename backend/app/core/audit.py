"""Enterprise security and governance audit logging utilities."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from app.models.auth import AuditLog

logger = logging.getLogger(__name__)


def record_audit_event(
    db: Session,
    action: str,
    workspace_id: str | None = None,
    actor_user_id: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    ip_address: str | None = None,
    commit: bool = False,
) -> AuditLog | None:
    """Persists a security or governance event in the ``audit_logs`` table.

    Args:
        db (Session): Active SQLAlchemy database session.
        action (str): Canonical dot-separated action name (e.g., ``auth.login``).
        workspace_id (str | None, optional): Target workspace UUID. Defaults to None.
        actor_user_id (str | None, optional): Acting user UUID. Defaults to None.
        resource_type (str | None, optional): Target entity type (e.g., ``agent``).
            Defaults to None.
        resource_id (str | None, optional): Target entity UUID. Defaults to None.
        metadata (dict[str, Any] | None, optional): Non-sensitive contextual attributes.
            Defaults to None.
        ip_address (str | None, optional): Client IP address. Defaults to None.
        commit (bool, optional): Whether to commit immediately. Defaults to False.

    Returns:
        AuditLog | None: Created ``AuditLog`` ORM row, or ``None`` if persistence failed.
    """
    try:
        entry = AuditLog(
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            metadata_json=metadata or {},
            ip_address=ip_address,
        )
        db.add(entry)
        if commit:
            db.commit()
            db.refresh(entry)
        return entry
    except Exception as exc:
        logger.warning(f"[Audit] Failed to record audit event '{action}': {exc}")
        return None
