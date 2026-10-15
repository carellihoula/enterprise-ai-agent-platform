import { useState, useEffect, useRef } from "react";
import { Message, Session, ModelConfigState } from "@/types/chat";
import {
  fetchSessions,
  createSession,
  fetchSessionDetails,
  deleteSession,
  streamChatCompletion,
} from "@/lib/api";

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

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setIsLoadingSessions(true);
    setErrorMessage(null);
    try {
      const data = await fetchSessions();
      setSessions(data);
      if (data.length > 0 && !currentSessionId) {
        handleSelectSession(data[0].id);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to connect to backend server");
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const handleSelectSession = async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    onSessionSelected?.();
    setIsLoadingMessages(true);
    setErrorMessage(null);
    try {
      const detail = await fetchSessionDetails(sessionId);
      setMessages(detail.messages || []);
      // [Sync] Update selected assistant if session was bound to an assistant
      if (detail.assistant_id && onAssistantMatched) {
        onAssistantMatched(detail.assistant_id);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to load conversation messages");
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const handleNewSession = async (customTitle?: string, assistantIdOverride?: string) => {
    setErrorMessage(null);
    try {
      const targetAssistantId = assistantIdOverride !== undefined ? assistantIdOverride : activeAssistantId;
      const newSession = await createSession(customTitle || "New Conversation", targetAssistantId);
      setSessions((prev) => [newSession, ...prev]);
      setCurrentSessionId(newSession.id);
      setMessages([]);
      onSessionSelected?.();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to create new conversation");
    }
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
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to delete session");
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
        setErrorMessage("Failed to initialize session");
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
      onFinish: () => {
        setIsStreaming(false);
        abortControllerRef.current = null;
      },
      onError: (err) => {
        setIsStreaming(false);
        abortControllerRef.current = null;
        if (err.name !== "AbortError" && !err.message.includes("aborted")) {
          setErrorMessage(
            err.message || "Error occurred during streaming generation",
          );
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
