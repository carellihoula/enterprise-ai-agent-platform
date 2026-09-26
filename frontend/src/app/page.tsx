'use client';

/**
 * Enterprise AI Agent Platform - Main Application Shell.
 * Integrates global Header, collapsible hierarchical Sidebar, Command Palette (⌘K),
 * Dashboard (Home view), and the interactive Agent Playground.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Sidebar, NavTabId } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { CommandPalette } from '@/components/CommandPalette';
import { DashboardView } from '@/components/dashboard/DashboardView';
import { ApiKeyModal } from '@/components/ApiKeyModal';
import { ChatMessageItem } from '@/components/ChatMessageItem';
import { ChatInput } from '@/components/ChatInput';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { Message, Session, PRESET_PROVIDERS, ModelConfigState } from '@/types/chat';
import {
  fetchSessions,
  createSession,
  fetchSessionDetails,
  deleteSession,
  streamChatCompletion,
} from '@/lib/api';
import {
  Bot,
  Sparkles,
  Layers,
  ArrowRight,
  Workflow,
  Database,
  Wrench,
  Network,
  Cpu,
  Code2,
  Activity,
  BarChart3,
} from 'lucide-react';

export default function EnterpriseAppPage() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<NavTabId>('home');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);

  // Chat and Conversation Session State
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

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcut listener for Command Palette (⌘K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (activeTab === 'chat') {
      scrollToBottom();
    }
  }, [messages, isStreaming, activeTab]);

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
      setActiveTab('chat');
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

  const handleLaunchAgentChat = (agentName: string) => {
    setActiveTab('chat');
    // Pre-populate or start a focused session for the agent
    handleNewSession();
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-zinc-900 font-sans">
      {/* Collapsible Sidebar */}
      {isSidebarOpen && (
        <Sidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          isLoadingSessions={isLoadingSessions}
          onOpenSettings={() => setIsApiKeyModalOpen(true)}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-white relative">
        {/* Global Navigation Header */}
        <Header
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          onOpenSettings={() => setIsApiKeyModalOpen(true)}
          onOpenAgentBuilder={() => setActiveTab('agents')}
          modelConfig={modelConfig}
        />

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="p-3 max-w-4xl mx-auto w-full">
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

        {/* Screen Routing */}
        {activeTab === 'home' && (
          <DashboardView
            onNavigate={(tab) => setActiveTab(tab)}
            onOpenAgentBuilder={() => setActiveTab('agents')}
            onOpenSettings={() => setIsApiKeyModalOpen(true)}
            onLaunchAgentChat={handleLaunchAgentChat}
          />
        )}

        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Active Model Indicator Header Sub-bar */}
            <div className="px-6 py-2 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-zinc-500 font-medium">Session:</span>
                <span className="font-semibold text-zinc-800">
                  {sessions.find((s) => s.id === currentSessionId)?.title || 'New Conversation'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[10px] text-zinc-400 bg-white px-2 py-0.5 rounded border border-zinc-200">
                  Engine: <span className="text-indigo-600 font-mono font-medium">{modelConfig.providerId} / {modelConfig.modelName}</span>
                </span>
              </div>
            </div>

            {/* Chat Messages Stream */}
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
                    Test your agents or communicate directly with your configured provider models (Google Vertex, OpenAI, Anthropic, or Local Ollama/vLLM).
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
          </div>
        )}

        {/* Placeholder Views for Upcoming Steps (Agents, Workflows, Knowledge, etc.) */}
        {activeTab !== 'home' && activeTab !== 'chat' && (
          <div className="flex-1 overflow-y-auto p-8 max-w-4xl mx-auto w-full flex flex-col justify-center items-center text-center space-y-5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
              {activeTab === 'agents' && <Bot className="w-6 h-6" />}
              {activeTab === 'workflows' && <Workflow className="w-6 h-6" />}
              {activeTab === 'knowledge' && <Database className="w-6 h-6" />}
              {activeTab === 'tools' && <Wrench className="w-6 h-6" />}
              {activeTab === 'mcp' && <Network className="w-6 h-6" />}
              {activeTab === 'models' && <Cpu className="w-6 h-6" />}
              {activeTab === 'api' && <Code2 className="w-6 h-6" />}
              {activeTab === 'logs' && <Activity className="w-6 h-6" />}
              {activeTab === 'usage' && <BarChart3 className="w-6 h-6" />}
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-zinc-900 capitalize">
                {activeTab} Management Module
              </h3>
              <p className="text-xs text-zinc-500 max-w-md">
                This module is next in sequence according to the step-by-step implementation roadmap of interface.md.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab('home')}
                className="rounded-xl text-xs border-zinc-200"
              >
                Return to Dashboard
              </Button>
              <Button
                size="sm"
                onClick={() => setActiveTab('chat')}
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs gap-1.5"
              >
                <span>Open Playground</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* Global Command Palette Dialog (⌘K / Ctrl+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={(tab) => setActiveTab(tab as NavTabId)}
        onOpenSettings={() => setIsApiKeyModalOpen(true)}
        onOpenAgentBuilder={() => setActiveTab('agents')}
      />

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
