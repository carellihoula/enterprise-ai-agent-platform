import { useState, useEffect } from "react";
import { ModelConfigState } from "@/types/chat";
import { Assistant, AssistantCreatePayload, AssistantUpdatePayload } from "@/types/assistant";
import { SUPPORTED_PROVIDERS, ProviderDefinition } from "./types";

interface UseAssistantConfigProps {
  config: ModelConfigState;
  assistantToEdit?: Assistant | null;
  onSaveConfig: (updatedConfig: ModelConfigState) => void;
  onNavigateToPlayground: () => void;
  onCreateAssistant?: (payload: AssistantCreatePayload) => Promise<void>;
  onUpdateAssistant?: (id: string, payload: AssistantUpdatePayload) => Promise<void>;
}

/**
 * Custom hook managing assistant creation/editing, provider credentials, and hyperparameters
 * stored directly within the Assistant model.
 */
export function useAssistantConfig({
  config,
  assistantToEdit,
  onSaveConfig,
  onNavigateToPlayground,
  onCreateAssistant,
  onUpdateAssistant,
}: UseAssistantConfigProps) {
  const [name, setName] = useState<string>(assistantToEdit?.name || "");
  const [description, setDescription] = useState<string>(assistantToEdit?.description || "");
  const [avatar, setAvatar] = useState<string>(assistantToEdit?.avatar || "bot");
  const [isDefault, setIsDefault] = useState<boolean>(assistantToEdit?.is_default || false);

  const [selectedProviderId, setSelectedProviderId] = useState<string>(
    assistantToEdit?.provider_id || config.providerId || "groq",
  );
  const [activeModel, setActiveModel] = useState<string>(
    assistantToEdit?.model_name || config.modelName || "",
  );
  const [temperature, setTemperature] = useState<number>(
    Math.min(assistantToEdit?.temperature ?? config.temperature ?? 0.7, 1.0),
  );
  const [systemPrompt, setSystemPrompt] = useState<string>(
    assistantToEdit?.system_prompt ?? config.systemPrompt ?? "",
  );

  const [apiKeys, setApiKeys] = useState<Record<string, string>>(() => {
    if (assistantToEdit?.provider_id && assistantToEdit.masked_api_key) {
      return { [assistantToEdit.provider_id]: assistantToEdit.masked_api_key };
    }
    return {};
  });
  const [baseUrls, setBaseUrls] = useState<Record<string, string>>({
    custom: "http://localhost:11434/v1",
    openrouter: "https://openrouter.ai/api/v1",
  });
  const [maskedKeys, setMaskedKeys] = useState<Record<string, string>>(() => {
    if (assistantToEdit?.provider_id && assistantToEdit.masked_api_key) {
      return { [assistantToEdit.provider_id]: assistantToEdit.masked_api_key };
    }
    return {};
  });
  const [hasApiKeys, setHasApiKeys] = useState<Record<string, boolean>>(() => {
    if (assistantToEdit?.provider_id && assistantToEdit.has_api_key) {
      return { [assistantToEdit.provider_id]: true };
    }
    return {};
  });
  const [providerModels, setProviderModels] = useState<Record<string, string[]>>(() => {
    const initialModels: Record<string, string[]> = {};
    SUPPORTED_PROVIDERS.forEach((prov) => {
      initialModels[prov.id] = [];
    });
    if (assistantToEdit?.model_name) {
      initialModels[assistantToEdit.provider_id] = [assistantToEdit.model_name];
    }
    return initialModels;
  });
  const [newModelInput, setNewModelInput] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // [Sync] Update state when assistantToEdit changes
  useEffect(() => {
    if (assistantToEdit) {
      setName(assistantToEdit.name);
      setDescription(assistantToEdit.description || "");
      setAvatar(assistantToEdit.avatar || "bot");
      setSelectedProviderId(assistantToEdit.provider_id);
      setActiveModel(assistantToEdit.model_name || "");
      setTemperature(assistantToEdit.temperature ?? 0.7);
      setSystemPrompt(assistantToEdit.system_prompt || "");
      setIsDefault(assistantToEdit.is_default || false);
      if (assistantToEdit.model_name) {
        setProviderModels((prev) => {
          const list = prev[assistantToEdit.provider_id] || [];
          if (!list.includes(assistantToEdit.model_name)) {
            return {
              ...prev,
              [assistantToEdit.provider_id]: [assistantToEdit.model_name, ...list],
            };
          }
          return prev;
        });
      }
      if (assistantToEdit.masked_api_key) {
        setMaskedKeys((prev) => ({
          ...prev,
          [assistantToEdit.provider_id]: assistantToEdit.masked_api_key!,
        }));
        setHasApiKeys((prev) => ({
          ...prev,
          [assistantToEdit.provider_id]: true,
        }));
        setApiKeys((prev) => ({
          ...prev,
          [assistantToEdit.provider_id]: assistantToEdit.masked_api_key!,
        }));
      } else {
        setHasApiKeys((prev) => ({
          ...prev,
          [assistantToEdit.provider_id]: false,
        }));
        setApiKeys((prev) => ({
          ...prev,
          [assistantToEdit.provider_id]: "",
        }));
      }
      if (assistantToEdit.base_url) {
        setBaseUrls((prev) => ({
          ...prev,
          [assistantToEdit.provider_id]: assistantToEdit.base_url!,
        }));
      }
    } else {
      setName("");
      setDescription("");
      setAvatar("bot");
      setIsDefault(false);
      setActiveModel("");
      setApiKeys({});
    }
  }, [assistantToEdit]);

  const currentProviderDef: ProviderDefinition =
    SUPPORTED_PROVIDERS.find((p) => p.id === selectedProviderId) || SUPPORTED_PROVIDERS[0];
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
    const currentList = providerModels[selectedProviderId] || [];
    if (currentList.includes(trimmed)) {
      setActiveModel(trimmed);
      setNewModelInput("");
      return;
    }
    const updatedList = [...currentList, trimmed];
    setProviderModels((prev) => ({ ...prev, [selectedProviderId]: updatedList }));
    setActiveModel(trimmed);
    setNewModelInput("");
  };

  const handleRemoveModel = (modelToRemove: string) => {
    const currentList = providerModels[selectedProviderId] || [];
    const updatedList = currentList.filter((m) => m !== modelToRemove);
    setProviderModels((prev) => ({ ...prev, [selectedProviderId]: updatedList }));
    if (activeModel === modelToRemove) {
      setActiveModel(updatedList[0] || "");
    }
  };

  const handleResetProviderModels = () => {
    setProviderModels((prev) => ({ ...prev, [selectedProviderId]: [] }));
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

  // [Submit Action] Handle Create vs Modify Assistant
  const handleSubmitAssistant = async () => {
    if (!name.trim()) {
      setValidationError("Please specify an Assistant Name");
      return;
    }
    setValidationError(null);
    setIsSubmitting(true);

    try {
      const rawKey = apiKeys[selectedProviderId]?.trim();
      const maskedKey = maskedKeys[selectedProviderId];
      const isCustomUrl = selectedProviderId === "custom" || selectedProviderId === "openrouter";
      const baseUrlInput = isCustomUrl ? baseUrls[selectedProviderId]?.trim() : undefined;

      // [Credential Guard] Distinguish between unchanged masked key, newly typed key, and cleared key
      let apiKeyToSubmit: string | undefined = undefined;
      if (rawKey !== undefined) {
        if (rawKey === maskedKey || (maskedKey && rawKey.includes("•"))) {
          // Key unchanged from masked representation: omit to preserve DB ciphertext
          apiKeyToSubmit = undefined;
        } else if (rawKey === "") {
          // Explicitly cleared by the user
          apiKeyToSubmit = "";
        } else {
          // New plaintext key entered
          apiKeyToSubmit = rawKey;
        }
      }

      const finalModelName = activeModel || currentModelList[0] || "";

      if (assistantToEdit && onUpdateAssistant) {
        await onUpdateAssistant(assistantToEdit.id, {
          name: name.trim(),
          description: description.trim(),
          avatar,
          provider_id: selectedProviderId,
          model_name: finalModelName,
          temperature,
          system_prompt: systemPrompt.trim(),
          is_default: isDefault,
          api_key: apiKeyToSubmit,
          base_url: baseUrlInput,
        });
      } else if (onCreateAssistant) {
        await onCreateAssistant({
          name: name.trim(),
          description: description.trim(),
          avatar,
          provider_id: selectedProviderId,
          model_name: finalModelName,
          temperature,
          system_prompt: systemPrompt.trim(),
          is_default: isDefault,
          api_key: apiKeyToSubmit || undefined,
          base_url: baseUrlInput,
        });
      }

      onSaveConfig({
        providerId: selectedProviderId,
        modelName: finalModelName,
        temperature,
        systemPrompt: systemPrompt.trim(),
        baseUrl: baseUrlInput,
        availableModels: currentModelList,
      });

      onNavigateToPlayground();
    } catch (err: any) {
      setValidationError(err.message || "Failed to save assistant");
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    name,
    setName,
    description,
    setDescription,
    avatar,
    setAvatar,
    isDefault,
    setIsDefault,
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
    isSubmitting,
    validationError,
    setTemperature,
    setSystemPrompt,
    setNewModelInput,
    setActiveModel,
    handleSelectProvider,
    handleAddModel,
    handleRemoveModel,
    handleResetProviderModels,
    handleSubmitAssistant,
  };
}
