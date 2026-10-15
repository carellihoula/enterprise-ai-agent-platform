/**
 * Data contracts and schemas for AI Assistants catalog.
 */

export interface Assistant {
  id: string;
  name: string;
  description?: string | null;
  avatar?: string | null;
  provider_id: string;
  model_name: string;
  temperature: number;
  max_tokens?: number | null;
  system_prompt?: string | null;
  api_key?: string | null;
  masked_api_key?: string | null;
  has_api_key?: boolean;
  base_url?: string | null;
  is_default: boolean;
  tools: Array<Record<string, any>>;
  created_at: string;
  updated_at: string;
}

export interface AssistantCreatePayload {
  name: string;
  description?: string | null;
  avatar?: string | null;
  provider_id: string;
  model_name: string;
  temperature?: number;
  max_tokens?: number | null;
  system_prompt?: string | null;
  api_key?: string | null;
  base_url?: string | null;
  is_default?: boolean;
  tools?: Array<Record<string, any>>;
}

export interface AssistantUpdatePayload {
  name?: string;
  description?: string | null;
  avatar?: string | null;
  provider_id?: string;
  model_name?: string;
  temperature?: number;
  max_tokens?: number | null;
  system_prompt?: string | null;
  api_key?: string | null;
  base_url?: string | null;
  is_default?: boolean;
  tools?: Array<Record<string, any>>;
}
