"""Authentication endpoints for signup, login, token rotation, logout, and session inspection."""

from __future__ import annotations

import re
import secrets
import uuid
from datetime import UTC, datetime
from typing import Annotated
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Cookie, Depends, Query, Request, Response, status
from fastapi.responses import RedirectResponse
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
from app.services.email_service import send_password_reset_email

router = APIRouter(prefix="/auth", tags=["Authentication"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class RegisterRequest(BaseModel):
    """Payload for registering a new user account."""

    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=150)
    workspace_name: str | None = Field(default=None, max_length=120)
    plan_tier: str | None = Field(default=None, max_length=32)
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
    deployment_mode: str
    auth_mode: str
    allow_public_signup: bool


class ForgotPasswordRequest(BaseModel):
    """Payload to request a password reset token."""

    email: str = Field(..., min_length=3, max_length=255)


class ForgotPasswordResponse(BaseModel):
    """Response after requesting a password reset."""

    message: str


class ResetPasswordRequest(BaseModel):
    """Payload to complete a password reset using a valid token."""

    token: str = Field(..., min_length=8)
    new_password: str = Field(..., min_length=8, max_length=128)


class OidcDiscoverRequest(BaseModel):
    """Payload to check whether OIDC/SSO is configured for a provider or email domain."""

    email: str | None = Field(default=None)
    provider: str | None = Field(default=None)


class OidcDiscoverResponse(BaseModel):
    """Discovery response indicating whether OIDC SSO can be initiated."""

    configured: bool
    provider_label: str
    authorize_url: str | None = None
    message: str | None = None


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
        deployment_mode=settings.deployment_mode,
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
    requested_tier = (payload.plan_tier or "").strip().lower()
    if is_first_user:
        resolved_tier = "self_hosted"
    elif requested_tier in {"personal", "team", "enterprise", "self_hosted"}:
        resolved_tier = requested_tier
    elif payload.workspace_name and payload.workspace_name.strip():
        resolved_tier = "team"
    else:
        resolved_tier = "personal"

    personal_ws = Workspace(
        name=ws_name,
        slug=_slugify(ws_name),
        plan_tier=resolved_tier,
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
    """Returns the authenticated user's profile, active workspace role, and permissions."""
    user_row = db.query(User.auth_provider).filter(User.id == ctx.user_id).first()
    provider_name = user_row[0] if user_row else "local"
    return AuthMeResponse(
        user=UserSummary(
            id=ctx.user_id,
            email=ctx.email,
            full_name=ctx.full_name,
            is_superadmin=ctx.is_superadmin,
            auth_provider=provider_name,
        ),
        active_workspace_id=ctx.workspace_id,
        active_role=ctx.role,
        permissions=sorted(ctx.permissions),
        workspaces=_list_user_workspaces(db, ctx.user_id),
    )


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> ForgotPasswordResponse:
    """Issues a short-lived password reset token and emails the reset link via SMTP."""
    ip = _client_ip(request)
    allowed, retry_after = auth_cache.check_rate_limit(
        f"forgot:{ip or 'unknown'}", max_attempts=5, window_seconds=60
    )
    if not allowed:
        raise DomainError(
            f"Too many password reset requests. Retry in {retry_after}s.",
            error_code="RATE_LIMITED",
            status_code=429,
        )

    email = _normalize_email(payload.email)
    user = db.query(User).filter(User.email == email, User.is_active == True).first()  # noqa: E712

    if user:
        raw_token = f"rst_{secrets.token_urlsafe(32)}"
        auth_cache.set_json(
            f"pw_reset:{hash_token(raw_token)}",
            {"user_id": user.id},
            ttl_seconds=1800,
        )
        send_password_reset_email(to_email=user.email, reset_token=raw_token)
        record_audit_event(
            db=db,
            action="auth.password_reset_request",
            actor_user_id=user.id,
            resource_type="user",
            resource_id=user.id,
            ip_address=ip,
            commit=True,
        )

    return ForgotPasswordResponse(
        message="If an account matches that address, a password reset email has been sent.",
    )


@router.post("/reset-password", status_code=status.HTTP_200_OK)
def reset_password(
    payload: ResetPasswordRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, str]:
    """Completes a password reset, updates the Argon2id hash, and revokes active sessions."""
    cache_key = f"pw_reset:{hash_token(payload.token.strip())}"
    cached = auth_cache.get_json(cache_key)
    if not cached or not cached.get("user_id"):
        raise DomainError(
            "Invalid or expired password reset token.",
            error_code="INVALID_RESET_TOKEN",
            status_code=400,
        )

    user = db.query(User).filter(User.id == cached["user_id"]).first()
    if not user or not user.is_active:
        raise DomainError("User account not found or inactive.", status_code=404)

    user.password_hash = hash_password(payload.new_password)
    user.token_version += 1
    (
        db.query(RefreshToken)
        .filter(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
        .update({"revoked_at": datetime.now(UTC)}, synchronize_session=False)
    )
    record_audit_event(
        db=db,
        action="auth.password_reset_complete",
        actor_user_id=user.id,
        resource_type="user",
        resource_id=user.id,
        ip_address=_client_ip(request),
    )
    db.commit()
    auth_cache.delete(cache_key)
    return {"message": "Password updated successfully."}


def _get_social_oauth_config(provider: str) -> dict[str, str] | None:
    """Returns OAuth2 endpoints and credentials for Google, GitHub, or Microsoft if configured."""
    settings = get_settings()
    key = provider.strip().lower()
    if key == "google" and settings.google_client_id and settings.google_client_secret:
        return {
            "provider": "google",
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret.get_secret_value(),
            "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
            "token_url": "https://oauth2.googleapis.com/token",
            "userinfo_url": "https://openidconnect.googleapis.com/v1/userinfo",
            "scope": "openid email profile",
        }
    if key == "github" and settings.github_client_id and settings.github_client_secret:
        return {
            "provider": "github",
            "client_id": settings.github_client_id,
            "client_secret": settings.github_client_secret.get_secret_value(),
            "auth_url": "https://github.com/login/oauth/authorize",
            "token_url": "https://github.com/login/oauth/access_token",
            "userinfo_url": "https://api.github.com/user",
            "scope": "read:user user:email",
        }
    if key == "microsoft" and settings.microsoft_client_id and settings.microsoft_client_secret:
        tenant = settings.microsoft_tenant_id or "common"
        return {
            "provider": "microsoft",
            "client_id": settings.microsoft_client_id,
            "client_secret": settings.microsoft_client_secret.get_secret_value(),
            "auth_url": f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize",
            "token_url": f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
            "userinfo_url": "https://graph.microsoft.com/oidc/userinfo",
            "scope": "openid email profile",
        }
    return None


def _complete_oauth_login(
    db: Session,
    request: Request,
    email: str,
    full_name: str | None,
    provider: str,
    external_subject: str | None,
) -> RedirectResponse:
    """Provisions or links an OAuth/OIDC user, sets the HttpOnly refresh cookie, and redirects."""
    settings = get_settings()
    normalized = _normalize_email(email)
    user = db.query(User).filter(User.email == normalized).first()
    if not user:
        is_first_user = db.query(User.id).first() is None
        user = User(
            email=normalized,
            full_name=full_name,
            is_superadmin=is_first_user,
            auth_provider=provider,
            external_subject=external_subject,
            last_login_at=datetime.now(UTC),
        )
        db.add(user)
        db.flush()
        ws = Workspace(
            name="Default Workspace" if is_first_user else "Personal Workspace",
            slug=_slugify(normalized.split("@")[0]),
            plan_tier="self_hosted" if is_first_user else "personal",
            owner_id=user.id,
        )
        db.add(ws)
        db.flush()
        db.add(WorkspaceMember(workspace_id=ws.id, user_id=user.id, role=WorkspaceRole.OWNER.value))
        if is_first_user:
            _backfill_legacy_records(db, ws.id, user.id)
    else:
        user.last_login_at = datetime.now(UTC)

    raw_refresh, _ = issue_refresh_token(
        db=db,
        user_id=user.id,
        ip_address=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    record_audit_event(
        db=db,
        action=f"auth.oauth_{provider}",
        actor_user_id=user.id,
        resource_type="user",
        resource_id=user.id,
        ip_address=_client_ip(request),
    )
    db.commit()

    redirect = RedirectResponse(url=settings.frontend_url, status_code=302)
    _set_refresh_cookie(redirect, raw_refresh)
    return redirect


@router.post("/oidc/discover", response_model=OidcDiscoverResponse)
def discover_oidc(payload: OidcDiscoverRequest) -> OidcDiscoverResponse:
    """Checks whether social OAuth2 (Google/GitHub/Microsoft) or enterprise OIDC is configured."""
    settings = get_settings()
    raw_provider = (payload.provider or "").strip().lower()

    if raw_provider in {"google", "github", "microsoft"}:
        cfg = _get_social_oauth_config(raw_provider)
        if cfg:
            return OidcDiscoverResponse(
                configured=True,
                provider_label=payload.provider or raw_provider,
                authorize_url=f"{settings.api_v1_prefix}/auth/oauth/{raw_provider}/login",
            )
        label = payload.provider or raw_provider
        if settings.deployment_mode == "self_hosted":
            prefix = raw_provider.upper()
            msg = (
                f"{label} sign-in is not configured. Add {prefix}_CLIENT_ID and "
                f"{prefix}_CLIENT_SECRET to .env (callback: "
                f"{settings.backend_url.rstrip('/')}{settings.api_v1_prefix}/auth/oauth/{raw_provider}/callback)."
            )
        else:
            msg = f"{label} sign-in is currently unavailable. Please sign in with your email."
        return OidcDiscoverResponse(
            configured=False,
            provider_label=label,
            authorize_url=None,
            message=msg,
        )

    provider_label = payload.provider or (
        payload.email.split("@")[1] if payload.email and "@" in payload.email else "Enterprise SSO"
    )
    if settings.oidc_issuer_url and settings.oidc_client_id:
        query = urlencode({"provider": provider_label})
        return OidcDiscoverResponse(
            configured=True,
            provider_label=provider_label,
            authorize_url=f"{settings.api_v1_prefix}/auth/oidc/login?{query}",
        )
    sso_msg = (
        f"SSO/OIDC ({provider_label}) is not configured on this instance yet. "
        "Set OIDC_ISSUER_URL, OIDC_CLIENT_ID, and OIDC_CLIENT_SECRET in .env."
        if settings.deployment_mode == "self_hosted"
        else f"No SSO connection is configured for {provider_label}. Contact your administrator or sign in with your email."
    )
    return OidcDiscoverResponse(
        configured=False,
        provider_label=provider_label,
        authorize_url=None,
        message=sso_msg,
    )


@router.get("/oauth/{provider}/login")
def social_oauth_login(provider: str) -> RedirectResponse:
    """Redirects the user to Google, GitHub, or Microsoft OAuth2 authorization screen."""
    cfg = _get_social_oauth_config(provider)
    if not cfg:
        raise DomainError(f"OAuth provider '{provider}' is not configured.", status_code=400)

    settings = get_settings()
    state = secrets.token_urlsafe(24)
    redirect_uri = (
        f"{settings.backend_url.rstrip('/')}{settings.api_v1_prefix}"
        f"/auth/oauth/{cfg['provider']}/callback"
    )
    auth_cache.set_json(
        f"oauth_state:{state}",
        {"provider": cfg["provider"], "redirect_uri": redirect_uri},
        ttl_seconds=600,
    )
    params = urlencode(
        {
            "client_id": cfg["client_id"],
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": cfg["scope"],
            "state": state,
        }
    )
    return RedirectResponse(url=f"{cfg['auth_url']}?{params}", status_code=302)


@router.get("/oauth/{provider}/callback")
async def social_oauth_callback(
    provider: str,
    code: Annotated[str, Query()],
    state: Annotated[str, Query()],
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> RedirectResponse:
    """Exchanges the OAuth2 code for user identity, provisions session, and redirects to UI."""
    cfg = _get_social_oauth_config(provider)
    state_data = auth_cache.get_json(f"oauth_state:{state}")
    if not cfg or not state_data or state_data.get("provider") != cfg["provider"]:
        raise DomainError("Invalid or expired OAuth state.", status_code=400)
    auth_cache.delete(f"oauth_state:{state}")

    async with httpx.AsyncClient(timeout=10.0) as client:
        token_resp = await client.post(
            cfg["token_url"],
            data={
                "client_id": cfg["client_id"],
                "client_secret": cfg["client_secret"],
                "code": code,
                "redirect_uri": state_data["redirect_uri"],
                "grant_type": "authorization_code",
            },
            headers={"Accept": "application/json"},
        )
        token_resp.raise_for_status()
        access_token = token_resp.json().get("access_token")
        if not access_token:
            raise DomainError("OAuth provider did not return an access_token.", status_code=502)

        user_resp = await client.get(
            cfg["userinfo_url"],
            headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
        )
        user_resp.raise_for_status()
        profile = user_resp.json()

        email = profile.get("email")
        if not email and cfg["provider"] == "github":
            emails_resp = await client.get(
                "https://api.github.com/user/emails",
                headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
            )
            if emails_resp.is_success:
                primary = next(
                    (e for e in emails_resp.json() if e.get("primary") and e.get("verified")),
                    None,
                )
                email = primary.get("email") if primary else None

    if not email:
        raise DomainError(
            "OAuth provider did not supply a verified email address.", status_code=400
        )

    return _complete_oauth_login(
        db=db,
        request=request,
        email=str(email),
        full_name=str(profile.get("name")) if profile.get("name") else None,
        provider=cfg["provider"],
        external_subject=str(profile.get("sub") or profile.get("id") or "") or None,
    )


@router.get("/oidc/login")
async def oidc_login(
    provider: Annotated[str | None, Query()] = None,
) -> RedirectResponse:
    """Initiates an OIDC Authorization Code flow against the configured identity provider."""
    settings = get_settings()
    if not settings.oidc_issuer_url or not settings.oidc_client_id:
        raise DomainError(
            "OIDC is not configured (set OIDC_ISSUER_URL and OIDC_CLIENT_ID).",
            status_code=400,
        )

    discovery_url = f"{settings.oidc_issuer_url.rstrip('/')}/.well-known/openid-configuration"
    async with httpx.AsyncClient(timeout=10.0) as client:
        disc_resp = await client.get(discovery_url)
        disc_resp.raise_for_status()
        metadata = disc_resp.json()

    auth_endpoint = metadata.get("authorization_endpoint")
    if not auth_endpoint:
        raise DomainError(
            "OIDC discovery document missing authorization_endpoint.", status_code=502
        )

    state = secrets.token_urlsafe(24)
    redirect_uri = settings.oidc_redirect_uri or "http://localhost:8000/api/v1/auth/oidc/callback"
    auth_cache.set_json(
        f"oidc_state:{state}",
        {"provider": provider or "oidc", "redirect_uri": redirect_uri},
        ttl_seconds=600,
    )
    params = urlencode(
        {
            "client_id": settings.oidc_client_id,
            "response_type": "code",
            "scope": "openid email profile",
            "redirect_uri": redirect_uri,
            "state": state,
        }
    )
    return RedirectResponse(url=f"{auth_endpoint}?{params}", status_code=302)


@router.get("/oidc/callback")
async def oidc_callback(
    code: Annotated[str, Query()],
    state: Annotated[str, Query()],
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> RedirectResponse:
    """Handles the OIDC callback, provisions/links the user, and sets the HttpOnly refresh cookie."""
    settings = get_settings()
    state_data = auth_cache.get_json(f"oidc_state:{state}")
    if not state_data or not settings.oidc_issuer_url or not settings.oidc_client_id:
        raise DomainError("Invalid or expired OIDC state.", status_code=400)
    auth_cache.delete(f"oidc_state:{state}")

    discovery_url = f"{settings.oidc_issuer_url.rstrip('/')}/.well-known/openid-configuration"
    async with httpx.AsyncClient(timeout=10.0) as client:
        metadata = (await client.get(discovery_url)).json()
        token_resp = await client.post(
            metadata["token_endpoint"],
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": state_data["redirect_uri"],
                "client_id": settings.oidc_client_id,
                "client_secret": (
                    settings.oidc_client_secret.get_secret_value()
                    if settings.oidc_client_secret
                    else ""
                ),
            },
        )
        token_resp.raise_for_status()
        tokens = token_resp.json()
        userinfo = (
            await client.get(
                metadata["userinfo_endpoint"],
                headers={"Authorization": f"Bearer {tokens['access_token']}"},
            )
        ).json()

    email = _normalize_email(str(userinfo.get("email", "")))
    sub = str(userinfo.get("sub", ""))
    full_name = userinfo.get("name")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        is_first_user = db.query(User.id).first() is None
        user = User(
            email=email,
            full_name=str(full_name) if full_name else None,
            is_superadmin=is_first_user,
            auth_provider="oidc",
            external_subject=sub or None,
            last_login_at=datetime.now(UTC),
        )
        db.add(user)
        db.flush()
        ws = Workspace(
            name="Default Workspace" if is_first_user else "Personal Workspace",
            slug=_slugify(email.split("@")[0]),
            plan_tier="self_hosted" if is_first_user else "personal",
            owner_id=user.id,
        )
        db.add(ws)
        db.flush()
        db.add(WorkspaceMember(workspace_id=ws.id, user_id=user.id, role=WorkspaceRole.OWNER.value))
    else:
        user.last_login_at = datetime.now(UTC)

    raw_refresh, _ = issue_refresh_token(
        db=db,
        user_id=user.id,
        ip_address=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    record_audit_event(
        db=db,
        action="auth.oidc_login",
        actor_user_id=user.id,
        resource_type="user",
        resource_id=user.id,
        ip_address=_client_ip(request),
    )
    db.commit()

    redirect = RedirectResponse(url="/", status_code=302)
    _set_refresh_cookie(redirect, raw_refresh)
    return redirect
