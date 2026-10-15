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
    id: "mistral",
    name: "Mistral AI",
    type: "builtin",
    description:
      "Official Mistral AI API via langchain-mistralai. Frontier European models.",
    defaultModels: [],
  },
  {
    id: "groq",
    name: "Groq (LPU)",
    type: "builtin",
    description:
      "Ultra-low latency inference engine powered by LPUs via langchain-groq.",
    defaultModels: [],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    type: "custom",
    description:
      "Unified interface to 100+ models via OpenRouter gateway.",
    defaultModels: [],
  },
  {
    id: "custom",
    name: "Custom / Local LLM",
    type: "custom",
    description:
      "Any OpenAI-compatible gateway (Ollama, vLLM) via custom Base URL.",
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
