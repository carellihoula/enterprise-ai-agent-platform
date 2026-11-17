/**
 * API client module for interacting with the backend AI platform endpoints.
 *
 * Provides methods for fetching sessions, creating new sessions, deleting sessions,
 * loading session details, and streaming chat completions via Server-Sent Events (SSE).
 */

import { ChatAttachment, Message, Session } from '@/types/chat';
import {
  Agent,
  AgentCreatePayload,
  AgentUpdatePayload,
  Assistant,
  AssistantCreatePayload,
  AssistantUpdatePayload,
} from '@/types/agent';
import { McpConfigResponseDto, McpServerDto, McpTestResponseDto } from '@/types/mcp';
import {
  ApiKeyCreatedDto,
  ApiKeyDto,
  AuditLogDto,
  AuthMeResponse,
  AuthTokenResponse,
  BootstrapStatusResponse,
  InvitationDto,
  WorkspaceMemberDto,
  WorkspaceSummary,
} from '@/types/auth';
import { cleanSerializedContentBlocks } from '@/lib/utils';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

let _accessToken: string | null = null;
let _activeWorkspaceId: string | null = null;
let _onUnauthorized: (() => void) | null = null;
let _refreshPromise: Promise<string | null> | null = null;

export function setAuthSession(accessToken: string | null, workspaceId: string | null): void {
  _accessToken = accessToken;
  _activeWorkspaceId = workspaceId;
}

export function setActiveWorkspaceId(workspaceId: string | null): void {
  _activeWorkspaceId = workspaceId;
}

export function clearAuthSession(): void {
  _accessToken = null;
  _activeWorkspaceId = null;
}

export function setOnUnauthorizedCallback(cb: (() => void) | null): void {
  _onUnauthorized = cb;
}

async function _attemptTokenRefresh(): Promise<string | null> {
  if (_refreshPromise) {
    return _refreshPromise;
  }
  _refreshPromise = (async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        return null;
      }
      const data: AuthTokenResponse = await res.json();
      _accessToken = data.access_token;
      if (!_activeWorkspaceId) {
        _activeWorkspaceId = data.active_workspace_id;
      }
      return data.access_token;
    } catch {
      return null;
    } finally {
      _refreshPromise = null;
    }
  })();
  return _refreshPromise;
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const buildHeaders = (token: string | null): Headers => {
    const headers = new Headers(init.headers);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (_activeWorkspaceId) {
      headers.set('X-Workspace-Id', _activeWorkspaceId);
    }
    return headers;
  };

  let res = await fetch(input, {
    ...init,
    credentials: 'include',
    headers: buildHeaders(_accessToken),
  });

  if (res.status === 401 && !input.includes('/auth/login') && !input.includes('/auth/register')) {
    const newToken = await _attemptTokenRefresh();
    if (newToken) {
      res = await fetch(input, {
        ...init,
        credentials: 'include',
        headers: buildHeaders(newToken),
      });
    } else {
      clearAuthSession();
      _onUnauthorized?.();
    }
  }
  return res;
}

export async function fetchSessions(): Promise<Session[]> {
  const res = await apiFetch(`${API_BASE_URL}/sessions`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch sessions (${res.status})`);
  }
  return res.json();
}

export async function createSession(title?: string, agentId?: string): Promise<Session> {
  const res = await apiFetch(`${API_BASE_URL}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, agent_id: agentId }),
  });
  if (!res.ok) {
    throw new Error(`Failed to create session (${res.status})`);
  }
  return res.json();
}

export async function fetchSessionDetails(sessionId: string): Promise<Session> {
  const res = await apiFetch(`${API_BASE_URL}/sessions/${sessionId}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch session details (${res.status})`);
  }
  return res.json();
}

export async function deleteSession(sessionId: string): Promise<void> {
  const res = await apiFetch(`${API_BASE_URL}/sessions/${sessionId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`Failed to delete session (${res.status})`);
  }
}

export interface ChatToolEvent {
  type: 'tool_start' | 'tool_end' | 'think' | 'think_delta' | 'approval_required';
  tool_name?: string;
  ok?: boolean;
  latency_ms?: number;
  arguments?: Record<string, unknown>;
  output?: string;
  text?: string;
  delta?: string;
  approval_id?: string;
  reason?: string;
}

export interface StreamChatParams {
  sessionId?: string;
  assistantId?: string;
  messages: Message[];
  providerName: string;
  modelName: string;
  temperature?: number;
  maxTokens?: number;
  enableReasoning?: boolean;
  reasoningEffort?: 'low' | 'medium' | 'high';
  systemInstruction?: string;
  apiKey?: string;
  baseUrl?: string;
  attachmentIds?: string[];
  abortSignal?: AbortSignal;
  onChunk: (delta: string) => void;
  onToolEvent?: (event: ChatToolEvent) => void;
  onFinish?: () => void;
  onError?: (error: Error) => void;
}

export async function streamChatCompletion({
  sessionId,
  assistantId,
  messages,
  providerName,
  modelName,
  temperature = 0.7,
  maxTokens,
  enableReasoning,
  reasoningEffort,
  systemInstruction,
  apiKey,
  baseUrl,
  attachmentIds,
  abortSignal,
  onChunk,
  onToolEvent,
  onFinish,
  onError,
}: StreamChatParams): Promise<void> {
  try {
    const response = await apiFetch(`${API_BASE_URL}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abortSignal,
      body: JSON.stringify({
        session_id: sessionId,
        assistant_id: assistantId,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        provider_name: providerName,
        model_name: modelName,
        temperature,
        max_tokens: maxTokens || undefined,
        enable_reasoning: enableReasoning,
        reasoning_effort: reasoningEffort,
        system_instruction: systemInstruction || undefined,
        api_key: apiKey || undefined,
        base_url: baseUrl || undefined,
        attachment_ids: attachmentIds?.length ? attachmentIds : undefined,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Chat API error (${response.status}): ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed.startsWith('data: ')) {
          const dataStr = trimmed.slice(6).trim();
          if (dataStr === '[DONE]') {
            onFinish?.();
            return;
          }

          let streamError: Error | null = null;
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.error) {
              streamError = new Error(parsed.error);
            } else if (parsed.tool_event) {
              onToolEvent?.(parsed.tool_event as ChatToolEvent);
            } else if (parsed.delta_content !== undefined && parsed.delta_content !== null) {
              // [Parsing] Normalize any serialized content blocks to pure text
              const rawDelta = String(parsed.delta_content);
              const cleaned = cleanSerializedContentBlocks(rawDelta);
              if (cleaned) {
                onChunk(cleaned);
              }
            }
          } catch (e) {
            // Ignore partial JSON parsing errors
          }
          if (streamError) {
            throw streamError;
          }
        }
      }
    }
    onFinish?.();
  } catch (err: any) {
    onError?.(err instanceof Error ? err : new Error(String(err)));
  }
}

export async function fetchAgents(): Promise<Agent[]> {
  const res = await apiFetch(`${API_BASE_URL}/agents`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch agents (${res.status})`);
  }
  return res.json();
}

export async function fetchAgent(id: string): Promise<Agent> {
  const res = await apiFetch(`${API_BASE_URL}/agents/${id}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch agent ${id} (${res.status})`);
  }
  return res.json();
}

export async function createAgentApi(payload: AgentCreatePayload): Promise<Agent> {
  const res = await apiFetch(`${API_BASE_URL}/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Failed to create agent (${res.status})`);
  }
  return res.json();
}

export async function updateAgentApi(
  id: string,
  payload: AgentUpdatePayload
): Promise<Agent> {
  const res = await apiFetch(`${API_BASE_URL}/agents/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Failed to update agent ${id} (${res.status})`);
  }
  return res.json();
}

export async function deleteAgentApi(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE_URL}/agents/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`Failed to delete agent ${id} (${res.status})`);
  }
}

// [Compatibility Aliases]
export const fetchAssistants = fetchAgents;
export const fetchAssistant = fetchAgent;
export const createAssistantApi = createAgentApi;
export const updateAssistantApi = updateAgentApi;
export const deleteAssistantApi = deleteAgentApi;

/**
 * Fetches the persisted MCP servers configuration from the backend.
 *
 * Args:
 *   agentId (string | undefined): Optional agent ID scope.
 *
 * Returns:
 *   Promise<McpConfigResponseDto>: Synchronized structured servers and mcpServers JSON map.
 */
export async function fetchMcpConfig(agentId?: string): Promise<McpConfigResponseDto> {
  const query = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : '';
  const res = await apiFetch(`${API_BASE_URL}/mcp${query}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch MCP configuration (${res.status})`);
  }
  return res.json();
}

/**
 * Synchronizes the full MCP servers configuration with the backend database.
 *
 * Args:
 *   servers (McpServerDto[]): Ordered list of MCP server payloads to persist.
 *   agentId (string | undefined): Optional agent ID scope.
 *
 * Returns:
 *   Promise<McpConfigResponseDto>: Persisted MCP configuration response.
 */
export async function syncMcpConfig(
  servers: McpServerDto[],
  agentId?: string
): Promise<McpConfigResponseDto> {
  const query = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : '';
  const res = await apiFetch(`${API_BASE_URL}/mcp${query}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ servers }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to save MCP configuration (${res.status}): ${errText}`);
  }
  return res.json();
}

/**
 * Probes a single MCP server configuration in an isolated disposable sandbox or remote check.
 *
 * Args:
 *   server (McpServerDto): MCP server configuration payload to test.
 *
 * Returns:
 *   Promise<McpTestResponseDto>: Live handshake status, discovered tools count, and diagnostics.
 */
export async function testMcpServer(server: McpServerDto): Promise<McpTestResponseDto> {
  const res = await apiFetch(`${API_BASE_URL}/mcp/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(server),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Connection test failed (${res.status}): ${errText}`);
  }
  return res.json();
}

export interface BuiltinToolDescriptor {
  name: string;
  description: string;
  category: string;
  parameters_schema: Record<string, unknown>;
  sample_args: Record<string, unknown>;
}

export interface BuiltinToolExecuteResult {
  ok: boolean;
  result: Record<string, unknown> | null;
  error: string | null;
  latency_ms: number;
}

export async function fetchBuiltinTools(): Promise<BuiltinToolDescriptor[]> {
  const res = await apiFetch(`${API_BASE_URL}/tools/builtin`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to load built-in tools (${res.status}): ${errText}`);
  }
  return res.json();
}

export async function testBuiltinTool(
  name: string,
  args: Record<string, unknown>,
): Promise<BuiltinToolExecuteResult> {
  const res = await apiFetch(`${API_BASE_URL}/tools/builtin/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, arguments: args }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Built-in tool execution failed (${res.status}): ${errText}`);
  }
  return res.json();
}

export async function resolveToolApproval(
  approvalId: string,
  decision: 'approve' | 'reject',
): Promise<{ approval_id: string; decision: 'approve' | 'reject' }> {
  const res = await apiFetch(`${API_BASE_URL}/chat/approvals/${approvalId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to resolve tool approval (${res.status}): ${errText}`);
  }
  return res.json();
}

export function getAttachmentContentUrl(attachmentId: string): string {
  return `${API_BASE_URL}/attachments/${attachmentId}/content`;
}

export async function uploadChatAttachment(
  file: File,
  sessionId?: string,
): Promise<ChatAttachment> {
  const formData = new FormData();
  formData.append('file', file);
  if (sessionId) {
    formData.append('session_id', sessionId);
  }
  const res = await apiFetch(`${API_BASE_URL}/attachments`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    let detail = `Failed to upload file (${res.status})`;
    try {
      const errJson = await res.json();
      detail = errJson.message || errJson.detail || detail;
    } catch {
      const text = await res.text();
      if (text) detail = text;
    }
    throw new Error(detail);
  }
  return res.json();
}

export async function deleteChatAttachment(attachmentId: string): Promise<void> {
  const res = await apiFetch(`${API_BASE_URL}/attachments/${attachmentId}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete attachment (${res.status})`);
  }
}

async function _parseErrorDetail(res: Response, fallback: string): Promise<string> {
  try {
    const json = await res.json();
    return json.error?.message || json.message || json.detail || fallback;
  } catch {
    return fallback;
  }
}

export async function fetchBootstrapStatus(): Promise<BootstrapStatusResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/bootstrap-status`, {
    cache: 'no-store',
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error('Failed to fetch bootstrap status');
  }
  return res.json();
}

export async function loginUser(email: string, password: string): Promise<AuthTokenResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(await _parseErrorDetail(res, `Login failed (${res.status})`));
  }
  return res.json();
}

export async function registerUser(params: {
  email: string;
  password: string;
  fullName?: string;
  workspaceName?: string;
  planTier?: string;
  invitationToken?: string;
}): Promise<AuthTokenResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: params.email,
      password: params.password,
      full_name: params.fullName,
      workspace_name: params.workspaceName,
      plan_tier: params.planTier,
      invitation_token: params.invitationToken,
    }),
  });
  if (!res.ok) {
    throw new Error(await _parseErrorDetail(res, `Registration failed (${res.status})`));
  }
  return res.json();
}

export async function refreshAuthToken(): Promise<AuthTokenResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error('Session expired');
  }
  return res.json();
}

export async function logoutUser(): Promise<void> {
  await fetch(`${API_BASE_URL}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}

export async function fetchCurrentUser(): Promise<AuthMeResponse> {
  const res = await apiFetch(`${API_BASE_URL}/auth/me`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch user profile (${res.status})`);
  }
  return res.json();
}

export async function listWorkspaces(): Promise<WorkspaceSummary[]> {
  const res = await apiFetch(`${API_BASE_URL}/workspaces`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load workspaces (${res.status})`);
  return res.json();
}

export async function createWorkspace(name: string, planTier = 'team'): Promise<WorkspaceSummary> {
  const res = await apiFetch(`${API_BASE_URL}/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, plan_tier: planTier }),
  });
  if (!res.ok) throw new Error(await _parseErrorDetail(res, `Failed to create workspace (${res.status})`));
  return res.json();
}

export async function listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberDto[]> {
  const res = await apiFetch(`${API_BASE_URL}/workspaces/${workspaceId}/members`, { cache: 'no-store' });
  if (!res.ok) throw new Error(await _parseErrorDetail(res, `Failed to list members (${res.status})`));
  return res.json();
}

export async function updateWorkspaceMemberRole(
  workspaceId: string,
  userId: string,
  role: string,
): Promise<WorkspaceMemberDto> {
  const res = await apiFetch(`${API_BASE_URL}/workspaces/${workspaceId}/members/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error(await _parseErrorDetail(res, `Failed to update role (${res.status})`));
  return res.json();
}

export async function removeWorkspaceMember(workspaceId: string, userId: string): Promise<void> {
  const res = await apiFetch(`${API_BASE_URL}/workspaces/${workspaceId}/members/${userId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await _parseErrorDetail(res, `Failed to remove member (${res.status})`));
}

export async function createWorkspaceInvitation(
  workspaceId: string,
  email: string,
  role: string,
): Promise<InvitationDto> {
  const res = await apiFetch(`${API_BASE_URL}/workspaces/${workspaceId}/invitations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role }),
  });
  if (!res.ok) throw new Error(await _parseErrorDetail(res, `Failed to create invitation (${res.status})`));
  return res.json();
}

export async function acceptWorkspaceInvitation(token: string): Promise<WorkspaceSummary> {
  const res = await apiFetch(`${API_BASE_URL}/workspaces/invitations/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error(await _parseErrorDetail(res, `Failed to accept invitation (${res.status})`));
  return res.json();
}

export async function listWorkspaceApiKeys(workspaceId: string): Promise<ApiKeyDto[]> {
  const res = await apiFetch(`${API_BASE_URL}/workspaces/${workspaceId}/api-keys`, { cache: 'no-store' });
  if (!res.ok) throw new Error(await _parseErrorDetail(res, `Failed to list API keys (${res.status})`));
  return res.json();
}

export async function createWorkspaceApiKey(
  workspaceId: string,
  name: string,
  scopes: string[],
): Promise<ApiKeyCreatedDto> {
  const res = await apiFetch(`${API_BASE_URL}/workspaces/${workspaceId}/api-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, scopes }),
  });
  if (!res.ok) throw new Error(await _parseErrorDetail(res, `Failed to create API key (${res.status})`));
  return res.json();
}

export async function revokeWorkspaceApiKey(workspaceId: string, keyId: string): Promise<void> {
  const res = await apiFetch(`${API_BASE_URL}/workspaces/${workspaceId}/api-keys/${keyId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await _parseErrorDetail(res, `Failed to revoke API key (${res.status})`));
}

export async function listWorkspaceAuditLogs(workspaceId: string, limit = 50): Promise<AuditLogDto[]> {
  const res = await apiFetch(`${API_BASE_URL}/workspaces/${workspaceId}/audit-logs?limit=${limit}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(await _parseErrorDetail(res, `Failed to fetch audit logs (${res.status})`));
  return res.json();
}

export async function requestPasswordReset(email: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(await _parseErrorDetail(res, `Request failed (${res.status})`));
  return res.json();
}

export async function confirmPasswordReset(token: string, newPassword: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, new_password: newPassword }),
  });
  if (!res.ok) throw new Error(await _parseErrorDetail(res, `Reset failed (${res.status})`));
}

export async function discoverOidc(params: {
  email?: string;
  provider?: string;
}): Promise<{
  configured: boolean;
  provider_label: string;
  authorize_url?: string | null;
  message?: string | null;
}> {
  const res = await fetch(`${API_BASE_URL}/auth/oidc/discover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await _parseErrorDetail(res, `OIDC discovery failed (${res.status})`));
  return res.json();
}

export function getBackendOrigin(): string {
  return API_BASE_URL.replace(/\/api\/v1\/?$/, '');
}

export async function fetchSystemHealth(): Promise<{
  status: string;
  app_name: string;
  environment: string;
}> {
  const res = await fetch(`${getBackendOrigin()}/health`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Service unreachable (${res.status})`);
  return res.json();
}
