import { useState, useEffect, useCallback, useRef } from "react";
import {
  Assistant,
  AssistantCreatePayload,
  AssistantUpdatePayload,
} from "@/types/assistant";
import {
  fetchAssistants,
  createAssistantApi,
  updateAssistantApi,
  deleteAssistantApi,
} from "@/lib/api";
import { ModelConfigState } from "@/types/chat";
import { SUPPORTED_PROVIDERS } from "@/components/assistant-config/types";
import { toast } from "@/components/ui/toast";

interface UseAssistantsProps {
  onSyncModelConfig?: (config: Partial<ModelConfigState>) => void;
}

/**
 * Custom hook managing the multi-assistant catalog, active assistant selection,
 * and database synchronization with stable callback references.
 */
export function useAssistants({ onSyncModelConfig }: UseAssistantsProps = {}) {
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [activeAssistant, setActiveAssistant] = useState<Assistant | null>(null);
  const [assistantToEdit, setAssistantToEdit] = useState<Assistant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [availableProviderModels, setAvailableProviderModels] = useState<
    Record<string, string[]>
  >({});

  // [Stability] Keep stable ref to onSyncModelConfig to prevent infinite render loops
  const onSyncModelConfigRef = useRef(onSyncModelConfig);
  onSyncModelConfigRef.current = onSyncModelConfig;

  // [Data] Load available models per provider from SUPPORTED_PROVIDERS
  useEffect(() => {
    const mapping: Record<string, string[]> = {};
    for (const prov of SUPPORTED_PROVIDERS) {
      mapping[prov.id.toLowerCase()] = [...prov.defaultModels];
    }
    setAvailableProviderModels(mapping);
  }, []);

  // [Sync] Propagate assistant properties to the playground model config
  const syncAssistantToModelConfig = useCallback((assistant: Assistant) => {
    onSyncModelConfigRef.current?.({
      providerId: assistant.provider_id,
      modelName: assistant.model_name,
      temperature: assistant.temperature,
      systemPrompt: assistant.system_prompt || undefined,
      baseUrl: assistant.base_url || undefined,
      apiKey: assistant.masked_api_key || undefined,
    });
  }, []);

  const selectAssistant = useCallback(
    (assistant: Assistant) => {
      setActiveAssistant(assistant);
      if (typeof window !== "undefined") {
        localStorage.setItem("active_assistant_id", assistant.id);
      }
      syncAssistantToModelConfig(assistant);
    },
    [syncAssistantToModelConfig],
  );

  const selectAssistantById = useCallback(
    (assistantId: string) => {
      const match = assistants.find((a) => a.id === assistantId);
      if (match) {
        selectAssistant(match);
      }
    },
    [assistants, selectAssistant],
  );

  // [Data] Initial load of assistants catalog (executes only once on mount)
  const loadAssistants = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchAssistants();
      setAssistants(data);
      if (data.length > 0) {
        const savedId =
          typeof window !== "undefined"
            ? localStorage.getItem("active_assistant_id")
            : null;
        const matched =
          data.find((a) => a.id === savedId) ||
          data.find((a) => a.is_default) ||
          data[0];
        setActiveAssistant(matched);
        syncAssistantToModelConfig(matched);
      }
    } catch (err) {
      console.error("Failed to load assistants catalog", err);
      toast.error(
        "Could not load assistants catalog. Please check your connection.",
        "Catalog Error",
      );
    } finally {
      setIsLoading(false);
    }
  }, [syncAssistantToModelConfig]);

  useEffect(() => {
    loadAssistants();
  }, [loadAssistants]);

  const createAssistant = async (payload: AssistantCreatePayload) => {
    try {
      const created = await createAssistantApi(payload);
      setAssistants((prev) => [created, ...prev]);
      selectAssistant(created);
      setAssistantToEdit(null);
      toast.success(
        `Assistant "${created.name}" created successfully.`,
        "Assistant Created",
      );
    } catch (err: any) {
      toast.error(
        err.message || "Failed to create new assistant.",
        "Creation Failed",
      );
    }
  };

  const updateAssistant = async (
    id: string,
    payload: AssistantUpdatePayload,
  ) => {
    try {
      const updated = await updateAssistantApi(id, payload);
      setAssistants((prev) =>
        prev.map((a) => (a.id === updated.id ? updated : a)),
      );
      if (activeAssistant?.id === updated.id) {
        setActiveAssistant(updated);
        syncAssistantToModelConfig(updated);
      }
      setAssistantToEdit(null);
      toast.success(
        `Assistant "${updated.name}" updated successfully.`,
        "Configuration Saved",
      );
    } catch (err: any) {
      toast.error(
        err.message || "Failed to update assistant.",
        "Update Failed",
      );
    }
  };

  const deleteAssistant = async (assistant: Assistant) => {
    if (
      !window.confirm(
        `Are you sure you want to delete assistant "${assistant.name}"?`,
      )
    ) {
      return;
    }
    try {
      await deleteAssistantApi(assistant.id);
      const updated = assistants.filter((a) => a.id !== assistant.id);
      setAssistants(updated);
      if (activeAssistant?.id === assistant.id && updated.length > 0) {
        const fallback = updated.find((a) => a.is_default) || updated[0];
        selectAssistant(fallback);
      }
      toast.info(
        `Assistant "${assistant.name}" has been removed.`,
        "Assistant Deleted",
      );
    } catch (err: any) {
      toast.error(
        err.message || "Failed to delete assistant.",
        "Delete Failed",
      );
    }
  };

  return {
    assistants,
    activeAssistant,
    assistantToEdit,
    setAssistantToEdit,
    isLoading,
    availableProviderModels,
    selectAssistant,
    selectAssistantById,
    createAssistant,
    updateAssistant,
    deleteAssistant,
    refreshAssistants: loadAssistants,
  };
}
