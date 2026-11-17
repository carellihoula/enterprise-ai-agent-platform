"""Role-Based Access Control (RBAC) permission constants and role-to-permission resolution."""

from __future__ import annotations

from enum import StrEnum


class WorkspaceRole(StrEnum):
    """Canonical workspace membership roles ordered from highest to lowest privilege."""

    OWNER = "owner"
    ADMIN = "admin"
    BUILDER = "builder"
    MEMBER = "member"
    VIEWER = "viewer"


class Permission(StrEnum):
    """Fine-grained resource and action permissions enforced by FastAPI dependencies."""

    CHAT_RUN = "chat:run"
    SESSIONS_READ = "sessions:read"
    SESSIONS_WRITE = "sessions:write"
    ATTACHMENTS_READ = "attachments:read"
    ATTACHMENTS_WRITE = "attachments:write"
    AGENTS_READ = "agents:read"
    AGENTS_WRITE = "agents:write"
    AGENTS_DELETE = "agents:delete"
    MCP_READ = "mcp:read"
    MCP_MANAGE = "mcp:manage"
    TOOLS_READ = "tools:read"
    TOOLS_EXECUTE = "tools:execute"
    MEMORIES_READ = "memories:read"
    MEMORIES_WRITE = "memories:write"
    MEMBERS_READ = "members:read"
    MEMBERS_MANAGE = "members:manage"
    WORKSPACE_MANAGE = "workspace:manage"
    APIKEYS_MANAGE = "apikeys:manage"
    AUDIT_READ = "audit:read"


ALL_PERMISSIONS: frozenset[str] = frozenset(p.value for p in Permission)

_VIEWER_PERMISSIONS: frozenset[str] = frozenset(
    {
        Permission.SESSIONS_READ.value,
        Permission.ATTACHMENTS_READ.value,
        Permission.AGENTS_READ.value,
        Permission.MCP_READ.value,
        Permission.TOOLS_READ.value,
        Permission.MEMORIES_READ.value,
        Permission.MEMBERS_READ.value,
    }
)

_MEMBER_PERMISSIONS: frozenset[str] = _VIEWER_PERMISSIONS | frozenset(
    {
        Permission.CHAT_RUN.value,
        Permission.SESSIONS_WRITE.value,
        Permission.ATTACHMENTS_WRITE.value,
        Permission.TOOLS_EXECUTE.value,
        Permission.MEMORIES_WRITE.value,
    }
)

_BUILDER_PERMISSIONS: frozenset[str] = _MEMBER_PERMISSIONS | frozenset(
    {
        Permission.AGENTS_WRITE.value,
        Permission.AGENTS_DELETE.value,
        Permission.MCP_MANAGE.value,
    }
)

_ADMIN_PERMISSIONS: frozenset[str] = _BUILDER_PERMISSIONS | frozenset(
    {
        Permission.MEMBERS_MANAGE.value,
        Permission.WORKSPACE_MANAGE.value,
        Permission.APIKEYS_MANAGE.value,
        Permission.AUDIT_READ.value,
    }
)

ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    WorkspaceRole.VIEWER.value: _VIEWER_PERMISSIONS,
    WorkspaceRole.MEMBER.value: _MEMBER_PERMISSIONS,
    WorkspaceRole.BUILDER.value: _BUILDER_PERMISSIONS,
    WorkspaceRole.ADMIN.value: _ADMIN_PERMISSIONS,
    WorkspaceRole.OWNER.value: ALL_PERMISSIONS,
}


def resolve_role_permissions(
    role: str,
    custom_permissions: list[str] | None = None,
) -> frozenset[str]:
    """Resolves the effective permission set for a workspace role and optional overrides.

    Args:
        role (str): Workspace role identifier (``owner``, ``admin``, ``builder``,
            ``member``, or ``viewer``).
        custom_permissions (list[str] | None, optional): Additional permission strings
            granted specifically to a member. Defaults to None.

    Returns:
        frozenset[str]: Effective immutable set of permission strings.
    """
    base = ROLE_PERMISSIONS.get(role.lower().strip(), frozenset())
    if not custom_permissions:
        return base
    valid_extras = {p for p in custom_permissions if p in ALL_PERMISSIONS}
    return base | frozenset(valid_extras)
