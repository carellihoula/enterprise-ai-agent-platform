"""Multi-tenant workspace management, member RBAC, invitations, API keys, and audit logs."""

from __future__ import annotations

import re
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.audit import record_audit_event
from app.core.auth import (
    AuthContext,
    generate_api_key,
    get_auth_context,
    hash_token,
    require_permission,
)
from app.core.cache import auth_cache
from app.core.database import get_db
from app.core.errors import DomainError
from app.core.permissions import ALL_PERMISSIONS, Permission, WorkspaceRole
from app.models.auth import (
    ApiKey,
    AuditLog,
    User,
    Workspace,
    WorkspaceInvitation,
    WorkspaceMember,
)

router = APIRouter(prefix="/workspaces", tags=["Workspaces"])

_VALID_ROLES = {r.value for r in WorkspaceRole}


class CreateWorkspaceRequest(BaseModel):
    """Payload to create a new team or enterprise workspace."""

    name: str = Field(..., min_length=2, max_length=120)
    plan_tier: str = Field(default="team")


class WorkspaceItemResponse(BaseModel):
    """Public workspace item with the caller's role."""

    id: str
    name: str
    slug: str
    plan_tier: str
    role: str
    created_at: datetime


class WorkspaceMemberResponse(BaseModel):
    """Member entry inside a workspace."""

    user_id: str
    email: str
    full_name: str | None = None
    role: str
    joined_at: datetime


class UpdateMemberRoleRequest(BaseModel):
    """Payload to change a workspace member's RBAC role."""

    role: str = Field(...)


class CreateInvitationRequest(BaseModel):
    """Payload to invite a user by email to join a workspace."""

    email: str = Field(..., min_length=3, max_length=255)
    role: str = Field(default=WorkspaceRole.MEMBER.value)


class InvitationResponse(BaseModel):
    """Created invitation details including the shareable token for self-hosted setups."""

    id: str
    workspace_id: str
    email: str
    role: str
    invite_token: str
    expires_at: datetime


class AcceptInvitationRequest(BaseModel):
    """Payload to accept a workspace invitation token."""

    token: str = Field(..., min_length=8)


class CreateApiKeyRequest(BaseModel):
    """Payload to issue a scoped programmatic API key."""

    name: str = Field(..., min_length=2, max_length=120)
    scopes: list[str] = Field(default_factory=list)
    expires_in_days: int | None = Field(default=None, ge=1, le=3650)


class ApiKeyResponse(BaseModel):
    """Metadata view of a workspace API key (never returns the secret hash)."""

    id: str
    name: str
    key_prefix: str
    scopes: list[str]
    expires_at: datetime | None = None
    last_used_at: datetime | None = None
    revoked_at: datetime | None = None
    created_at: datetime


class ApiKeyCreatedResponse(ApiKeyResponse):
    """One-time response returning the raw secret API key upon creation."""

    raw_key: str


class AuditLogResponse(BaseModel):
    """Public audit log entry."""

    id: str
    action: str
    actor_user_id: str | None = None
    resource_type: str | None = None
    resource_id: str | None = None
    metadata_json: dict[str, Any]
    ip_address: str | None = None
    created_at: datetime


def _ensure_same_workspace(ctx: AuthContext, workspace_id: str) -> None:
    """Verifies the target path `workspace_id` matches the active authenticated workspace."""
    if ctx.workspace_id != workspace_id:
        raise DomainError(
            "Switch active workspace via X-Workspace-Id header before managing this workspace.",
            error_code="WORKSPACE_MISMATCH",
            status_code=403,
        )


@router.get("", response_model=list[WorkspaceItemResponse])
def list_workspaces(
    ctx: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[Session, Depends(get_db)],
) -> list[WorkspaceItemResponse]:
    """Lists all workspaces accessible to the authenticated user."""
    rows = (
        db.query(Workspace, WorkspaceMember)
        .join(WorkspaceMember, Workspace.id == WorkspaceMember.workspace_id)
        .filter(WorkspaceMember.user_id == ctx.user_id)
        .order_by(Workspace.created_at.asc())
        .all()
    )
    return [
        WorkspaceItemResponse(
            id=ws.id,
            name=ws.name,
            slug=ws.slug,
            plan_tier=ws.plan_tier,
            role=mem.role,
            created_at=ws.created_at,
        )
        for ws, mem in rows
    ]


@router.post("", response_model=WorkspaceItemResponse, status_code=status.HTTP_201_CREATED)
def create_workspace(
    payload: CreateWorkspaceRequest,
    request: Request,
    ctx: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[Session, Depends(get_db)],
) -> WorkspaceItemResponse:
    """Creates a new shared workspace and assigns the creator as owner."""
    tier = payload.plan_tier.strip().lower()
    if tier not in {"personal", "team", "enterprise", "self_hosted"}:
        raise DomainError("Invalid plan_tier value.", status_code=400)

    base = re.sub(r"[^a-z0-9]+", "-", payload.name.lower()).strip("-") or "workspace"
    ws = Workspace(
        name=payload.name.strip(),
        slug=f"{base[:40]}-{uuid.uuid4().hex[:8]}",
        plan_tier=tier,
        owner_id=ctx.user_id,
    )
    db.add(ws)
    db.flush()

    db.add(
        WorkspaceMember(
            workspace_id=ws.id,
            user_id=ctx.user_id,
            role=WorkspaceRole.OWNER.value,
        )
    )
    record_audit_event(
        db=db,
        action="workspace.create",
        workspace_id=ws.id,
        actor_user_id=ctx.user_id,
        resource_type="workspace",
        resource_id=ws.id,
        metadata={"name": ws.name, "plan_tier": ws.plan_tier},
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(ws)

    return WorkspaceItemResponse(
        id=ws.id,
        name=ws.name,
        slug=ws.slug,
        plan_tier=ws.plan_tier,
        role=WorkspaceRole.OWNER.value,
        created_at=ws.created_at,
    )


@router.get("/{workspace_id}/members", response_model=list[WorkspaceMemberResponse])
def list_members(
    workspace_id: str,
    ctx: Annotated[AuthContext, Depends(require_permission(Permission.MEMBERS_READ.value))],
    db: Annotated[Session, Depends(get_db)],
) -> list[WorkspaceMemberResponse]:
    """Lists all members and their RBAC roles inside the active workspace."""
    _ensure_same_workspace(ctx, workspace_id)
    rows = (
        db.query(WorkspaceMember, User)
        .join(User, WorkspaceMember.user_id == User.id)
        .filter(WorkspaceMember.workspace_id == workspace_id)
        .order_by(WorkspaceMember.joined_at.asc())
        .all()
    )
    return [
        WorkspaceMemberResponse(
            user_id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=mem.role,
            joined_at=mem.joined_at,
        )
        for mem, user in rows
    ]


@router.patch("/{workspace_id}/members/{member_user_id}", response_model=WorkspaceMemberResponse)
def update_member_role(
    workspace_id: str,
    member_user_id: str,
    payload: UpdateMemberRoleRequest,
    request: Request,
    ctx: Annotated[AuthContext, Depends(require_permission(Permission.MEMBERS_MANAGE.value))],
    db: Annotated[Session, Depends(get_db)],
) -> WorkspaceMemberResponse:
    """Updates a member's RBAC role and immediately invalidates their cached permissions."""
    _ensure_same_workspace(ctx, workspace_id)
    new_role = payload.role.strip().lower()
    if new_role not in _VALID_ROLES:
        raise DomainError(f"Unsupported role '{payload.role}'.", status_code=400)
    if new_role == WorkspaceRole.OWNER.value and ctx.role != WorkspaceRole.OWNER.value:
        raise DomainError("Only a workspace owner can assign the owner role.", status_code=403)

    pair = (
        db.query(WorkspaceMember, User)
        .join(User, WorkspaceMember.user_id == User.id)
        .filter(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == member_user_id,
        )
        .first()
    )
    if not pair:
        raise DomainError("Workspace member not found.", status_code=404)

    mem, user = pair
    if mem.role == WorkspaceRole.OWNER.value and new_role != WorkspaceRole.OWNER.value:
        owner_count = (
            db.query(WorkspaceMember)
            .filter(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.role == WorkspaceRole.OWNER.value,
            )
            .count()
        )
        if owner_count <= 1:
            raise DomainError("Cannot demote the sole owner of a workspace.", status_code=400)

    old_role = mem.role
    mem.role = new_role
    record_audit_event(
        db=db,
        action="member.role_update",
        workspace_id=workspace_id,
        actor_user_id=ctx.user_id,
        resource_type="user",
        resource_id=member_user_id,
        metadata={"old_role": old_role, "new_role": new_role},
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    auth_cache.invalidate_auth_context(member_user_id, workspace_id)

    return WorkspaceMemberResponse(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=mem.role,
        joined_at=mem.joined_at,
    )


@router.delete("/{workspace_id}/members/{member_user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    workspace_id: str,
    member_user_id: str,
    request: Request,
    ctx: Annotated[AuthContext, Depends(require_permission(Permission.MEMBERS_MANAGE.value))],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Removes a member from the workspace and invalidates their cached permissions."""
    _ensure_same_workspace(ctx, workspace_id)
    mem = (
        db.query(WorkspaceMember)
        .filter(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == member_user_id,
        )
        .first()
    )
    if not mem:
        raise DomainError("Workspace member not found.", status_code=404)
    if mem.role == WorkspaceRole.OWNER.value:
        owner_count = (
            db.query(WorkspaceMember)
            .filter(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.role == WorkspaceRole.OWNER.value,
            )
            .count()
        )
        if owner_count <= 1:
            raise DomainError("Cannot remove the sole owner of a workspace.", status_code=400)

    db.delete(mem)
    record_audit_event(
        db=db,
        action="member.remove",
        workspace_id=workspace_id,
        actor_user_id=ctx.user_id,
        resource_type="user",
        resource_id=member_user_id,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    auth_cache.invalidate_auth_context(member_user_id, workspace_id)


@router.post(
    "/{workspace_id}/invitations",
    response_model=InvitationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_invitation(
    workspace_id: str,
    payload: CreateInvitationRequest,
    request: Request,
    ctx: Annotated[AuthContext, Depends(require_permission(Permission.MEMBERS_MANAGE.value))],
    db: Annotated[Session, Depends(get_db)],
) -> InvitationResponse:
    """Creates a 7-day workspace invitation token for a colleague's email."""
    _ensure_same_workspace(ctx, workspace_id)
    role = payload.role.strip().lower()
    if role not in _VALID_ROLES or role == WorkspaceRole.OWNER.value:
        raise DomainError(
            "Invitations can assign admin, builder, member, or viewer.", status_code=400
        )

    email = payload.email.strip().lower()
    raw_token = f"inv_{secrets.token_urlsafe(32)}"
    expires_at = datetime.now(UTC) + timedelta(days=7)

    inv = WorkspaceInvitation(
        workspace_id=workspace_id,
        email=email,
        role=role,
        token_hash=hash_token(raw_token),
        invited_by=ctx.user_id,
        expires_at=expires_at,
    )
    db.add(inv)
    record_audit_event(
        db=db,
        action="member.invite",
        workspace_id=workspace_id,
        actor_user_id=ctx.user_id,
        resource_type="invitation",
        resource_id=inv.id,
        metadata={"email": email, "role": role},
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(inv)

    return InvitationResponse(
        id=inv.id,
        workspace_id=inv.workspace_id,
        email=inv.email,
        role=inv.role,
        invite_token=raw_token,
        expires_at=inv.expires_at,
    )


@router.post("/invitations/accept", response_model=WorkspaceItemResponse)
def accept_invitation(
    payload: AcceptInvitationRequest,
    request: Request,
    ctx: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[Session, Depends(get_db)],
) -> WorkspaceItemResponse:
    """Accepts a pending workspace invitation for the currently authenticated user."""
    inv = (
        db.query(WorkspaceInvitation)
        .filter(WorkspaceInvitation.token_hash == hash_token(payload.token.strip()))
        .first()
    )
    now = datetime.now(UTC)
    if (
        not inv
        or inv.accepted_at is not None
        or inv.email != ctx.email
        or (inv.expires_at.replace(tzinfo=UTC) if inv.expires_at.tzinfo is None else inv.expires_at)
        <= now
    ):
        raise DomainError("Invalid or expired invitation token.", status_code=400)

    existing = (
        db.query(WorkspaceMember)
        .filter(
            WorkspaceMember.workspace_id == inv.workspace_id,
            WorkspaceMember.user_id == ctx.user_id,
        )
        .first()
    )
    if not existing:
        existing = WorkspaceMember(
            workspace_id=inv.workspace_id,
            user_id=ctx.user_id,
            role=inv.role,
        )
        db.add(existing)
    inv.accepted_at = now
    record_audit_event(
        db=db,
        action="member.join",
        workspace_id=inv.workspace_id,
        actor_user_id=ctx.user_id,
        resource_type="workspace",
        resource_id=inv.workspace_id,
        metadata={"role": existing.role},
        ip_address=request.client.host if request.client else None,
    )
    db.commit()

    ws = db.query(Workspace).filter(Workspace.id == inv.workspace_id).first()
    assert ws is not None
    return WorkspaceItemResponse(
        id=ws.id,
        name=ws.name,
        slug=ws.slug,
        plan_tier=ws.plan_tier,
        role=existing.role,
        created_at=ws.created_at,
    )


@router.get("/{workspace_id}/api-keys", response_model=list[ApiKeyResponse])
def list_api_keys(
    workspace_id: str,
    ctx: Annotated[AuthContext, Depends(require_permission(Permission.APIKEYS_MANAGE.value))],
    db: Annotated[Session, Depends(get_db)],
) -> list[ApiKeyResponse]:
    """Lists all programmatic API keys belonging to the active workspace."""
    _ensure_same_workspace(ctx, workspace_id)
    rows = (
        db.query(ApiKey)
        .filter(ApiKey.workspace_id == workspace_id)
        .order_by(ApiKey.created_at.desc())
        .all()
    )
    return [
        ApiKeyResponse(
            id=row.id,
            name=row.name,
            key_prefix=row.key_prefix,
            scopes=row.scopes,
            expires_at=row.expires_at,
            last_used_at=row.last_used_at,
            revoked_at=row.revoked_at,
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.post(
    "/{workspace_id}/api-keys",
    response_model=ApiKeyCreatedResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_api_key(
    workspace_id: str,
    payload: CreateApiKeyRequest,
    request: Request,
    ctx: Annotated[AuthContext, Depends(require_permission(Permission.APIKEYS_MANAGE.value))],
    db: Annotated[Session, Depends(get_db)],
) -> ApiKeyCreatedResponse:
    """Issues a new scoped API key (raw secret returned once upon creation)."""
    _ensure_same_workspace(ctx, workspace_id)
    invalid_scopes = [s for s in payload.scopes if s not in ALL_PERMISSIONS]
    if invalid_scopes:
        raise DomainError(f"Unknown permission scopes: {invalid_scopes}", status_code=400)

    raw_key, key_prefix, key_hash = generate_api_key()
    expires_at = (
        datetime.now(UTC) + timedelta(days=payload.expires_in_days)
        if payload.expires_in_days
        else None
    )

    record = ApiKey(
        workspace_id=workspace_id,
        user_id=ctx.user_id,
        name=payload.name.strip(),
        key_prefix=key_prefix,
        key_hash=key_hash,
        scopes=payload.scopes,
        expires_at=expires_at,
    )
    db.add(record)
    record_audit_event(
        db=db,
        action="apikey.create",
        workspace_id=workspace_id,
        actor_user_id=ctx.user_id,
        resource_type="api_key",
        resource_id=record.id,
        metadata={"name": record.name, "scopes": record.scopes},
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(record)

    return ApiKeyCreatedResponse(
        id=record.id,
        name=record.name,
        key_prefix=record.key_prefix,
        scopes=record.scopes,
        expires_at=record.expires_at,
        last_used_at=record.last_used_at,
        revoked_at=record.revoked_at,
        created_at=record.created_at,
        raw_key=raw_key,
    )


@router.delete("/{workspace_id}/api-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_api_key(
    workspace_id: str,
    key_id: str,
    request: Request,
    ctx: Annotated[AuthContext, Depends(require_permission(Permission.APIKEYS_MANAGE.value))],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Revokes a workspace API key and evicts it from the Redis auth cache."""
    _ensure_same_workspace(ctx, workspace_id)
    record = (
        db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.workspace_id == workspace_id).first()
    )
    if not record:
        raise DomainError("API key not found.", status_code=404)

    record.revoked_at = datetime.now(UTC)
    record_audit_event(
        db=db,
        action="apikey.revoke",
        workspace_id=workspace_id,
        actor_user_id=ctx.user_id,
        resource_type="api_key",
        resource_id=record.id,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    auth_cache.invalidate_api_key(record.key_hash)


@router.get("/{workspace_id}/audit-logs", response_model=list[AuditLogResponse])
def list_audit_logs(
    workspace_id: str,
    ctx: Annotated[AuthContext, Depends(require_permission(Permission.AUDIT_READ.value))],
    db: Annotated[Session, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[AuditLogResponse]:
    """Lists recent security and governance audit events for the workspace."""
    _ensure_same_workspace(ctx, workspace_id)
    rows = (
        db.query(AuditLog)
        .filter(AuditLog.workspace_id == workspace_id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        AuditLogResponse(
            id=row.id,
            action=row.action,
            actor_user_id=row.actor_user_id,
            resource_type=row.resource_type,
            resource_id=row.resource_id,
            metadata_json=row.metadata_json,
            ip_address=row.ip_address,
            created_at=row.created_at,
        )
        for row in rows
    ]
