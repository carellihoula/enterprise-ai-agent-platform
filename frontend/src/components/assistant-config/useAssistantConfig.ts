import { useState, useEffect } from "react";
import { ModelConfigState } from "@/types/chat";
import { SUPPORTED_PROVIDERS, ProviderDefinition } from "./types";
import { fetchProviderConfigs, saveProviderConfigApi } from "@/lib/api";

interface UseAssistantConfigProps {
  config: ModelConfigState;
  onSaveConfig: (updatedConfig: ModelConfigState) => void;
  onNavigateToPlayground: () => void;
}

/**
 * Custom hook encapsulating database persistence, encrypted credentials,
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
  const [activeModel, setActiveModel] = useState<string>(config.modelName || "");
  const [temperature, setTemperature] = useState<number>(
    Math.min(config.temperature ?? 0.7, 1.0),
  );
  const [systemPrompt, setSystemPrompt] = useState<string>(
    config.systemPrompt || "",
  );

  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [baseUrls, setBaseUrls] = useState<Record<string, string>>({
    custom: "http://localhost:11434/v1",
    openrouter: "https://openrouter.ai/api/v1",
  });

  const [maskedKeys, setMaskedKeys] = useState<Record<string, string>>({});
  const [hasApiKeys, setHasApiKeys] = useState<Record<string, boolean>>({});

  const [providerModels, setProviderModels] = useState<Record<string, string[]>>({});
  const [newModelInput, setNewModelInput] = useState<string>("");
  const [isSavedFeedback, setIsSavedFeedback] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // [Database Fetch] Load persisted model lists and encrypted credentials on component mount
  useEffect(() => {
    async function loadConfigsFromDb() {
      try {
        setIsLoading(true);
        const configs = await fetchProviderConfigs();
        const loadedModels: Record<string, string[]> = {};
        const loadedMasked: Record<string, string> = {};
        const loadedHasKey: Record<string, boolean> = {};
        const loadedUrls: Record<string, string> = {
          custom: "http://localhost:11434/v1",
          openrouter: "https://openrouter.ai/api/v1",
        };

        // [Defaults] Initialize all supported providers as empty model lists
        SUPPORTED_PROVIDERS.forEach((prov) => {
          loadedModels[prov.id] = [];
        });

        // [State Population] Overlay stored database settings
        configs.forEach((cfg) => {
          loadedModels[cfg.provider_id] = cfg.models || [];
          if (cfg.masked_api_key) {
            loadedMasked[cfg.provider_id] = cfg.masked_api_key;
          }
          loadedHasKey[cfg.provider_id] = cfg.has_api_key;
          if (cfg.base_url) {
            loadedUrls[cfg.provider_id] = cfg.base_url;
          }

          if (cfg.provider_id === selectedProviderId) {
            if (cfg.active_model) setActiveModel(cfg.active_model);
            if (cfg.temperature !== undefined) setTemperature(cfg.temperature);
            if (cfg.system_prompt !== undefined) setSystemPrompt(cfg.system_prompt || "");
          }
        });

        setProviderModels(loadedModels);
        setMaskedKeys(loadedMasked);
        setHasApiKeys(loadedHasKey);
        setBaseUrls(loadedUrls);

        const currentList = loadedModels[selectedProviderId] || [];
        if (currentList.length > 0 && !currentList.includes(config.modelName)) {
          setActiveModel(currentList[0]);
        }
      } catch (err) {
        console.error("Failed to load provider configurations from backend DB", err);
      } finally {
        setIsLoading(false);
      }
    }

    loadConfigsFromDb();
  }, []);

  const currentProviderDef: ProviderDefinition =
    SUPPORTED_PROVIDERS.find((p) => p.id === selectedProviderId) ||
    SUPPORTED_PROVIDERS[0];

  const currentModelList: string[] = providerModels[selectedProviderId] || [];

  const handleSelectProvider = (provId: string) => {
    setSelectedProviderId(provId);
    const modelsForProv = providerModels[provId] || [];
    setActiveModel(modelsForProv.length > 0 ? modelsForProv[0] : "");
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
  };

  const handleRemoveModel = (modelToRemove: string) => {
    const updatedList = currentModelList.filter((m) => m !== modelToRemove);
    const updatedMap = { ...providerModels, [selectedProviderId]: updatedList };
    setProviderModels(updatedMap);

    const nextActive = activeModel === modelToRemove ? (updatedList[0] || "") : activeModel;
    setActiveModel(nextActive);
  };

  const handleResetProviderModels = () => {
    // [Reset] Clear the working list to empty (persisted only upon clicking Save)
    const updatedMap = { ...providerModels, [selectedProviderId]: [] };
    setProviderModels(updatedMap);
    setActiveModel("");
  };

  const currentApiKey = apiKeys[selectedProviderId] || "";
  const setCurrentApiKey = (val: string) =>
    setApiKeys((prev) => ({ ...prev, [selectedProviderId]: val }));

  const currentBaseUrl =
    baseUrls[selectedProviderId] ||
    (selectedProviderId === "openrouter"
      ? "https://openrouter.ai/api/v1"
      : "http://localhost:11434/v1");
  const setCurrentBaseUrl = (val: string) =>
    setBaseUrls((prev) => ({ ...prev, [selectedProviderId]: val }));

  const handleSaveAll = async () => {
    // [Credentials Mapping] Determine if user input a fresh API key to encrypt
    const rawKey = apiKeys[selectedProviderId];
    const keyInput = rawKey && rawKey.trim().length > 0 ? rawKey.trim() : undefined;
    const isCustomUrlProvider =
      selectedProviderId === "custom" || selectedProviderId === "openrouter";
    const baseUrlInput = isCustomUrlProvider
      ? baseUrls[selectedProviderId]?.trim()
      : undefined;

    try {
      const saved = await saveProviderConfigApi(selectedProviderId, {
        models: currentModelList,
        active_model: activeModel || currentModelList[0] || null,
        temperature: Math.min(Math.max(temperature, 0), 1.0),
        system_prompt: systemPrompt.trim(),
        api_key: keyInput,
        base_url: baseUrlInput,
      });

      if (saved.masked_api_key) {
        setMaskedKeys((prev) => ({ ...prev, [selectedProviderId]: saved.masked_api_key! }));
        setHasApiKeys((prev) => ({ ...prev, [selectedProviderId]: true }));
      }
    } catch (err) {
      console.error("Failed to persist provider configuration to database", err);
    }

    const updatedConfig: ModelConfigState = {
      providerId: selectedProviderId,
      modelName: activeModel || currentModelList[0] || "",
      temperature: Math.min(Math.max(temperature, 0), 1.0),
      systemPrompt: systemPrompt.trim(),
      baseUrl: baseUrlInput,
      availableModels: currentModelList,
    };

    onSaveConfig(updatedConfig);
    setIsSavedFeedback(true);
    setTimeout(() => setIsSavedFeedback(false), 2500);
  };

  const handleSaveAndLaunch = async () => {
    await handleSaveAll();
    onNavigateToPlayground();
  };

  return {
    selectedProviderId,
    activeModel,
    temperature,
    systemPrompt,
    currentApiKey,
    setCurrentApiKey,
    currentBaseUrl,
    setCurrentBaseUrl,
    maskedKeys,
    hasApiKeys,
    currentProviderDef,
    currentModelList,
    newModelInput,
    isSavedFeedback,
    isLoading,
    setTemperature,
    setSystemPrompt,
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
