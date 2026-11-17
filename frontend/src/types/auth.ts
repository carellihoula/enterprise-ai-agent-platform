/**
 * Type definitions for Authentication, Multi-Tenant Workspaces, RBAC, API Keys, and Audit Logs.
 */

export type WorkspaceRole = "owner" | "admin" | "builder" | "member" | "viewer";

export interface UserSummary {
  id: string;
  email: string;
  full_name?: string | null;
  is_superadmin: boolean;
  auth_provider: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  plan_tier: string;
  role: WorkspaceRole | string;
}

export interface AuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: UserSummary;
  active_workspace_id: string;
  workspaces: WorkspaceSummary[];
}

export interface AuthMeResponse {
  user: UserSummary;
  active_workspace_id: string;
  active_role: string;
  permissions: string[];
  workspaces: WorkspaceSummary[];
}

export interface BootstrapStatusResponse {
  needs_setup: boolean;
  auth_mode: string;
  allow_public_signup: boolean;
}

export interface WorkspaceMemberDto {
  user_id: string;
  email: string;
  full_name?: string | null;
  role: string;
  joined_at: string;
}

export interface InvitationDto {
  id: string;
  workspace_id: string;
  email: string;
  role: string;
  invite_token: string;
  expires_at: string;
}

export interface ApiKeyDto {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  expires_at?: string | null;
  last_used_at?: string | null;
  revoked_at?: string | null;
  created_at: string;
}

export interface ApiKeyCreatedDto extends ApiKeyDto {
  raw_key: string;
}

export interface AuditLogDto {
  id: string;
  action: string;
  actor_user_id?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  metadata_json: Record<string, unknown>;
  ip_address?: string | null;
  created_at: string;
}
