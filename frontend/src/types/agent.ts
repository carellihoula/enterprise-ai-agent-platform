/**
 * Data contracts and schemas for Enterprise AI Agents catalog.
 */

export interface ModelSpec {
  provider_id: string;
  model_name: string;
  temperature: number;
  max_tokens?: number | null;
  base_url?: string | null;
  api_key?: string | null;
}

export interface KnowledgeSource {
  id?: string;
  name: string;
  type: "documents" | "database" | "external_rag" | "custom";
  rag_agent_id?: string | null;
  config?: Record<string, unknown>;
}

export interface ToolSpec {
  name: string;
  description?: string | null;
  type?: "builtin" | "mcp" | "api" | "custom";
  config?: Record<string, unknown>;
}

export interface Agent {
  id: string;
  name: string;
  description?: string | null;
  avatar?: string | null;
  instructions: string;
  model: ModelSpec;
  // Optional convenience aliases for UI components
  provider_id?: string;
  model_name?: string;
  temperature?: number;
  system_prompt?: string | null;
  masked_api_key?: string | null;
  base_url?: string | null;
  tools: Array<Record<string, unknown>>;
  knowledge: Array<KnowledgeSource>;
  policies: Record<string, unknown> | Array<Record<string, unknown>>;
  is_default: boolean;
  has_api_key?: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentCreatePayload {
  name: string;
  description?: string | null;
  avatar?: string | null;
  instructions: string;
  model: ModelSpec;
  tools?: Array<Record<string, unknown>>;
  knowledge?: Array<KnowledgeSource>;
  policies?: Record<string, unknown> | Array<Record<string, unknown>>;
  is_default?: boolean;
}

export interface AgentUpdatePayload {
  name?: string;
  description?: string | null;
  avatar?: string | null;
  instructions?: string;
  model?: Partial<ModelSpec>;
  tools?: Array<Record<string, unknown>>;
  knowledge?: Array<KnowledgeSource>;
  policies?: Record<string, unknown> | Array<Record<string, unknown>>;
  is_default?: boolean;
}

// [Compatibility Aliases]
export type Assistant = Agent;
export type AssistantCreatePayload = AgentCreatePayload;
export type AssistantUpdatePayload = AgentUpdatePayload;
