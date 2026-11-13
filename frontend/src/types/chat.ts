/**
 * Domain types for chat conversations and dynamic model provider configuration.
 */

export interface ToolExecutionBadge {
  id?: string;
  type?: "think" | "tool";
  name: string;
  status: "running" | "done" | "error";
  latencyMs?: number;
  arguments?: Record<string, unknown>;
  output?: string;
  text?: string;
}

export interface Message {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at?: string;
  toolCalls?: ToolExecutionBadge[];
  trace_steps?: ToolExecutionBadge[];
}

export interface Session {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  assistant_id?: string | null;
  messages?: Message[];
}

export interface ModelConfigState {
  providerId: string;
  modelName: string;
  temperature: number;
  maxTokens?: number;
  enableReasoning?: boolean;
  reasoningEffort?: "low" | "medium" | "high";
  systemPrompt?: string;
  baseUrl?: string;
  apiKey?: string;
  availableModels?: string[];
}

export interface ProviderPreset {
  id: string;
  name: string;
  defaultModel: string;
  suggestedModels: string[];
}

export const PRESET_PROVIDERS: ProviderPreset[] = [
  {
    id: "gemini",
    name: "Google Gemini",
    defaultModel: "",
    suggestedModels: [],
  },
  {
    id: "openai",
    name: "OpenAI (GPT)",
    defaultModel: "",
    suggestedModels: [],
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    defaultModel: "",
    suggestedModels: [],
  },
  {
    id: "mistral",
    name: "Mistral AI",
    defaultModel: "",
    suggestedModels: [],
  },
  {
    id: "groq",
    name: "Groq",
    defaultModel: "",
    suggestedModels: [],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    defaultModel: "",
    suggestedModels: [],
  },
  {
    id: "custom",
    name: "Custom / Local LLM",
    defaultModel: "",
    suggestedModels: [],
  },
];
