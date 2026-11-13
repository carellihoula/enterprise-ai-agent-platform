import { useState, useEffect, useRef } from "react";
import { Message, Session, ModelConfigState } from "@/types/chat";
import {
  fetchSessions,
  createSession,
  fetchSessionDetails,
  deleteSession,
  streamChatCompletion,
} from "@/lib/api";
import { toast } from "@/components/ui/toast";

interface UseChatSessionOptions {
  modelConfig: ModelConfigState;
  activeAssistantId?: string;
  onSessionSelected?: () => void;
  onAssistantMatched?: (assistantId: string) => void;
}

/**
 * Custom hook encapsulating conversation session lifecycle, message streaming,
 * abort handling, and API integration.
 */
export function useChatSession({
  modelConfig,
  activeAssistantId,
  onSessionSelected,
  onAssistantMatched,
}: UseChatSessionOptions) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    loadSessions();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadSessions = async () => {
    setIsLoadingSessions(true);
    setErrorMessage(null);
    try {
      const data = await fetchSessions();
      if (!isMountedRef.current) return;
      setSessions(data);
      if (data.length > 0 && !currentSessionId) {
        handleSelectSession(data[0].id);
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      toast.error(
        "Could not connect to the backend server. Please verify the service is running.",
        "Connection Error",
      );
    } finally {
      if (isMountedRef.current) {
        setIsLoadingSessions(false);
      }
    }
  };

  const handleSelectSession = async (sessionId: string) => {
    if (!isMountedRef.current) return;
    setCurrentSessionId(sessionId);
    onSessionSelected?.();
    setIsLoadingMessages(true);
    setErrorMessage(null);
    try {
      const detail = await fetchSessionDetails(sessionId);
      if (!isMountedRef.current) return;
      const hydrated = (detail.messages || []).map((m) => ({
        ...m,
        toolCalls: m.toolCalls ?? m.trace_steps,
      }));
      setMessages(hydrated);
      // [Sync] Update selected assistant if session was bound to an assistant
      if (detail.assistant_id && onAssistantMatched) {
        onAssistantMatched(detail.assistant_id);
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      toast.error(
        "Failed to load conversation messages.",
        "Session Error",
      );
    } finally {
      if (isMountedRef.current) {
        setIsLoadingMessages(false);
      }
    }
  };

  const handleNewSession = async (_customTitle?: string, _assistantIdOverride?: string) => {
    setErrorMessage(null);
    // [Lazy Persistence] Reset local draft state; DB session is created only when the user sends a message
    setCurrentSessionId(null);
    setMessages([]);
    onSessionSelected?.();
  };

  const handleDeleteSession = async (
    sessionId: string,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    try {
      await deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (currentSessionId === sessionId) {
        setCurrentSessionId(null);
        setMessages([]);
      }
      toast.info("Conversation deleted successfully.", "Session Removed");
    } catch (err: any) {
      toast.error(
        "Failed to delete conversation session.",
        "Delete Error",
      );
    }
  };

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  };

  const handleSendMessage = async (content: string) => {
    let activeSessionId = currentSessionId;

    if (!activeSessionId) {
      try {
        const newSession = await createSession(content.slice(0, 30), activeAssistantId);
        setSessions((prev) => [newSession, ...prev]);
        activeSessionId = newSession.id;
        setCurrentSessionId(newSession.id);
      } catch (err: any) {
        toast.error("Failed to initialize conversation session.", "Session Error");
        return;
      }
    }

    const userMessage: Message = { role: "user", content };
    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);
    setErrorMessage(null);

    const assistantMessage: Message = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, assistantMessage]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Retrieve client keys from localStorage if configured
    let apiKey: string | undefined = undefined;
    let baseUrl: string | undefined = undefined;

    if (typeof window !== "undefined") {
      const prov = modelConfig.providerId.toLowerCase();
      apiKey = localStorage.getItem(`api_key_${prov}`) || undefined;
      if (prov === "custom" || prov === "openrouter") {
        baseUrl = modelConfig.baseUrl || localStorage.getItem(`base_url_${prov}`) || undefined;
      }
    }

    await streamChatCompletion({
      sessionId: activeSessionId,
      assistantId: activeAssistantId,
      messages: [userMessage],
      providerName: modelConfig.providerId,
      modelName: modelConfig.modelName,
      temperature: modelConfig.temperature,
      maxTokens: modelConfig.maxTokens,
      systemInstruction: modelConfig.systemPrompt,
      apiKey,
      baseUrl,
      abortSignal: controller.signal,
      onChunk: (delta) => {
        setMessages((prev) => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          if (lastIndex >= 0 && updated[lastIndex].role === "assistant") {
            updated[lastIndex] = {
              ...updated[lastIndex],
              content: updated[lastIndex].content + delta,
            };
          }
          return updated;
        });
      },
      onToolEvent: (evt) => {
        setMessages((prev) => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          if (lastIndex < 0 || updated[lastIndex].role !== "assistant") {
            return prev;
          }
          const existing = updated[lastIndex].toolCalls ?? [];
          let nextCalls = [...existing];
          if (evt.type === "think_delta" && evt.delta) {
            const lastStep = nextCalls[nextCalls.length - 1];
            if (lastStep && lastStep.type === "think" && lastStep.status === "running") {
              nextCalls[nextCalls.length - 1] = {
                ...lastStep,
                text: (lastStep.text ?? "") + evt.delta,
              };
            } else {
              nextCalls.push({
                id: `think-${nextCalls.length}`,
                type: "think",
                name: "Reasoning",
                status: "running",
                text: evt.delta,
              });
            }
          } else if (evt.type === "think" && evt.text) {
            nextCalls.push({
              id: `think-${nextCalls.length}`,
              type: "think",
              name: "Reasoning",
              status: "done",
              text: evt.text,
            });
          } else if (evt.type === "tool_start" && evt.tool_name) {
            nextCalls = nextCalls.map((c) =>
              c.type === "think" && c.status === "running"
                ? { ...c, status: "done" as const }
                : c,
            );
            nextCalls.push({
              id: `tool-${nextCalls.length}`,
              type: "tool",
              name: evt.tool_name,
              status: "running",
              arguments: evt.arguments,
            });
          } else if (evt.type === "tool_end" && evt.tool_name) {
            const idx = nextCalls.findLastIndex(
              (c) => c.name === evt.tool_name && c.status === "running",
            );
            const prevArgs = idx >= 0 ? nextCalls[idx].arguments : undefined;
            const resolved = {
              id: idx >= 0 ? nextCalls[idx].id : `tool-${nextCalls.length}`,
              type: "tool" as const,
              name: evt.tool_name,
              status: evt.ok === false ? ("error" as const) : ("done" as const),
              latencyMs: evt.latency_ms,
              arguments: prevArgs,
              output: evt.output,
            };
            if (idx >= 0) {
              nextCalls[idx] = resolved;
            } else {
              nextCalls = [...nextCalls, resolved];
            }
          }
          updated[lastIndex] = { ...updated[lastIndex], toolCalls: nextCalls };
          return updated;
        });
      },
      onFinish: () => {
        setMessages((prev) => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          if (lastIndex >= 0 && updated[lastIndex].toolCalls?.length) {
            updated[lastIndex] = {
              ...updated[lastIndex],
              toolCalls: updated[lastIndex].toolCalls?.map((c) =>
                c.type === "think" && c.status === "running"
                  ? { ...c, status: "done" as const }
                  : c,
              ),
            };
          }
          return updated;
        });
        setIsStreaming(false);
        abortControllerRef.current = null;
      },
      onError: (err) => {
        setIsStreaming(false);
        abortControllerRef.current = null;
        if (err.name !== "AbortError" && !err.message.includes("aborted")) {
          toast.add({
            variant: "destructive",
            title: "Generation Error",
            description:
              err.message || "Failed to generate AI response from backend.",
            actionProps: {
              children: "Retry",
              onClick: () => handleRetryLastMessage(),
            },
          });
        }
      },
    });
  };

  const handleRetryLastMessage = () => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMsg) {
      handleSendMessage(lastUserMsg.content);
    }
  };

  return {
    sessions,
    currentSessionId,
    messages,
    isLoadingSessions,
    isLoadingMessages,
    isStreaming,
    errorMessage,
    setErrorMessage,
    handleSelectSession,
    handleNewSession,
    handleDeleteSession,
    handleSendMessage,
    handleStopStreaming,
    handleRetryLastMessage,
  };
}
