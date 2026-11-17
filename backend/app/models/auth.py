"""Relational database entity models for authentication, multi-tenant workspaces, RBAC, and auditing.

This module defines SQLAlchemy ORM models for users, workspaces, role-based memberships,
invitations, rotating refresh tokens, scoped API keys, and enterprise audit logs.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    false,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.entities import current_utc_time, generate_uuid


class User(Base):
    """SQLAlchemy ORM model representing an authenticated platform user.

    Attributes:
        id (str): Primary key UUID string identifier.
        email (str): Unique lowercase email address used for authentication.
        full_name (str | None): Display name of the user.
        password_hash (str | None): Argon2id password hash (null for OIDC-only accounts).
        is_active (bool): Whether the account is permitted to authenticate.
        is_superadmin (bool): Platform-wide administrator flag (e.g., first self-hosted admin).
        auth_provider (str): Identity source (`local` or `oidc`).
        external_subject (str | None): OIDC `sub` identifier when federated.
        token_version (int): Monotonic counter allowing instant JWT invalidation across devices.
        created_at (datetime): Account creation timestamp.
        last_login_at (datetime | None): Timestamp of the most recent successful login.
    """

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    full_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    password_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=true()
    )
    is_superadmin: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    auth_provider: Mapped[str] = mapped_column(
        String(32), nullable=False, default="local", server_default="local"
    )
    external_subject: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    token_version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=current_utc_time)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # [Relationship] Workspace memberships owned by this user
    memberships: Mapped[list["WorkspaceMember"]] = relationship(
        "WorkspaceMember",
        back_populates="user",
        cascade="all, delete-orphan",
    )


class Workspace(Base):
    """SQLAlchemy ORM model representing a tenant workspace (personal, team, or enterprise).

    Attributes:
        id (str): Primary key UUID string identifier.
        name (str): Human-readable workspace name.
        slug (str): Unique URL-safe workspace identifier.
        plan_tier (str): Workspace tier (`personal`, `team`, `enterprise`, `self_hosted`).
        owner_id (str): Foreign key referencing the owning User.
        sso_enforced (bool): When True, local password login is disabled for this workspace.
        created_at (datetime): Creation timestamp.
        updated_at (datetime): Last modification timestamp.
    """

    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False, index=True)
    plan_tier: Mapped[str] = mapped_column(
        String(32), nullable=False, default="personal", server_default="personal"
    )
    owner_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sso_enforced: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=current_utc_time)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=current_utc_time, onupdate=current_utc_time
    )

    # [Relationship] Members belonging to this workspace
    members: Mapped[list["WorkspaceMember"]] = relationship(
        "WorkspaceMember",
        back_populates="workspace",
        cascade="all, delete-orphan",
    )


class WorkspaceMember(Base):
    """SQLAlchemy ORM model linking a User to a Workspace with an RBAC role.

    Attributes:
        id (str): Primary key UUID string identifier.
        workspace_id (str): Foreign key referencing the parent Workspace.
        user_id (str): Foreign key referencing the member User.
        role (str): Assigned RBAC role (`owner`, `admin`, `builder`, `member`, `viewer`).
        custom_permissions (list[str]): Optional fine-grained permission overrides.
        joined_at (datetime): Timestamp when the user joined the workspace.
    """

    __tablename__ = "workspace_members"
    __table_args__ = (UniqueConstraint("workspace_id", "user_id", name="uq_workspace_member"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    workspace_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(
        String(32), nullable=False, default="member", server_default="member"
    )
    custom_permissions: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list, server_default="[]"
    )
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=current_utc_time)

    # [Relationship] Parent workspace and user references
    workspace: Mapped[Workspace] = relationship("Workspace", back_populates="members")
    user: Mapped[User] = relationship("User", back_populates="memberships")


class WorkspaceInvitation(Base):
    """SQLAlchemy ORM model representing a pending email invitation to join a Workspace.

    Attributes:
        id (str): Primary key UUID string identifier.
        workspace_id (str): Target Workspace UUID.
        email (str): Invited recipient email address.
        role (str): Role granted upon acceptance.
        token_hash (str): SHA-256 hash of the secret invitation token.
        invited_by (str | None): Inviting User UUID.
        expires_at (datetime): Invitation expiration timestamp.
        accepted_at (datetime | None): Timestamp when accepted, or None if pending.
        created_at (datetime): Creation timestamp.
    """

    __tablename__ = "workspace_invitations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    workspace_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    role: Mapped[str] = mapped_column(
        String(32), nullable=False, default="member", server_default="member"
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    invited_by: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=current_utc_time)


class RefreshToken(Base):
    """SQLAlchemy ORM model for rotating refresh tokens with reuse-theft detection.

    Attributes:
        id (str): Primary key UUID string identifier.
        user_id (str): Owning User UUID.
        family_id (str): Token family UUID shared across rotations for theft detection.
        token_hash (str): SHA-256 hash of the opaque refresh token.
        expires_at (datetime): Token expiration timestamp.
        revoked_at (datetime | None): Revocation timestamp if rotated or logged out.
        replaced_by_id (str | None): Child RefreshToken ID created during rotation.
        user_agent (str | None): Client user-agent metadata.
        ip_address (str | None): Originating client IP address.
        created_at (datetime): Issuance timestamp.
    """

    __tablename__ = "refresh_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    family_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    replaced_by_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=current_utc_time)


class ApiKey(Base):
    """SQLAlchemy ORM model representing a scoped programmatic API key for SDK/CI access.

    Attributes:
        id (str): Primary key UUID string identifier.
        workspace_id (str): Scoped Workspace UUID.
        user_id (str): Creating User UUID.
        name (str): Descriptive key label.
        key_prefix (str): Indexed public prefix (e.g., ``sk-plat-1a2b``) for fast lookup.
        key_hash (str): SHA-256 hash of the full secret API key.
        scopes (list[str]): Explicit permission scopes granted to this key.
        expires_at (datetime | None): Optional expiration timestamp.
        last_used_at (datetime | None): Timestamp of last authenticated request.
        revoked_at (datetime | None): Revocation timestamp if deactivated.
        created_at (datetime): Creation timestamp.
    """

    __tablename__ = "api_keys"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    workspace_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    key_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    scopes: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list, server_default="[]"
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=current_utc_time)


class AuditLog(Base):
    """SQLAlchemy ORM model recording security and governance audit events.

    Attributes:
        id (str): Primary key UUID string identifier.
        workspace_id (str | None): Associated Workspace UUID, if workspace-scoped.
        actor_user_id (str | None): Acting User UUID (preserved as NULL if user is deleted).
        action (str): Canonical dot-separated event action (e.g., ``agent.delete``).
        resource_type (str | None): Target entity type (e.g., ``agent``, ``member``).
        resource_id (str | None): Target entity UUID.
        metadata_json (dict[str, Any]): Non-sensitive contextual details.
        ip_address (str | None): Client IP address.
        created_at (datetime): Event timestamp.
    """

    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    workspace_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    actor_user_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    resource_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    resource_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        JSON, nullable=False, default=dict, server_default="{}"
    )
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=current_utc_time, index=True
    )
