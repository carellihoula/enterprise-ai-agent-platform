import { ModelConfigState } from "@/types/chat";

/**
 * Interface defining a supported LLM provider specification.
 */
export interface ProviderDefinition {
  id: string;
  name: string;
  type: "builtin" | "custom";
  description: string;
  defaultModels: string[];
}

/**
 * Canonical catalog of supported LLM providers and their default frontier models.
 */
export const SUPPORTED_PROVIDERS: ProviderDefinition[] = [
  {
    id: "gemini",
    name: "Google Gemini",
    type: "builtin",
    description:
      "Direct Google AI Studio integration. Base URL handled natively by LangChain.",
    defaultModels: [
      "Gemini 3.8 Flash",
      "Gemini 3.6 Flash",
      "Gemini 3.5 Flash",
      "Gemini 3.5 Flash Lite",
      "Gemini 3.1 Pro",
    ],
  },
  {
    id: "openai",
    name: "OpenAI (GPT)",
    type: "builtin",
    description: "Official OpenAI API. Base URL handled natively by LangChain.",
    defaultModels: [
      "GPT-6 Astra",
      "GPT-6.1 Sol",
      "GPT-6 Luna",
      "GPT-5.6 Sol",
      "GPT-5.6 Luna",
      "GPT-4o",
      "GPT-4o mini",
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    type: "builtin",
    description:
      "Official Anthropic API. Base URL handled natively by LangChain.",
    defaultModels: [
      "Claude Fable 5.1",
      "Claude Opus 5.5",
      "Claude Sonnet 5.5",
      "Claude Haiku 5.5",
    ],
  },
  {
    id: "custom",
    name: "Custom / Gateway (Ollama, vLLM, Groq, OpenRouter)",
    type: "custom",
    description:
      "Any OpenAI-compatible gateway via custom Base URL and optional API key.",
    defaultModels: [],
  },
];

/**
 * Props for the AssistantConfigView container component.
 */
export interface AssistantConfigViewProps {
  config: ModelConfigState;
  onSaveConfig: (updatedConfig: ModelConfigState) => void;
  onNavigateToPlayground: () => void;
}
