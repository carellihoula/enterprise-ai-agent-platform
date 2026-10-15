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
    defaultModels: [],
  },
  {
    id: "openai",
    name: "OpenAI (GPT)",
    type: "builtin",
    description: "Official OpenAI API. Base URL handled natively by LangChain.",
    defaultModels: [],
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    type: "builtin",
    description:
      "Official Anthropic API. Base URL handled natively by LangChain.",
    defaultModels: [],
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
