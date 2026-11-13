import { useState, useEffect, useCallback, useRef } from "react";
import {
  Agent,
  AgentCreatePayload,
  AgentUpdatePayload,
} from "@/types/agent";
import {
  fetchAgents,
  createAgentApi,
  updateAgentApi,
  deleteAgentApi,
} from "@/lib/api";
import { ModelConfigState } from "@/types/chat";
import { SUPPORTED_PROVIDERS } from "@/components/assistant-config/types";
import { toast } from "@/components/ui/toast";

interface UseAgentsProps {
  onSyncModelConfig?: (config: Partial<ModelConfigState>) => void;
}

/**
 * Custom hook managing the Enterprise Agents catalog, active agent selection,
 * and database synchronization with stable callback references.
 */
export function useAgents({ onSyncModelConfig }: UseAgentsProps = {}) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeAgent, setActiveAgent] = useState<Agent | null>(null);
  const [agentToEdit, setAgentToEdit] = useState<Agent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [availableProviderModels, setAvailableProviderModels] = useState<
    Record<string, string[]>
  >({});

  // [Stability] Keep stable ref to onSyncModelConfig to prevent infinite render loops
  const onSyncModelConfigRef = useRef(onSyncModelConfig);
  useEffect(() => {
    onSyncModelConfigRef.current = onSyncModelConfig;
  }, [onSyncModelConfig]);

  const isMountedRef = useRef(false);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // [Data] Load available models per provider from SUPPORTED_PROVIDERS
  useEffect(() => {
    const mapping: Record<string, string[]> = {};
    for (const prov of SUPPORTED_PROVIDERS) {
      mapping[prov.id.toLowerCase()] = [...prov.defaultModels];
    }
    setAvailableProviderModels(mapping);
  }, []);

  // [Sync] Propagate agent properties to the playground model config
  const syncAgentToModelConfig = useCallback((agent: Agent) => {
    onSyncModelConfigRef.current?.({
      providerId: agent.model?.provider_id || (agent as any).provider_id,
      modelName: agent.model?.model_name || (agent as any).model_name,
      temperature: agent.model?.temperature ?? (agent as any).temperature ?? 0.7,
      enableReasoning: agent.model?.enable_reasoning ?? (agent as any).enable_reasoning ?? false,
      reasoningEffort: agent.model?.reasoning_effort ?? (agent as any).reasoning_effort ?? "low",
      systemPrompt: agent.instructions || (agent as any).system_prompt || undefined,
      baseUrl: agent.model?.base_url || (agent as any).base_url || undefined,
      apiKey: agent.model?.api_key || (agent as any).masked_api_key || undefined,
    });
  }, []);

  const selectAgent = useCallback(
    (agent: Agent) => {
      setActiveAgent(agent);
      if (typeof window !== "undefined") {
        localStorage.setItem("active_agent_id", agent.id);
      }
      syncAgentToModelConfig(agent);
    },
    [syncAgentToModelConfig]
  );

  const selectAgentById = useCallback(
    (agentId: string) => {
      const match = agents.find((a) => a.id === agentId);
      if (match) {
        selectAgent(match);
      }
    },
    [agents, selectAgent]
  );

  // [Data] Initial load of agents catalog (executes only once on mount)
  const loadAgents = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchAgents();
      if (!isMountedRef.current) return;
      setAgents(data);
      if (data.length > 0) {
        const savedId =
          typeof window !== "undefined"
            ? localStorage.getItem("active_agent_id")
            : null;
        const matched =
          data.find((a) => a.id === savedId) ||
          data.find((a) => a.is_default) ||
          data[0];
        setActiveAgent(matched);
        syncAgentToModelConfig(matched);
      } else {
        setActiveAgent(null);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error("Failed to load agents catalog", err);
      toast.error(
        "Could not load agents catalog. Please check your connection.",
        "Catalog Error"
      );
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [syncAgentToModelConfig]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const createAgent = async (payload: AgentCreatePayload) => {
    try {
      const created = await createAgentApi(payload);
      setAgents((prev) => [created, ...prev]);
      selectAgent(created);
      setAgentToEdit(null);
      toast.success(`Agent "${created.name}" created successfully.`, "Agent Created");
    } catch (err: any) {
      toast.error(err.message || "Failed to create new agent.", "Creation Failed");
    }
  };

  const updateAgent = async (id: string, payload: AgentUpdatePayload) => {
    try {
      const updated = await updateAgentApi(id, payload);
      setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      if (activeAgent?.id === updated.id) {
        setActiveAgent(updated);
        syncAgentToModelConfig(updated);
      }
      setAgentToEdit(null);
      toast.success(`Agent "${updated.name}" updated successfully.`, "Agent Updated");
    } catch (err: any) {
      toast.error(err.message || "Failed to update agent.", "Update Failed");
    }
  };

  const deleteAgent = async (id: string) => {
    try {
      await deleteAgentApi(id);
      setAgents((prev) => prev.filter((a) => a.id !== id));
      if (activeAgent?.id === id) {
        const remaining = agents.filter((a) => a.id !== id);
        const next = remaining[0] || null;
        setActiveAgent(next);
        if (next) {
          syncAgentToModelConfig(next);
        }
      }
      toast.success("Agent removed permanently.", "Agent Deleted");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete agent.", "Deletion Failed");
    }
  };

  return {
    agents,
    activeAgent,
    agentToEdit,
    setAgentToEdit,
    isLoading,
    selectAgent,
    selectAgentById,
    createAgent,
    updateAgent,
    deleteAgent,
    availableProviderModels,
    setAvailableProviderModels,
    reloadAgents: loadAgents,
    // [Compatibility Aliases]
    assistants: agents,
    activeAssistant: activeAgent,
    assistantToEdit: agentToEdit,
    setAssistantToEdit: setAgentToEdit,
    selectAssistant: selectAgent,
    selectAssistantById: selectAgentById,
    createAssistant: createAgent,
    updateAssistant: updateAgent,
    deleteAssistant: deleteAgent,
  };
}

export const useAssistants = useAgents;
