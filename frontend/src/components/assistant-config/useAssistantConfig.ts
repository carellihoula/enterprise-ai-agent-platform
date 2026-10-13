import { useState, useEffect } from "react";
import { ModelConfigState } from "@/types/chat";
import { SUPPORTED_PROVIDERS, ProviderDefinition } from "./types";

interface UseAssistantConfigProps {
  config: ModelConfigState;
  onSaveConfig: (updatedConfig: ModelConfigState) => void;
  onNavigateToPlayground: () => void;
}

/**
 * Custom hook encapsulating local storage state, credentials, provider selection,
 * dynamic model lists, and save actions for the assistant configuration view.
 */
export function useAssistantConfig({
  config,
  onSaveConfig,
  onNavigateToPlayground,
}: UseAssistantConfigProps) {
  const [selectedProviderId, setSelectedProviderId] = useState<string>(
    config.providerId || "gemini",
  );
  const [activeModel, setActiveModel] = useState<string>(
    config.modelName || "Gemini 3.8 Flash",
  );
  const [temperature, setTemperature] = useState<number>(
    Math.min(config.temperature ?? 0.7, 1.0),
  );
  const [systemPrompt, setSystemPrompt] = useState<string>(
    config.systemPrompt || "",
  );

  const [apiKeyGemini, setApiKeyGemini] = useState<string>("");
  const [apiKeyOpenai, setApiKeyOpenai] = useState<string>("");
  const [apiKeyAnthropic, setApiKeyAnthropic] = useState<string>("");
  const [apiKeyCustom, setApiKeyCustom] = useState<string>("");
  const [baseUrlCustom, setBaseUrlCustom] = useState<string>("");

  const [providerModels, setProviderModels] = useState<Record<string, string[]>>({});
  const [newModelInput, setNewModelInput] = useState<string>("");
  const [isSavedFeedback, setIsSavedFeedback] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setApiKeyGemini(localStorage.getItem("api_key_gemini") || "");
    setApiKeyOpenai(localStorage.getItem("api_key_openai") || "");
    setApiKeyAnthropic(localStorage.getItem("api_key_anthropic") || "");
    setApiKeyCustom(localStorage.getItem("api_key_custom") || "");
    setBaseUrlCustom(
      localStorage.getItem("base_url_custom") || "http://localhost:11434/v1",
    );

    const CURRENT_MODELS_CACHE_KEY = "provider_models_cache_v4";
    const hasInitializedCurrentVersion =
      localStorage.getItem(CURRENT_MODELS_CACHE_KEY) === "true";
    if (!hasInitializedCurrentVersion) {
      SUPPORTED_PROVIDERS.forEach((prov) => {
        localStorage.removeItem(`provider_models_${prov.id}`);
      });
      localStorage.setItem(CURRENT_MODELS_CACHE_KEY, "true");
    }

    const loadedModels: Record<string, string[]> = {};
    SUPPORTED_PROVIDERS.forEach((prov) => {
      const stored = localStorage.getItem(`provider_models_${prov.id}`);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            loadedModels[prov.id] = parsed;
            return;
          }
        } catch {
          // [Fallback] Ignore malformed JSON and proceed to defaults
        }
      }
      loadedModels[prov.id] = [...prov.defaultModels];
    });

    setProviderModels(loadedModels);

    const currentList = loadedModels[selectedProviderId] || [];
    if (currentList.length === 0) {
      setActiveModel("");
      localStorage.removeItem("active_model_name");
    } else if (!currentList.includes(config.modelName)) {
      setActiveModel(currentList[0]);
    }
  }, []);

  const currentProviderDef: ProviderDefinition =
    SUPPORTED_PROVIDERS.find((p) => p.id === selectedProviderId) ||
    SUPPORTED_PROVIDERS[0];

  const currentModelList: string[] =
    providerModels[selectedProviderId] || currentProviderDef.defaultModels;

  useEffect(() => {
    const list = providerModels[selectedProviderId] || [];
    if (list.length === 0) {
      setActiveModel("");
    } else if (!list.includes(activeModel)) {
      setActiveModel(list[0]);
    }
  }, [selectedProviderId, providerModels]);

  const handleSelectProvider = (provId: string) => {
    setSelectedProviderId(provId);
    const modelsForProv = providerModels[provId] || [];
    if (modelsForProv.length > 0) {
      setActiveModel(modelsForProv[0]);
    } else {
      const defaultDef = SUPPORTED_PROVIDERS.find((p) => p.id === provId);
      if (defaultDef && defaultDef.defaultModels.length > 0) {
        setActiveModel(defaultDef.defaultModels[0]);
      } else {
        setActiveModel("");
      }
    }
  };

  const handleAddModel = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newModelInput.trim();
    if (!trimmed) return;

    if (currentModelList.includes(trimmed)) {
      setActiveModel(trimmed);
      setNewModelInput("");
      return;
    }

    const updatedList = [...currentModelList, trimmed];
    const updatedMap = { ...providerModels, [selectedProviderId]: updatedList };
    setProviderModels(updatedMap);
    setActiveModel(trimmed);
    setNewModelInput("");

    if (typeof window !== "undefined") {
      localStorage.setItem(
        `provider_models_${selectedProviderId}`,
        JSON.stringify(updatedList),
      );
    }
  };

  const handleRemoveModel = (modelToRemove: string) => {
    const updatedList = currentModelList.filter((m) => m !== modelToRemove);
    const updatedMap = { ...providerModels, [selectedProviderId]: updatedList };
    setProviderModels(updatedMap);

    if (activeModel === modelToRemove) {
      setActiveModel(updatedList.length > 0 ? updatedList[0] : "");
    }

    if (typeof window !== "undefined") {
      localStorage.setItem(
        `provider_models_${selectedProviderId}`,
        JSON.stringify(updatedList),
      );
    }
  };

  const handleResetProviderModels = () => {
    const defaults = [...currentProviderDef.defaultModels];
    const updatedMap = { ...providerModels, [selectedProviderId]: defaults };
    setProviderModels(updatedMap);
    setActiveModel(defaults[0] || "");

    if (typeof window !== "undefined") {
      localStorage.setItem(
        `provider_models_${selectedProviderId}`,
        JSON.stringify(defaults),
      );
    }
  };

  const handleSaveAll = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("api_key_gemini", apiKeyGemini.trim());
      localStorage.setItem("api_key_openai", apiKeyOpenai.trim());
      localStorage.setItem("api_key_anthropic", apiKeyAnthropic.trim());
      localStorage.setItem("api_key_custom", apiKeyCustom.trim());
      localStorage.setItem("base_url_custom", baseUrlCustom.trim());
    }

    const updatedConfig: ModelConfigState = {
      providerId: selectedProviderId,
      modelName:
        activeModel ||
        currentModelList[0] ||
        (selectedProviderId === "custom" ? "" : "Gemini 3.8 Flash"),
      temperature: Math.min(Math.max(temperature, 0), 1.0),
      systemPrompt: systemPrompt.trim(),
    };

    onSaveConfig(updatedConfig);
    setIsSavedFeedback(true);
    setTimeout(() => setIsSavedFeedback(false), 2500);
  };

  const handleSaveAndLaunch = () => {
    handleSaveAll();
    onNavigateToPlayground();
  };

  return {
    selectedProviderId,
    activeModel,
    temperature,
    systemPrompt,
    apiKeyGemini,
    apiKeyOpenai,
    apiKeyAnthropic,
    apiKeyCustom,
    baseUrlCustom,
    currentProviderDef,
    currentModelList,
    newModelInput,
    isSavedFeedback,
    setTemperature,
    setSystemPrompt,
    setApiKeyGemini,
    setApiKeyOpenai,
    setApiKeyAnthropic,
    setApiKeyCustom,
    setBaseUrlCustom,
    setNewModelInput,
    setActiveModel,
    handleSelectProvider,
    handleAddModel,
    handleRemoveModel,
    handleResetProviderModels,
    handleSaveAll,
    handleSaveAndLaunch,
  };
}
