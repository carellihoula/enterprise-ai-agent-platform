/**
 * Domain types for chat conversations and dynamic model provider configuration.
 */

export interface Message {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at?: string;
}

export interface Session {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages?: Message[];
}

export interface ModelConfigState {
  providerId: string;
  modelName: string;
  temperature: number;
  maxTokens?: number;
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
