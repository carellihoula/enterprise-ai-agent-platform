"""Authentication endpoints for signup, login, token rotation, logout, and session inspection."""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.audit import record_audit_event
from app.core.auth import (
    REFRESH_COOKIE_NAME,
    AuthContext,
    create_access_token,
    get_auth_context,
    hash_password,
    hash_token,
    issue_refresh_token,
    revoke_refresh_token_family,
    rotate_refresh_token,
    verify_password,
)
from app.core.cache import auth_cache
from app.core.config import get_settings
from app.core.database import get_db
from app.core.errors import DomainError
from app.core.permissions import WorkspaceRole
from app.models.auth import (
    RefreshToken,
    User,
    Workspace,
    WorkspaceInvitation,
    WorkspaceMember,
)
from app.models.entities import (
    Agent,
    AgentMemory,
    ChatAttachment,
    ConversationSession,
    McpServer,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class RegisterRequest(BaseModel):
    """Payload for registering a new user account."""

    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=150)
    workspace_name: str | None = Field(default=None, max_length=120)
    invitation_token: str | None = Field(default=None)


class LoginRequest(BaseModel):
    """Payload for email/password authentication."""

    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    """Optional JSON body fallback for non-browser refresh token rotation."""

    refresh_token: str | None = Field(default=None)


class WorkspaceSummary(BaseModel):
    """Public workspace membership summary returned on login/me."""

    id: str
    name: str
    slug: str
    plan_tier: str
    role: str


class UserSummary(BaseModel):
    """Public authenticated user profile."""

    id: str
    email: str
    full_name: str | None = None
    is_superadmin: bool
    auth_provider: str


class AuthTokenResponse(BaseModel):
    """Response returned after successful registration, login, or token refresh."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserSummary
    active_workspace_id: str
    workspaces: list[WorkspaceSummary]


class AuthMeResponse(BaseModel):
    """Response describing the current authenticated context and permissions."""

    user: UserSummary
    active_workspace_id: str
    active_role: str
    permissions: list[str]
    workspaces: list[WorkspaceSummary]


class BootstrapStatusResponse(BaseModel):
    """Public instance bootstrap status for self-hosted setup detection."""

    needs_setup: bool
    auth_mode: str
    allow_public_signup: bool


def _client_ip(request: Request) -> str | None:
    """Extracts the client IP address from forwarded headers or socket peer."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    return request.client.host[:64] if request.client else None


def _normalize_email(raw_email: str) -> str:
    """Validates and normalizes an email address to lowercase."""
    cleaned = raw_email.strip().lower()
    if not _EMAIL_RE.match(cleaned):
        raise DomainError("Invalid email address format.", status_code=400)
    return cleaned


def _slugify(name: str) -> str:
    """Generates a unique URL-safe slug for a workspace."""
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "workspace"
    return f"{base[:40]}-{uuid.uuid4().hex[:8]}"


def _set_refresh_cookie(response: Response, raw_token: str) -> None:
    """Attaches the rotating refresh token as an HttpOnly cookie."""
    settings = get_settings()
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=raw_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.refresh_token_expire_days * 86400,
        path="/",
    )


def _list_user_workspaces(db: Session, user_id: str) -> list[WorkspaceSummary]:
    """Queries all workspaces a user belongs to, ordered by join/creation time."""
    rows = (
        db.query(Workspace, WorkspaceMember)
        .join(WorkspaceMember, Workspace.id == WorkspaceMember.workspace_id)
        .filter(WorkspaceMember.user_id == user_id)
        .order_by(Workspace.created_at.asc())
        .all()
    )
    return [
        WorkspaceSummary(
            id=ws.id,
            name=ws.name,
            slug=ws.slug,
            plan_tier=ws.plan_tier,
            role=mem.role,
        )
        for ws, mem in rows
    ]


def _backfill_legacy_records(db: Session, workspace_id: str, user_id: str) -> None:
    """Assigns pre-auth orphaned rows to the initial admin's default workspace."""
    for ws_model in (Agent, McpServer):
        (
            db.query(ws_model)
            .filter(ws_model.workspace_id.is_(None))
            .update(
                {"workspace_id": workspace_id, "created_by": user_id}, synchronize_session=False
            )
        )
    for user_model in (ConversationSession, AgentMemory, ChatAttachment):
        (
            db.query(user_model)
            .filter(user_model.workspace_id.is_(None))
            .update({"workspace_id": workspace_id, "user_id": user_id}, synchronize_session=False)
        )


@router.get("/bootstrap-status", response_model=BootstrapStatusResponse)
def get_bootstrap_status(db: Annotated[Session, Depends(get_db)]) -> BootstrapStatusResponse:
    """Reports whether the instance has any registered users yet (self-hosted setup check).

    Args:
        db (Session): Database session dependency.

    Returns:
        BootstrapStatusResponse: Bootstrap and signup policy flags.
    """
    settings = get_settings()
    has_user = db.query(User.id).first() is not None
    return BootstrapStatusResponse(
        needs_setup=not has_user,
        auth_mode=settings.auth_mode,
        allow_public_signup=settings.allow_public_signup,
    )


@router.post("/register", response_model=AuthTokenResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> AuthTokenResponse:
    """Registers a new user, provisions a personal workspace, and issues initial tokens.

    Args:
        payload (RegisterRequest): Registration credentials and optional invitation token.
        request (Request): Incoming HTTP request.
        response (Response): HTTP response for setting the HttpOnly refresh cookie.
        db (Session): Database session dependency.

    Returns:
        AuthTokenResponse: Access token, user profile, and workspace list.
    """
    ip = _client_ip(request)
    allowed, retry_after = auth_cache.check_rate_limit(
        f"register:{ip or 'unknown'}", max_attempts=10, window_seconds=60
    )
    if not allowed:
        raise DomainError(
            f"Too many registration attempts. Retry in {retry_after}s.",
            error_code="RATE_LIMITED",
            status_code=429,
        )

    settings = get_settings()
    if settings.auth_mode == "oidc":
        raise DomainError("Local registration is disabled in OIDC-only mode.", status_code=403)

    email = _normalize_email(payload.email)
    is_first_user = db.query(User.id).first() is None

    invitation: WorkspaceInvitation | None = None
    if payload.invitation_token:
        inv_hash = hash_token(payload.invitation_token.strip())
        invitation = (
            db.query(WorkspaceInvitation).filter(WorkspaceInvitation.token_hash == inv_hash).first()
        )
        now = datetime.now(UTC)
        if (
            not invitation
            or invitation.accepted_at is not None
            or invitation.email != email
            or (
                invitation.expires_at.replace(tzinfo=UTC)
                if invitation.expires_at.tzinfo is None
                else invitation.expires_at
            )
            <= now
        ):
            raise DomainError("Invalid or expired workspace invitation.", status_code=400)
    elif not is_first_user and not settings.allow_public_signup:
        raise DomainError(
            "Public registration is disabled. Please request a workspace invitation.",
            error_code="SIGNUP_DISABLED",
            status_code=403,
        )

    if db.query(User.id).filter(User.email == email).first():
        raise DomainError("An account with this email already exists.", status_code=409)

    user = User(
        email=email,
        full_name=payload.full_name.strip() if payload.full_name else None,
        password_hash=hash_password(payload.password),
        is_superadmin=is_first_user,
        auth_provider="local",
        last_login_at=datetime.now(UTC),
    )
    db.add(user)
    db.flush()

    ws_name = (
        payload.workspace_name.strip()
        if payload.workspace_name and payload.workspace_name.strip()
        else ("Default Workspace" if is_first_user else "Personal Workspace")
    )
    personal_ws = Workspace(
        name=ws_name,
        slug=_slugify(ws_name),
        plan_tier="self_hosted" if is_first_user else "personal",
        owner_id=user.id,
    )
    db.add(personal_ws)
    db.flush()

    db.add(
        WorkspaceMember(
            workspace_id=personal_ws.id,
            user_id=user.id,
            role=WorkspaceRole.OWNER.value,
        )
    )

    if invitation is not None:
        db.add(
            WorkspaceMember(
                workspace_id=invitation.workspace_id,
                user_id=user.id,
                role=invitation.role,
            )
        )
        invitation.accepted_at = datetime.now(UTC)

    if is_first_user:
        # [Migration] Attach pre-auth orphaned local rows to the first admin workspace
        _backfill_legacy_records(db, personal_ws.id, user.id)

    raw_refresh, _ = issue_refresh_token(
        db=db,
        user_id=user.id,
        ip_address=ip,
        user_agent=request.headers.get("user-agent"),
    )
    record_audit_event(
        db=db,
        action="auth.register",
        workspace_id=personal_ws.id,
        actor_user_id=user.id,
        resource_type="user",
        resource_id=user.id,
        metadata={"is_superadmin": is_first_user},
        ip_address=ip,
    )
    db.commit()

    active_ws_id = invitation.workspace_id if invitation is not None else personal_ws.id
    access_token = create_access_token(user.id, user.token_version, workspace_id=active_ws_id)
    _set_refresh_cookie(response, raw_refresh)

    return AuthTokenResponse(
        access_token=access_token,
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserSummary(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            is_superadmin=user.is_superadmin,
            auth_provider=user.auth_provider,
        ),
        active_workspace_id=active_ws_id,
        workspaces=_list_user_workspaces(db, user.id),
    )


@router.post("/login", response_model=AuthTokenResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> AuthTokenResponse:
    """Authenticates a user with email and password, issuing a JWT and rotating refresh cookie.

    Args:
        payload (LoginRequest): Email and password credentials.
        request (Request): Incoming HTTP request.
        response (Response): HTTP response for setting the HttpOnly refresh cookie.
        db (Session): Database session dependency.

    Returns:
        AuthTokenResponse: Access token, user profile, and workspace memberships.
    """
    ip = _client_ip(request)
    email = _normalize_email(payload.email)

    allowed, retry_after = auth_cache.check_rate_limit(
        f"login:{ip or 'unknown'}:{email}", max_attempts=10, window_seconds=60
    )
    if not allowed:
        raise DomainError(
            f"Too many login attempts. Retry in {retry_after}s.",
            error_code="RATE_LIMITED",
            status_code=429,
        )

    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise DomainError(
            "Invalid email or password.", error_code="INVALID_CREDENTIALS", status_code=401
        )
    if not user.is_active:
        raise DomainError("User account is disabled.", error_code="USER_INACTIVE", status_code=403)

    workspaces = _list_user_workspaces(db, user.id)
    if not workspaces:
        raise DomainError("User has no workspace membership.", status_code=403)

    active_ws_id = workspaces[0].id
    user.last_login_at = datetime.now(UTC)
    raw_refresh, _ = issue_refresh_token(
        db=db,
        user_id=user.id,
        ip_address=ip,
        user_agent=request.headers.get("user-agent"),
    )
    record_audit_event(
        db=db,
        action="auth.login",
        workspace_id=active_ws_id,
        actor_user_id=user.id,
        resource_type="user",
        resource_id=user.id,
        ip_address=ip,
    )
    db.commit()

    settings = get_settings()
    access_token = create_access_token(user.id, user.token_version, workspace_id=active_ws_id)
    _set_refresh_cookie(response, raw_refresh)

    return AuthTokenResponse(
        access_token=access_token,
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserSummary(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            is_superadmin=user.is_superadmin,
            auth_provider=user.auth_provider,
        ),
        active_workspace_id=active_ws_id,
        workspaces=workspaces,
    )


@router.post("/refresh", response_model=AuthTokenResponse)
def refresh_session(
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    payload: RefreshRequest | None = None,
    refresh_cookie: Annotated[str | None, Cookie(alias=REFRESH_COOKIE_NAME)] = None,
) -> AuthTokenResponse:
    """Rotates the refresh token and issues a fresh short-lived JWT access token.

    Args:
        request (Request): Incoming HTTP request.
        response (Response): HTTP response for setting the rotated HttpOnly cookie.
        db (Session): Database session dependency.
        payload (RefreshRequest | None, optional): Optional body token for non-browser clients.
        refresh_cookie (str | None, optional): HttpOnly refresh token cookie.

    Returns:
        AuthTokenResponse: Fresh access token and user workspace summary.
    """
    raw_token = (
        payload.refresh_token if payload and payload.refresh_token else None
    ) or refresh_cookie
    if not raw_token:
        raise DomainError("Refresh token missing.", error_code="MISSING_REFRESH", status_code=401)

    user, new_raw, _ = rotate_refresh_token(
        db=db,
        raw_token=raw_token,
        ip_address=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    workspaces = _list_user_workspaces(db, user.id)
    if not workspaces:
        raise DomainError("User has no workspace membership.", status_code=403)

    active_ws_id = workspaces[0].id
    settings = get_settings()
    access_token = create_access_token(user.id, user.token_version, workspace_id=active_ws_id)
    _set_refresh_cookie(response, new_raw)

    return AuthTokenResponse(
        access_token=access_token,
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserSummary(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            is_superadmin=user.is_superadmin,
            auth_provider=user.auth_provider,
        ),
        active_workspace_id=active_ws_id,
        workspaces=workspaces,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    refresh_cookie: Annotated[str | None, Cookie(alias=REFRESH_COOKIE_NAME)] = None,
) -> None:
    """Revokes the active refresh token family and clears the HttpOnly cookie.

    Args:
        response (Response): HTTP response used to delete the cookie.
        db (Session): Database session dependency.
        refresh_cookie (str | None, optional): HttpOnly refresh token cookie.
    """
    if refresh_cookie:
        row = (
            db.query(RefreshToken)
            .filter(RefreshToken.token_hash == hash_token(refresh_cookie))
            .first()
        )
        if row:
            revoke_refresh_token_family(db, row.family_id)
            db.commit()
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path="/")


@router.get("/me", response_model=AuthMeResponse)
def get_me(
    ctx: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[Session, Depends(get_db)],
) -> AuthMeResponse:
    """Returns the authenticated user's profile, active workspace role, and permissions.

    Args:
        ctx (AuthContext): Validated authentication context.
        db (Session): Database session dependency.

    Returns:
        AuthMeResponse: User summary, active role, permissions, and workspace list.
    """
    return AuthMeResponse(
        user=UserSummary(
            id=ctx.user_id,
            email=ctx.email,
            full_name=ctx.full_name,
            is_superadmin=ctx.is_superadmin,
            auth_provider="local",
        ),
        active_workspace_id=ctx.workspace_id,
        active_role=ctx.role,
        permissions=sorted(ctx.permissions),
        workspaces=_list_user_workspaces(db, ctx.user_id),
    )
