/**
 * Domain types for chat conversations and dynamic model provider configuration.
 */

export interface Message {
  id?: string;
  role: 'user' | 'assistant' | 'system';
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
}

export interface ProviderPreset {
  id: string;
  name: string;
  defaultModel: string;
  suggestedModels: string[];
}

export const PRESET_PROVIDERS: ProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    defaultModel: 'gpt-4o',
    suggestedModels: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    defaultModel: 'claude-3-5-sonnet-20240620',
    suggestedModels: ['claude-3-5-sonnet-20240620', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    defaultModel: 'gemini-1.5-flash',
    suggestedModels: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp'],
  },
  {
    id: 'custom',
    name: 'Custom / Local (Ollama, vLLM)',
    defaultModel: 'llama3',
    suggestedModels: ['llama3', 'mistral', 'deepseek-r1'],
  },
];
