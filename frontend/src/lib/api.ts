/**
 * API client module for interacting with the backend AI platform endpoints.
 *
 * Provides methods for fetching sessions, creating new sessions, deleting sessions,
 * loading session details, and streaming chat completions via Server-Sent Events (SSE).
 */

import { Message, Session } from '@/types/chat';
import {
  Agent,
  AgentCreatePayload,
  AgentUpdatePayload,
  Assistant,
  AssistantCreatePayload,
  AssistantUpdatePayload,
} from '@/types/agent';
import { McpConfigResponseDto, McpServerDto, McpTestResponseDto } from '@/types/mcp';
import { cleanSerializedContentBlocks } from '@/lib/utils';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export async function fetchSessions(): Promise<Session[]> {
  const res = await fetch(`${API_BASE_URL}/sessions`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch sessions (${res.status})`);
  }
  return res.json();
}

export async function createSession(title?: string, agentId?: string): Promise<Session> {
  const res = await fetch(`${API_BASE_URL}/sessions`, {
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
  const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch session details (${res.status})`);
  }
  return res.json();
}

export async function deleteSession(sessionId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`Failed to delete session (${res.status})`);
  }
}

export interface ChatToolEvent {
  type: 'tool_start' | 'tool_end' | 'think' | 'think_delta';
  tool_name?: string;
  ok?: boolean;
  latency_ms?: number;
  arguments?: Record<string, unknown>;
  output?: string;
  text?: string;
  delta?: string;
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
  systemInstruction?: string;
  apiKey?: string;
  baseUrl?: string;
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
  systemInstruction,
  apiKey,
  baseUrl,
  abortSignal,
  onChunk,
  onToolEvent,
  onFinish,
  onError,
}: StreamChatParams): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/chat/stream`, {
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
        system_instruction: systemInstruction || undefined,
        api_key: apiKey || undefined,
        base_url: baseUrl || undefined,
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
  const res = await fetch(`${API_BASE_URL}/agents`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch agents (${res.status})`);
  }
  return res.json();
}

export async function fetchAgent(id: string): Promise<Agent> {
  const res = await fetch(`${API_BASE_URL}/agents/${id}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch agent ${id} (${res.status})`);
  }
  return res.json();
}

export async function createAgentApi(payload: AgentCreatePayload): Promise<Agent> {
  const res = await fetch(`${API_BASE_URL}/agents`, {
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
  const res = await fetch(`${API_BASE_URL}/agents/${id}`, {
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
  const res = await fetch(`${API_BASE_URL}/agents/${id}`, {
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
  const res = await fetch(`${API_BASE_URL}/mcp${query}`, { cache: 'no-store' });
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
  const res = await fetch(`${API_BASE_URL}/mcp${query}`, {
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
  const res = await fetch(`${API_BASE_URL}/mcp/test`, {
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
  const res = await fetch(`${API_BASE_URL}/tools/builtin`, {
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
  const res = await fetch(`${API_BASE_URL}/tools/builtin/test`, {
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
