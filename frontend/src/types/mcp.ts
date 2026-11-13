/**
 * TypeScript domain definitions for Model Context Protocol (MCP) server configuration.
 */

export type McpTransportType = "stdio" | "http" | "sse";

export type McpEditMode = "form" | "json";

export interface McpKeyValueRow {
  k: string;
  v: string;
  show: boolean;
}

export interface McpServerFormState {
  id: string;
  open: boolean;
  name: string;
  type: McpTransportType;
  command: string;
  args: string[];
  env: McpKeyValueRow[];
  url: string;
  headers: McpKeyValueRow[];
  disabled: boolean;
  extra: Record<string, unknown>;
}

export interface McpServerDto {
  id?: string;
  agent_id?: string | null;
  name: string;
  type: McpTransportType;
  command: string;
  args: string[];
  env: Record<string, string>;
  url: string;
  headers: Record<string, string>;
  disabled: boolean;
  extra: Record<string, unknown>;
  connection_status?: "idle" | "connected" | "failed";
  connection_message?: string | null;
  tools_count?: number;
  discovered_tools?: McpToolInfo[];
  latency_ms?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface McpConfigResponseDto {
  servers: McpServerDto[];
  mcpServers: Record<string, Record<string, unknown>>;
}

export interface McpValidationErrors {
  name?: string;
  command?: string;
  url?: string;
  kv?: string;
}

export interface McpJsonError {
  line: number | null;
  col: number | null;
  msg: string;
}

export type McpConnectionStatus = "idle" | "testing" | "connected" | "failed";

export interface McpToolInfo {
  name: string;
  description: string;
}

export interface McpTestResponseDto {
  ok: boolean;
  status: "connected" | "failed";
  message: string;
  tools_count: number;
  tools: string[];
  tool_details?: McpToolInfo[];
  latency_ms: number;
}

export interface McpTestState {
  status: McpConnectionStatus;
  message?: string;
  toolsCount?: number;
  tools?: McpToolInfo[];
  latencyMs?: number;
}
