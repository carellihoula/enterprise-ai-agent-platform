/**
 * API client module for interacting with the backend AI platform endpoints.
 *
 * Provides methods for fetching sessions, creating new sessions, deleting sessions,
 * loading session details, and streaming chat completions via Server-Sent Events (SSE).
 */

import { Message, Session } from '@/types/chat';
import { Assistant, AssistantCreatePayload, AssistantUpdatePayload } from '@/types/assistant';
import { cleanSerializedContentBlocks } from '@/lib/utils';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export async function fetchSessions(): Promise<Session[]> {
  const res = await fetch(`${API_BASE_URL}/sessions`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch sessions (${res.status})`);
  }
  return res.json();
}

export async function createSession(title?: string, assistantId?: string): Promise<Session> {
  const res = await fetch(`${API_BASE_URL}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, assistant_id: assistantId }),
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

export interface StreamChatParams {
  sessionId?: string;
  assistantId?: string;
  messages: Message[];
  providerName: string;
  modelName: string;
  temperature?: number;
  maxTokens?: number;
  systemInstruction?: string;
  apiKey?: string;
  baseUrl?: string;
  abortSignal?: AbortSignal;
  onChunk: (delta: string) => void;
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
  systemInstruction,
  apiKey,
  baseUrl,
  abortSignal,
  onChunk,
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

export async function fetchAssistants(): Promise<Assistant[]> {
  const res = await fetch(`${API_BASE_URL}/assistants`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch assistants (${res.status})`);
  }
  return res.json();
}

export async function fetchAssistant(id: string): Promise<Assistant> {
  const res = await fetch(`${API_BASE_URL}/assistants/${id}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch assistant ${id} (${res.status})`);
  }
  return res.json();
}

export async function createAssistantApi(payload: AssistantCreatePayload): Promise<Assistant> {
  const res = await fetch(`${API_BASE_URL}/assistants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Failed to create assistant (${res.status})`);
  }
  return res.json();
}

export async function updateAssistantApi(
  id: string,
  payload: AssistantUpdatePayload
): Promise<Assistant> {
  const res = await fetch(`${API_BASE_URL}/assistants/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Failed to update assistant ${id} (${res.status})`);
  }
  return res.json();
}

export async function deleteAssistantApi(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/assistants/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`Failed to delete assistant ${id} (${res.status})`);
  }
}
