'use client';

/**
 * AI Chat Playground main page component with static curated model selection.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { ApiKeyModal } from '@/components/ApiKeyModal';
import { ChatMessageItem } from '@/components/ChatMessageItem';
import { ChatInput } from '@/components/ChatInput';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Message, Session, PRESET_PROVIDERS, ModelConfigState } from '@/types/chat';
import {
  fetchSessions,
  createSession,
  fetchSessionDetails,
  deleteSession,
  streamChatCompletion,
} from '@/lib/api';
import { Bot, PanelLeftOpen, Sparkles, Settings } from 'lucide-react';

export default function ChatPlaygroundPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  // Provider, Model, and dynamic hyperparameter state
  const [modelConfig, setModelConfig] = useState<ModelConfigState>({
    providerId: PRESET_PROVIDERS[0].id,
    modelName: PRESET_PROVIDERS[0].defaultModel,
    temperature: 0.7,
  });

  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming]);

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
      setErrorMessage(err.message || 'Failed to connect to backend server');
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const handleSelectSession = async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setIsLoadingMessages(true);
    setErrorMessage(null);
    try {
      const detail = await fetchSessionDetails(sessionId);
      setMessages(detail.messages || []);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load conversation messages');
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const handleNewSession = async () => {
    setErrorMessage(null);
    try {
      const newSession = await createSession('New Conversation');
      setSessions((prev) => [newSession, ...prev]);
      setCurrentSessionId(newSession.id);
      setMessages([]);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create new conversation');
    }
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (currentSessionId === sessionId) {
        setCurrentSessionId(null);
        setMessages([]);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete session');
    }
  };


  const handleSendMessage = async (content: string) => {
    let activeSessionId = currentSessionId;

    if (!activeSessionId) {
      try {
        const newSession = await createSession(content.slice(0, 30));
        setSessions((prev) => [newSession, ...prev]);
        activeSessionId = newSession.id;
        setCurrentSessionId(newSession.id);
      } catch (err: any) {
        setErrorMessage('Failed to initialize session');
        return;
      }
    }

    const userMessage: Message = { role: 'user', content };
    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);
    setErrorMessage(null);

    const assistantMessage: Message = { role: 'assistant', content: '' };
    setMessages((prev) => [...prev, assistantMessage]);

    // Retrieve client keys from localStorage if configured
    let apiKey: string | undefined = undefined;
    let baseUrl: string | undefined = undefined;

    if (typeof window !== 'undefined') {
      const prov = modelConfig.providerId.toLowerCase();
      if (prov === 'openai') {
        apiKey = localStorage.getItem('api_key_openai') || undefined;
      } else if (prov === 'anthropic') {
        apiKey = localStorage.getItem('api_key_anthropic') || undefined;
      } else if (prov === 'gemini') {
        apiKey = localStorage.getItem('api_key_gemini') || undefined;
      } else if (prov === 'custom') {
        apiKey = localStorage.getItem('api_key_custom') || undefined;
        baseUrl = localStorage.getItem('base_url_custom') || undefined;
      }
    }

    await streamChatCompletion({
      sessionId: activeSessionId,
      messages: [userMessage],
      providerName: modelConfig.providerId,
      modelName: modelConfig.modelName,
      temperature: modelConfig.temperature,
      maxTokens: modelConfig.maxTokens,
      systemInstruction: modelConfig.systemPrompt,
      apiKey,
      baseUrl,
      onChunk: (delta) => {
        setMessages((prev) => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          if (lastIndex >= 0 && updated[lastIndex].role === 'assistant') {
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
      },
      onError: (err) => {
        setIsStreaming(false);
        setErrorMessage(err.message || 'Error occurred during streaming generation');
      },
    });
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-zinc-900 font-sans">
      {/* Collapsible Sidebar */}
      {isSidebarOpen && (
        <Sidebar
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          isLoadingSessions={isLoadingSessions}
          onToggleSidebar={() => setIsSidebarOpen(false)}
          onOpenSettings={() => setIsApiKeyModalOpen(true)}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-white relative">
        {/* Top Header Bar */}
        <header className="border-b border-zinc-200 px-4 py-2.5 flex items-center justify-between bg-white/90 backdrop-blur-md z-10 shrink-0">
          <div className="flex items-center gap-3">
            {!isSidebarOpen && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsSidebarOpen(true)}
                title="Open sidebar"
                className="h-8 w-8 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 shrink-0"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </Button>
            )}

            {/* Active Model Indicator Badge */}
            <div className="flex items-center gap-2 px-3 py-1 bg-zinc-100 border border-zinc-200 rounded-xl text-xs">
              <span className="font-semibold text-zinc-900 capitalize">
                {modelConfig.providerId}
              </span>
              <span className="text-zinc-400">/</span>
              <span className="font-mono text-indigo-600 font-medium">
                {modelConfig.modelName}
              </span>
              <span className="text-[10px] text-zinc-400 bg-white px-1.5 py-0.5 rounded border border-zinc-200">
                T: {modelConfig.temperature}
              </span>
            </div>
          </div>

          {/* Quick Settings Action */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsApiKeyModalOpen(true)}
            className="flex items-center gap-1.5 border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 rounded-xl text-xs shadow-sm"
          >
            <Settings className="w-3.5 h-3.5 text-zinc-500" />
            <span>Settings</span>
          </Button>
        </header>

        {/* Error Alert Banner */}
        {errorMessage && (
          <div className="p-3 max-w-3xl mx-auto w-full">
            <Alert variant="destructive" className="flex items-center justify-between">
              <span className="font-medium text-xs">{errorMessage}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setErrorMessage(null)}
                className="text-[10px] uppercase font-bold tracking-wider hover:bg-rose-100 text-rose-700 h-6"
              >
                Dismiss
              </Button>
            </Alert>
          </div>
        )}

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto w-full bg-white">
          {isLoadingMessages ? (
            <div className="flex items-center justify-center h-full text-zinc-500 gap-2 text-sm">
              <Sparkles className="w-4 h-4 animate-spin text-indigo-600" />
              Loading chat history...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto space-y-4 p-4">
              <div className="p-3.5 bg-zinc-100 border border-zinc-200 rounded-full text-zinc-900 shadow-md">
                <Bot className="w-8 h-8 text-indigo-600" />
              </div>
              <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">
                What can I help with today?
              </h2>
              <p className="text-xs text-zinc-500 leading-relaxed max-w-sm">
                Select OpenAI, Claude, Gemini, or a Custom Provider (Ollama/vLLM) above.
              </p>
            </div>
          ) : (
            messages.map((msg, index) => (
              <ChatMessageItem
                key={index}
                message={msg}
                isStreaming={isStreaming && index === messages.length - 1 && msg.role === 'assistant'}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Bottom Prompt Bar */}
        <ChatInput
          onSendMessage={handleSendMessage}
          isLoading={isStreaming}
        />
      </main>

      {/* Unified Settings & Model Configuration Modal */}
      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        config={modelConfig}
        onSaveConfig={setModelConfig}
      />
    </div>
  );
}
