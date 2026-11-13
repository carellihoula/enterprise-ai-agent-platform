"use client";

/**
 * Custom React hook managing MCP server configuration state, validation,
 * bidirectional Form/JSON synchronization, and backend API persistence.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  McpEditMode,
  McpJsonError,
  McpServerFormState,
  McpTestState,
  McpTransportType,
} from "@/types/mcp";
import {
  computeConfigSignature,
  createMcpServerState,
  dtoToFormServer,
  dtoToTestState,
  extractJsonErrorInfo,
  formServerToDto,
  generateClientId,
  generateNextServerName,
  parseMcpJsonString,
  serializeMcpServers,
  countTotalValidationIssues,
} from "@/components/mcp/mcpUtils";
import { fetchMcpConfig, syncMcpConfig, testMcpServer } from "@/lib/api";
import { toast } from "@/components/ui/toast";

interface UseMcpConfigOptions {
  agentId?: string;
}

/**
 * Orchestrates MCP server list state, JSON editor state, validation, and backend synchronization.
 */
export function useMcpConfig({ agentId }: UseMcpConfigOptions = {}) {
  const [servers, setServers] = useState<McpServerFormState[]>([]);
  const [savedServers, setSavedServers] = useState<McpServerFormState[]>([]);
  const [mode, setModeState] = useState<McpEditMode>("form");
  const [jsonText, setJsonText] = useState<string>(() =>
    serializeMcpServers([])
  );
  const [jsonError, setJsonError] = useState<McpJsonError | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [statusShake, setStatusShake] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [testStates, setTestStates] = useState<Record<string, McpTestState>>({});
  const [savedTestStates, setSavedTestStates] = useState<Record<string, McpTestState>>({});

  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(false);

  // [Lifecycle] Track mounted state and clean up pending timers on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (deleteTimerRef.current) {
        clearTimeout(deleteTimerRef.current);
      }
    };
  }, []);

  // [Mode Restore] Restore preferred Form/JSON view mode from localStorage on mount
  useEffect(() => {
    try {
      const storedMode = localStorage.getItem("mcp-mode");
      if (storedMode === "json" || storedMode === "form") {
        setModeState(storedMode);
      }
    } catch {
      // Ignore storage access errors in restricted environments
    }
  }, []);

  // [Backend Hydration] Load persisted MCP servers from API
  useEffect(() => {
    let cancelled = false;

    async function loadFromBackend() {
      setIsLoading(true);
      try {
        const data = await fetchMcpConfig(agentId);
        if (cancelled || !isMountedRef.current) return;

        const mapped = data.servers.map((dto) => dtoToFormServer(dto, true));
        const hydratedTestStates: Record<string, McpTestState> = {};
        data.servers.forEach((dto, idx) => {
          const id = mapped[idx].id;
          hydratedTestStates[id] = dtoToTestState(dto);
        });

        setServers(mapped);
        setSavedServers(mapped);
        setTestStates(hydratedTestStates);
        setSavedTestStates(hydratedTestStates);
        setJsonText(serializeMcpServers(mapped));
        setJsonError(null);
      } catch {
        // [Offline Fallback] Keep empty local state if backend is unreachable
      } finally {
        if (!cancelled && isMountedRef.current) {
          setIsLoading(false);
        }
      }
    }

    loadFromBackend();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const isDirty = computeConfigSignature(servers) !== computeConfigSignature(savedServers);
  const issueCount = countTotalValidationIssues(servers);

  const switchMode = useCallback(
    (nextMode: McpEditMode) => {
      if (nextMode === mode) return;
      if (nextMode === "form" && jsonError) {
        setStatusShake(false);
        setTimeout(() => setStatusShake(true), 10);
        toast.warning("Fix the JSON syntax errors before returning to the form view.");
        return;
      }
      setModeState(nextMode);
      try {
        localStorage.setItem("mcp-mode", nextMode);
      } catch {
        // Ignore storage errors
      }
      if (nextMode === "json") {
        setJsonText(serializeMcpServers(servers));
        setJsonError(null);
      }
      setConfirmDeleteId(null);
    },
    [mode, jsonError, servers]
  );

  const handleJsonChange = useCallback(
    (newText: string) => {
      setJsonText(newText);
      try {
        const parsedList = parseMcpJsonString(newText, servers);
        setServers(parsedList);
        setJsonError(null);
        // [Status Integrity] Reset test states when JSON configuration changes
        setTestStates({});
      } catch (err) {
        setJsonError(extractJsonErrorInfo(err, newText));
      }
    },
    [servers]
  );

  const handleFormatJson = useCallback(() => {
    try {
      const formatted = JSON.stringify(JSON.parse(jsonText), null, 2);
      handleJsonChange(formatted);
    } catch {
      toast.error("Cannot format: the JSON document is invalid.");
    }
  }, [jsonText, handleJsonChange]);

  const handleCopyJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      toast.success("Copied mcp.json to clipboard.");
    } catch {
      toast.error("Failed to copy automatically. Please select and copy manually.");
    }
  }, [jsonText]);

  const toggleServerOpen = useCallback((id: string) => {
    setServers((prev) =>
      prev.map((s) => (s.id === id ? { ...s, open: !s.open } : s))
    );
  }, []);

  const toggleCollapseAll = useCallback(() => {
    setServers((prev) => {
      const anyOpen = prev.some((s) => s.open);
      return prev.map((s) => ({ ...s, open: !anyOpen }));
    });
  }, []);

  const addServer = useCallback((): string => {
    const newId = generateClientId();
    setServers((prev) => {
      const nextName = generateNextServerName("new-server", prev);
      const created = createMcpServerState(nextName, "stdio", {
        id: newId,
        command: "npx",
        open: true,
      });
      return [...prev, created];
    });
    setConfirmDeleteId(null);
    return newId;
  }, []);

  const duplicateServer = useCallback((id: string) => {
    setServers((prev) => {
      const index = prev.findIndex((s) => s.id === id);
      if (index === -1) return prev;
      const source = prev[index];
      const copy: McpServerFormState = {
        ...JSON.parse(JSON.stringify(source)),
        id: generateClientId(),
        name: generateNextServerName(`${source.name}-copy`, prev),
        open: true,
      };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
  }, []);

  const requestOrConfirmDelete = useCallback(
    (id: string) => {
      if (confirmDeleteId !== id) {
        setConfirmDeleteId(id);
        if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
        deleteTimerRef.current = setTimeout(() => {
          setConfirmDeleteId((curr) => (curr === id ? null : curr));
        }, 3500);
        return;
      }
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      setConfirmDeleteId(null);
      setServers((prev) => prev.filter((s) => s.id !== id));
    },
    [confirmDeleteId]
  );

  const updateServerField = useCallback(
    (id: string, patch: Partial<McpServerFormState>) => {
      setServers((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
      );

      // [Status Integrity] Reset connection status only when connection-relevant fields change
      const configKeys: Array<keyof McpServerFormState> = [
        "name",
        "type",
        "command",
        "args",
        "env",
        "url",
        "headers",
      ];
      const modifiedConfig = configKeys.some((key) => key in patch);
      if (modifiedConfig) {
        setTestStates((prev) => {
          if (!prev[id] || prev[id].status === "idle") return prev;
          return { ...prev, [id]: { status: "idle" } };
        });
      }
    },
    []
  );

  const changeTransport = useCallback((id: string, type: McpTransportType) => {
    setServers((prev) =>
      prev.map((s) => (s.id === id && s.type !== type ? { ...s, type } : s))
    );
    setTestStates((prev) => ({ ...prev, [id]: { status: "idle" } }));
  }, []);

  const testServerConnection = useCallback(
    async (id: string) => {
      const target = servers.find((s) => s.id === id);
      if (!target) return;

      setTestStates((prev) => ({
        ...prev,
        [id]: { status: "testing", message: "Testing connection..." },
      }));

      try {
        const result = await testMcpServer(formServerToDto(target));
        if (!isMountedRef.current) return;
        const discoveredTools =
          result.tool_details && result.tool_details.length > 0
            ? result.tool_details
            : (result.tools || []).map((name) => ({ name, description: "" }));

        setTestStates((prev) => ({
          ...prev,
          [id]: {
            status: result.ok ? "connected" : "failed",
            message: result.message,
            toolsCount: result.tools_count,
            tools: discoveredTools,
            latencyMs: result.latency_ms,
          },
        }));
      } catch (err) {
        if (!isMountedRef.current) return;
        setTestStates((prev) => ({
          ...prev,
          [id]: {
            status: "failed",
            message:
              err instanceof Error ? err.message : "Connection test failed.",
          },
        }));
      }
    },
    [servers]
  );

  const handleSave = useCallback(async () => {
    if (!isDirty || jsonError || issueCount > 0 || isSaving) return;
    setIsSaving(true);
    try {
      const payload = servers.map((s) => formServerToDto(s, testStates[s.id]));
      const response = await syncMcpConfig(payload, agentId);
      const openMap = new Map(servers.map((s) => [s.name.trim(), s.open]));
      const persisted = response.servers.map((dto) =>
        dtoToFormServer(dto, openMap.get(dto.name) ?? true)
      );
      const persistedTests: Record<string, McpTestState> = {};
      response.servers.forEach((dto, idx) => {
        persistedTests[persisted[idx].id] = dtoToTestState(dto);
      });

      setServers(persisted);
      setSavedServers(persisted);
      setTestStates(persistedTests);
      setSavedTestStates(persistedTests);
      setJsonText(serializeMcpServers(persisted));
      setJsonError(null);
      toast.success("MCP configuration saved.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save MCP configuration."
      );
    } finally {
      setIsSaving(false);
    }
  }, [isDirty, jsonError, issueCount, isSaving, servers, testStates, agentId]);

  const handleRevert = useCallback(() => {
    if (!isDirty) return;
    const restored: McpServerFormState[] = JSON.parse(JSON.stringify(savedServers));
    setServers(restored);
    setTestStates(savedTestStates);
    setJsonError(null);
    setJsonText(serializeMcpServers(restored));
    setConfirmDeleteId(null);
  }, [isDirty, savedServers, savedTestStates]);

  return {
    servers,
    mode,
    jsonText,
    jsonError,
    confirmDeleteId,
    statusShake,
    isLoading,
    isSaving,
    isDirty,
    issueCount,
    testStates,
    switchMode,
    handleJsonChange,
    handleFormatJson,
    handleCopyJson,
    toggleServerOpen,
    toggleCollapseAll,
    addServer,
    duplicateServer,
    requestOrConfirmDelete,
    updateServerField,
    changeTransport,
    testServerConnection,
    handleSave,
    handleRevert,
  };
}
