"""Authentication, JWT/Refresh-Token lifecycle, API key verification, and RBAC dependencies."""

from __future__ import annotations

import hashlib
import secrets
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, Literal

import jwt
from fastapi import Depends, Header, Request
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from app.core.cache import auth_cache
from app.core.config import get_settings
from app.core.database import get_db
from app.core.errors import DomainError
from app.core.permissions import ALL_PERMISSIONS, resolve_role_permissions
from app.models.auth import ApiKey, RefreshToken, User, Workspace, WorkspaceMember

_PASSWORD_HASHER = PasswordHash.recommended()
_AUTH_CONTEXT_CACHE_TTL = 60
REFRESH_COOKIE_NAME = "platform_refresh_token"
API_KEY_PREFIX = "sk-plat-"


@dataclass(frozen=True)
class AuthContext:
    """Resolved authenticated identity and workspace authorization context for a request.

    Attributes:
        user_id (str): Authenticated User UUID.
        email (str): Authenticated user email.
        full_name (str | None): Display name of the user.
        is_superadmin (bool): Platform-wide superadmin flag.
        workspace_id (str): Active Workspace UUID.
        workspace_name (str): Active Workspace display name.
        workspace_plan (str): Active Workspace plan tier.
        role (str): User's role inside the active workspace.
        permissions (frozenset[str]): Effective permission strings for this request.
        auth_method (Literal["jwt", "api_key"]): Authentication mechanism used.
    """

    user_id: str
    email: str
    full_name: str | None
    is_superadmin: bool
    workspace_id: str
    workspace_name: str
    workspace_plan: str
    role: str
    permissions: frozenset[str]
    auth_method: Literal["jwt", "api_key"]


def hash_password(plain_password: str) -> str:
    """Hashes a plaintext password using Argon2id.

    Args:
        plain_password (str): Raw user password.

    Returns:
        str: Argon2id encoded password hash.
    """
    return _PASSWORD_HASHER.hash(plain_password)


def verify_password(plain_password: str, password_hash: str | None) -> bool:
    """Verifies a plaintext password against a stored Argon2id hash.

    Args:
        plain_password (str): Raw user password candidate.
        password_hash (str | None): Stored Argon2id hash string.

    Returns:
        bool: True if the password matches, False otherwise.
    """
    if not password_hash:
        return False
    try:
        return _PASSWORD_HASHER.verify(plain_password, password_hash)
    except Exception:
        return False


def hash_token(raw_token: str) -> str:
    """Computes a deterministic SHA-256 hex digest for opaque tokens and API keys.

    Args:
        raw_token (str): Raw secret token string.

    Returns:
        str: 64-character lowercase SHA-256 hex digest.
    """
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def create_access_token(
    user_id: str,
    token_version: int,
    workspace_id: str | None = None,
) -> str:
    """Issues a short-lived signed JWT access token.

    Args:
        user_id (str): Authenticated User UUID.
        token_version (int): User's current token_version for instant revocation support.
        workspace_id (str | None, optional): Optional default Workspace UUID claim.
            Defaults to None.

    Returns:
        str: Compact signed JWT string.
    """
    settings = get_settings()
    now = datetime.now(UTC)
    exp = now + timedelta(minutes=settings.access_token_expire_minutes)
    payload: dict[str, Any] = {
        "sub": user_id,
        "tv": token_version,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "type": "access",
    }
    if workspace_id:
        payload["wid"] = workspace_id
    return jwt.encode(
        payload,
        settings.secret_key.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )


def decode_access_token(token: str) -> dict[str, Any]:
    """Validates and decodes a JWT access token.

    Args:
        token (str): Bearer JWT string.

    Returns:
        dict[str, Any]: Decoded token claims.

    Raises:
        DomainError: If the token is expired, malformed, or has an invalid signature.
    """
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.secret_key.get_secret_value(),
            algorithms=[settings.jwt_algorithm],
        )
    except jwt.ExpiredSignatureError as exc:
        raise DomainError(
            "Access token has expired.",
            error_code="TOKEN_EXPIRED",
            status_code=401,
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise DomainError(
            "Invalid access token.",
            error_code="INVALID_TOKEN",
            status_code=401,
        ) from exc

    if payload.get("type") != "access" or not payload.get("sub"):
        raise DomainError(
            "Invalid access token claims.", error_code="INVALID_TOKEN", status_code=401
        )
    return payload


def issue_refresh_token(
    db: Session,
    user_id: str,
    family_id: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> tuple[str, RefreshToken]:
    """Creates and persists a new rotating refresh token record.

    Args:
        db (Session): Active SQLAlchemy database session.
        user_id (str): Owning User UUID.
        family_id (str | None, optional): Existing token family UUID for rotation, or None
            to start a new login session family. Defaults to None.
        ip_address (str | None, optional): Client IP address. Defaults to None.
        user_agent (str | None, optional): Client User-Agent header. Defaults to None.

    Returns:
        tuple[str, RefreshToken]: Raw opaque refresh token and persisted ORM record.
    """
    settings = get_settings()
    raw_token = f"rt_{secrets.token_urlsafe(48)}"
    fam = family_id or secrets.token_hex(16)
    expires_at = datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days)
    record = RefreshToken(
        user_id=user_id,
        family_id=fam,
        token_hash=hash_token(raw_token),
        expires_at=expires_at,
        ip_address=ip_address,
        user_agent=(user_agent or "")[:255] or None,
    )
    db.add(record)
    db.flush()
    return raw_token, record


def revoke_refresh_token_family(db: Session, family_id: str) -> None:
    """Revokes every refresh token belonging to a compromised or logged-out family.

    Args:
        db (Session): Active SQLAlchemy database session.
        family_id (str): Refresh token family identifier.
    """
    now = datetime.now(UTC)
    (
        db.query(RefreshToken)
        .filter(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .update({"revoked_at": now}, synchronize_session=False)
    )


def rotate_refresh_token(
    db: Session,
    raw_token: str,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> tuple[User, str, RefreshToken]:
    """Rotates a refresh token and revokes the whole family if reuse-theft is detected.

    Args:
        db (Session): Active SQLAlchemy database session.
        raw_token (str): Opaque refresh token presented by the client.
        ip_address (str | None, optional): Client IP address. Defaults to None.
        user_agent (str | None, optional): Client User-Agent header. Defaults to None.

    Returns:
        tuple[User, str, RefreshToken]: Authenticated User, new raw token, and new DB record.

    Raises:
        DomainError: If the token is unknown, expired, reused, or the user is inactive.
    """
    token_hash = hash_token(raw_token)
    existing = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    if not existing:
        raise DomainError("Invalid refresh token.", error_code="INVALID_REFRESH", status_code=401)

    # [Security] Reuse of an already-rotated token indicates theft: revoke the entire family
    if existing.revoked_at is not None:
        revoke_refresh_token_family(db, existing.family_id)
        db.commit()
        raise DomainError(
            "Refresh token reuse detected; session revoked.",
            error_code="REFRESH_TOKEN_REUSED",
            status_code=401,
        )

    now = datetime.now(UTC)
    exp = (
        existing.expires_at.replace(tzinfo=UTC)
        if existing.expires_at.tzinfo is None
        else existing.expires_at
    )
    if exp <= now:
        existing.revoked_at = now
        db.commit()
        raise DomainError("Refresh token expired.", error_code="REFRESH_EXPIRED", status_code=401)

    user = db.query(User).filter(User.id == existing.user_id).first()
    if not user or not user.is_active:
        raise DomainError("User account is inactive.", error_code="USER_INACTIVE", status_code=403)

    new_raw, new_record = issue_refresh_token(
        db=db,
        user_id=user.id,
        family_id=existing.family_id,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    existing.revoked_at = now
    existing.replaced_by_id = new_record.id
    db.commit()
    return user, new_raw, new_record


def generate_api_key() -> tuple[str, str, str]:
    """Generates a new scoped API key with an indexed lookup prefix and SHA-256 hash.

    Returns:
        tuple[str, str, str]: ``(raw_key, key_prefix, key_hash)``.
    """
    secret_part = secrets.token_urlsafe(32)
    raw_key = f"{API_KEY_PREFIX}{secret_part}"
    key_prefix = raw_key[:16]
    return raw_key, key_prefix, hash_token(raw_key)


def _resolve_workspace_for_user(
    db: Session,
    user: User,
    requested_workspace_id: str | None,
) -> tuple[Workspace, WorkspaceMember]:
    """Resolves the target workspace and membership for an authenticated user.

    Args:
        db (Session): Active SQLAlchemy database session.
        user (User): Authenticated User ORM entity.
        requested_workspace_id (str | None): Optional workspace UUID from header/claim.

    Returns:
        tuple[Workspace, WorkspaceMember]: Active Workspace and membership record.

    Raises:
        DomainError: If the user is not a member of the requested or any workspace.
    """
    query = (
        db.query(Workspace, WorkspaceMember)
        .join(WorkspaceMember, Workspace.id == WorkspaceMember.workspace_id)
        .filter(WorkspaceMember.user_id == user.id)
    )
    if requested_workspace_id:
        pair = query.filter(Workspace.id == requested_workspace_id).first()
        if not pair:
            raise DomainError(
                "You do not have access to the requested workspace.",
                error_code="WORKSPACE_FORBIDDEN",
                status_code=403,
            )
        return pair[0], pair[1]

    pair = query.order_by(Workspace.created_at.asc()).first()
    if not pair:
        raise DomainError(
            "User does not belong to any workspace.",
            error_code="NO_WORKSPACE",
            status_code=403,
        )
    return pair[0], pair[1]


def _resolve_jwt_auth_context(
    db: Session,
    token: str,
    x_workspace_id: str | None,
) -> AuthContext:
    """Resolves an ``AuthContext`` from a Bearer JWT, leveraging Redis cache when possible.

    Args:
        db (Session): Active SQLAlchemy database session.
        token (str): Raw JWT access token.
        x_workspace_id (str | None): Optional ``X-Workspace-Id`` override header.

    Returns:
        AuthContext: Validated identity and workspace permissions context.
    """
    claims = decode_access_token(token)
    user_id = str(claims["sub"])
    token_version = int(claims.get("tv", 0))
    target_wid = x_workspace_id or claims.get("wid")

    if target_wid:
        cache_key = f"auth_ctx:{user_id}:{target_wid}"
        cached = auth_cache.get_json(cache_key)
        if cached and int(cached.get("token_version", -1)) == token_version:
            return AuthContext(
                user_id=cached["user_id"],
                email=cached["email"],
                full_name=cached.get("full_name"),
                is_superadmin=bool(cached.get("is_superadmin", False)),
                workspace_id=cached["workspace_id"],
                workspace_name=cached["workspace_name"],
                workspace_plan=cached["workspace_plan"],
                role=cached["role"],
                permissions=frozenset(cached.get("permissions", [])),
                auth_method="jwt",
            )

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise DomainError("User account not found or inactive.", status_code=401)
    if user.token_version != token_version:
        raise DomainError("Token has been revoked.", error_code="TOKEN_REVOKED", status_code=401)

    workspace, membership = _resolve_workspace_for_user(db, user, target_wid)
    perms = (
        ALL_PERMISSIONS
        if user.is_superadmin
        else resolve_role_permissions(membership.role, membership.custom_permissions)
    )

    auth_cache.set_json(
        f"auth_ctx:{user.id}:{workspace.id}",
        {
            "user_id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "is_superadmin": user.is_superadmin,
            "token_version": user.token_version,
            "workspace_id": workspace.id,
            "workspace_name": workspace.name,
            "workspace_plan": workspace.plan_tier,
            "role": membership.role,
            "permissions": sorted(perms),
        },
        ttl_seconds=_AUTH_CONTEXT_CACHE_TTL,
    )

    return AuthContext(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_superadmin=user.is_superadmin,
        workspace_id=workspace.id,
        workspace_name=workspace.name,
        workspace_plan=workspace.plan_tier,
        role=membership.role,
        permissions=perms,
        auth_method="jwt",
    )


def _resolve_api_key_auth_context(
    db: Session,
    raw_key: str,
    x_workspace_id: str | None,
) -> AuthContext:
    """Resolves an ``AuthContext`` from a scoped ``sk-plat-...`` programmatic API key.

    Args:
        db (Session): Active SQLAlchemy database session.
        raw_key (str): Raw Bearer API key.
        x_workspace_id (str | None): Optional ``X-Workspace-Id`` header (must match key).

    Returns:
        AuthContext: Validated API-key identity and scoped permissions.

    Raises:
        DomainError: If the API key is invalid, revoked, expired, or workspace-mismatched.
    """
    key_hash = hash_token(raw_key)
    cache_key = f"api_key:{key_hash}"
    cached = auth_cache.get_json(cache_key)
    if cached:
        if x_workspace_id and x_workspace_id != cached["workspace_id"]:
            raise DomainError("API key is not valid for this workspace.", status_code=403)
        return AuthContext(
            user_id=cached["user_id"],
            email=cached["email"],
            full_name=cached.get("full_name"),
            is_superadmin=False,
            workspace_id=cached["workspace_id"],
            workspace_name=cached["workspace_name"],
            workspace_plan=cached["workspace_plan"],
            role=cached["role"],
            permissions=frozenset(cached.get("permissions", [])),
            auth_method="api_key",
        )

    api_key = db.query(ApiKey).filter(ApiKey.key_hash == key_hash).first()
    if not api_key or api_key.revoked_at is not None:
        raise DomainError(
            "Invalid or revoked API key.", error_code="INVALID_API_KEY", status_code=401
        )

    now = datetime.now(UTC)
    if api_key.expires_at is not None:
        exp = (
            api_key.expires_at.replace(tzinfo=UTC)
            if api_key.expires_at.tzinfo is None
            else api_key.expires_at
        )
        if exp <= now:
            raise DomainError("API key has expired.", error_code="API_KEY_EXPIRED", status_code=401)

    if x_workspace_id and x_workspace_id != api_key.workspace_id:
        raise DomainError("API key is not valid for this workspace.", status_code=403)

    user = db.query(User).filter(User.id == api_key.user_id).first()
    workspace = db.query(Workspace).filter(Workspace.id == api_key.workspace_id).first()
    membership = (
        db.query(WorkspaceMember)
        .filter(
            WorkspaceMember.workspace_id == api_key.workspace_id,
            WorkspaceMember.user_id == api_key.user_id,
        )
        .first()
    )
    if not user or not user.is_active or not workspace or not membership:
        raise DomainError("API key owner or workspace is inactive.", status_code=403)

    role_perms = resolve_role_permissions(membership.role, membership.custom_permissions)
    # [Least Privilege] Intersect explicit API key scopes with the member's role permissions
    effective_perms = role_perms & frozenset(api_key.scopes) if api_key.scopes else role_perms

    api_key.last_used_at = now
    db.commit()

    auth_cache.set_json(
        cache_key,
        {
            "user_id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "workspace_id": workspace.id,
            "workspace_name": workspace.name,
            "workspace_plan": workspace.plan_tier,
            "role": membership.role,
            "permissions": sorted(effective_perms),
        },
        ttl_seconds=_AUTH_CONTEXT_CACHE_TTL,
    )

    return AuthContext(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_superadmin=False,
        workspace_id=workspace.id,
        workspace_name=workspace.name,
        workspace_plan=workspace.plan_tier,
        role=membership.role,
        permissions=effective_perms,
        auth_method="api_key",
    )


def get_auth_context(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    authorization: Annotated[str | None, Header()] = None,
    x_workspace_id: Annotated[str | None, Header(alias="X-Workspace-Id")] = None,
) -> AuthContext:
    """FastAPI dependency resolving the authenticated user, active workspace, and RBAC permissions.

    Args:
        request (Request): Incoming FastAPI request.
        db (Session): Active SQLAlchemy database session.
        authorization (str | None): ``Authorization: Bearer <token>`` header.
        x_workspace_id (str | None): Optional ``X-Workspace-Id`` header selecting target workspace.

    Returns:
        AuthContext: Resolved authorization context.

    Raises:
        DomainError: If credentials are missing, invalid, or forbidden.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise DomainError(
            "Authentication credentials were not provided.",
            error_code="UNAUTHORIZED",
            status_code=401,
        )

    raw_token = authorization.split(" ", 1)[1].strip()
    if not raw_token:
        raise DomainError("Empty bearer token.", error_code="UNAUTHORIZED", status_code=401)

    if raw_token.startswith(API_KEY_PREFIX):
        ctx = _resolve_api_key_auth_context(db, raw_token, x_workspace_id)
    else:
        ctx = _resolve_jwt_auth_context(db, raw_token, x_workspace_id)

    request.state.auth_context = ctx
    return ctx


def require_permission(permission: str) -> Callable[[AuthContext], AuthContext]:
    """Creates a FastAPI dependency that enforces a specific RBAC permission.

    Args:
        permission (str): Required permission string (e.g., ``agents:write``).

    Returns:
        Callable[[AuthContext], AuthContext]: Dependency verifying permission membership.
    """

    def _checker(ctx: Annotated[AuthContext, Depends(get_auth_context)]) -> AuthContext:
        if permission not in ctx.permissions:
            raise DomainError(
                f"Missing required permission '{permission}' for role '{ctx.role}'.",
                error_code="FORBIDDEN",
                status_code=403,
            )
        return ctx

    return _checker
