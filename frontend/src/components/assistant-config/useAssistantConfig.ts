import { useState, useEffect } from "react";
import { ModelConfigState } from "@/types/chat";
import { Agent, AgentCreatePayload, AgentUpdatePayload, KnowledgeSource, ReasoningEffort } from "@/types/agent";
import { SUPPORTED_PROVIDERS, ProviderDefinition } from "./types";

interface UseAssistantConfigProps {
  config: ModelConfigState;
  assistantToEdit?: Agent | null;
  onSaveConfig: (updatedConfig: ModelConfigState) => void;
  onNavigateToPlayground: () => void;
  onCreateAssistant?: (payload: any) => Promise<void>;
  onUpdateAssistant?: (id: string, payload: any) => Promise<void>;
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

  const initProvId = assistantToEdit?.model?.provider_id || assistantToEdit?.provider_id || config.providerId || "groq";
  const initModelName = assistantToEdit?.model?.model_name || assistantToEdit?.model_name || config.modelName || "";
  const initApiKey = assistantToEdit?.model?.api_key || assistantToEdit?.masked_api_key;

  const [selectedProviderId, setSelectedProviderId] = useState<string>(initProvId);
  const [activeModel, setActiveModel] = useState<string>(initModelName);
  const [temperature, setTemperature] = useState<number>(
    Math.min(assistantToEdit?.model?.temperature ?? assistantToEdit?.temperature ?? config.temperature ?? 0.7, 1.0),
  );
  const [enableReasoning, setEnableReasoning] = useState<boolean>(
    assistantToEdit?.model?.enable_reasoning ?? assistantToEdit?.enable_reasoning ?? config.enableReasoning ?? false,
  );
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(
    assistantToEdit?.model?.reasoning_effort ?? assistantToEdit?.reasoning_effort ?? config.reasoningEffort ?? "medium",
  );
  const [systemPrompt, setSystemPrompt] = useState<string>(
    assistantToEdit?.instructions || (assistantToEdit as any)?.system_prompt || config.systemPrompt || "",
  );
  const [knowledge, setKnowledge] = useState<KnowledgeSource[]>(
    assistantToEdit?.knowledge || []
  );
  const [tools, setTools] = useState<Array<Record<string, unknown>>>(
    assistantToEdit?.tools || []
  );
  const [policies, setPolicies] = useState<Record<string, unknown>>(
    (assistantToEdit?.policies as Record<string, unknown>) || {}
  );

  const [apiKeys, setApiKeys] = useState<Record<string, string>>(() => {
    if (initProvId && initApiKey) {
      return { [initProvId]: initApiKey };
    }
    return {};
  });
  const [baseUrls, setBaseUrls] = useState<Record<string, string>>({
    custom: "http://localhost:11434/v1",
    openrouter: "https://openrouter.ai/api/v1",
  });
  const [maskedKeys, setMaskedKeys] = useState<Record<string, string>>(() => {
    if (initProvId && initApiKey) {
      return { [initProvId]: initApiKey };
    }
    return {};
  });
  const [hasApiKeys, setHasApiKeys] = useState<Record<string, boolean>>(() => {
    if (initProvId && (initApiKey || assistantToEdit?.has_api_key)) {
      return { [initProvId]: true };
    }
    return {};
  });
  const [providerModels, setProviderModels] = useState<Record<string, string[]>>(() => {
    const initialModels: Record<string, string[]> = {};
    SUPPORTED_PROVIDERS.forEach((prov) => {
      initialModels[prov.id] = [];
    });
    if (initProvId && initModelName) {
      initialModels[initProvId] = [initModelName];
    }
    return initialModels;
  });
  const [newModelInput, setNewModelInput] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // [Sync] Update state when assistantToEdit changes
  useEffect(() => {
    if (assistantToEdit) {
      const provId = assistantToEdit.model?.provider_id || assistantToEdit.provider_id || "groq";
      const modelName = assistantToEdit.model?.model_name || assistantToEdit.model_name || "";
      const temp = assistantToEdit.model?.temperature ?? assistantToEdit.temperature ?? 0.7;
      const maskedKey = assistantToEdit.model?.api_key || assistantToEdit.masked_api_key;
      const baseUrl = assistantToEdit.model?.base_url || assistantToEdit.base_url;

      setName(assistantToEdit.name);
      setDescription(assistantToEdit.description || "");
      setAvatar(assistantToEdit.avatar || "bot");
      setSelectedProviderId(provId);
      setActiveModel(modelName);
      setTemperature(temp);
      setEnableReasoning(
        assistantToEdit.model?.enable_reasoning ?? assistantToEdit.enable_reasoning ?? false,
      );
      setReasoningEffort(
        assistantToEdit.model?.reasoning_effort ?? assistantToEdit.reasoning_effort ?? "medium",
      );
      setSystemPrompt(assistantToEdit.instructions || (assistantToEdit as any).system_prompt || "");
      setIsDefault(assistantToEdit.is_default || false);
      setKnowledge(assistantToEdit.knowledge || []);
      setTools(assistantToEdit.tools || []);
      setPolicies((assistantToEdit.policies as Record<string, unknown>) || {});
      if (modelName) {
        setProviderModels((prev) => {
          const list = prev[provId] || [];
          if (!list.includes(modelName)) {
            return {
              ...prev,
              [provId]: [modelName, ...list],
            };
          }
          return prev;
        });
      }
      if (maskedKey) {
        setMaskedKeys((prev) => ({
          ...prev,
          [provId]: maskedKey,
        }));
        setHasApiKeys((prev) => ({
          ...prev,
          [provId]: true,
        }));
        setApiKeys((prev) => ({
          ...prev,
          [provId]: maskedKey,
        }));
      } else {
        setHasApiKeys((prev) => ({
          ...prev,
          [provId]: false,
        }));
        setApiKeys((prev) => ({
          ...prev,
          [provId]: "",
        }));
      }
      if (baseUrl) {
        setBaseUrls((prev) => ({
          ...prev,
          [provId]: baseUrl,
        }));
      }
    } else {
      setName("");
      setDescription("");
      setAvatar("bot");
      setIsDefault(false);
      setActiveModel("");
      setApiKeys({});
      setEnableReasoning(false);
      setReasoningEffort("medium");
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

  // [Submit Action] Handle Create vs Modify Agent
  const handleSubmitAssistant = async () => {
    const finalModelName = activeModel || currentModelList[0] || "";
    if (!name.trim()) {
      setValidationError("Please specify an Agent Name");
      return;
    }
    if (!finalModelName) {
      setValidationError("Please add and select at least one Model ID for this provider");
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

      const modelPayload = {
        provider_id: selectedProviderId,
        model_name: finalModelName,
        temperature,
        enable_reasoning: enableReasoning,
        reasoning_effort: reasoningEffort,
        base_url: baseUrlInput,
        api_key: apiKeyToSubmit || undefined,
      };

      if (assistantToEdit && onUpdateAssistant) {
        await onUpdateAssistant(assistantToEdit.id, {
          name: name.trim(),
          description: description.trim(),
          avatar,
          instructions: systemPrompt.trim(),
          model: modelPayload,
          knowledge,
          tools,
          policies,
          is_default: isDefault,
        });
      } else if (onCreateAssistant) {
        await onCreateAssistant({
          name: name.trim(),
          description: description.trim(),
          avatar,
          instructions: systemPrompt.trim(),
          model: modelPayload,
          knowledge,
          tools,
          policies,
          is_default: isDefault,
        });
      }

      onSaveConfig({
        providerId: selectedProviderId,
        modelName: finalModelName,
        temperature,
        enableReasoning,
        reasoningEffort,
        systemPrompt: systemPrompt.trim(),
        baseUrl: baseUrlInput,
        availableModels: currentModelList,
      });

      onNavigateToPlayground();
    } catch (err: any) {
      setValidationError(err.message || "Failed to save agent");
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
    enableReasoning,
    reasoningEffort,
    systemPrompt,
    knowledge,
    setKnowledge,
    tools,
    setTools,
    policies,
    setPolicies,
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
    setEnableReasoning,
    setReasoningEffort,
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
