"use client";

/**
 * Enterprise AI Agent Platform - Main Application Shell.
 * Orchestrator integrating global Header, Sidebar, Command Palette,
 * Dashboard, and the conversational Agent Playground.
 */

import React, { useState, useEffect } from "react";
import { Sidebar, NavTabId } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { CommandPalette } from "@/components/CommandPalette";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { ApiKeyModal } from "@/components/ApiKeyModal";
import { AssistantConfigView } from "@/components/AssistantConfigView";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { PRESET_PROVIDERS, ModelConfigState } from "@/types/chat";
import { fetchProviderConfigs } from "@/lib/api";
import { useChatSession } from "@/hooks/useChatSession";
import {
  EngineSubBar,
  ChatPlaygroundView,
  ModulePlaceholderView,
} from "@/components/playground";

export default function EnterpriseAppPage() {
  const [activeTab, setActiveTab] = useState<NavTabId>("home");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [chatViewMode, setChatViewMode] = useState<"playground" | "config">("playground");

  const [modelConfig, setModelConfig] = useState<ModelConfigState>({
    providerId: PRESET_PROVIDERS[0].id,
    modelName: PRESET_PROVIDERS[0].defaultModel,
    temperature: 0.7,
    availableModels: [],
  });

  useEffect(() => {
    async function loadActiveConfigFromDb() {
      try {
        const configs = await fetchProviderConfigs();
        if (configs && configs.length > 0) {
          const activeProvId =
            typeof window !== "undefined"
              ? localStorage.getItem("active_provider_id") || "gemini"
              : "gemini";
          const match =
            configs.find((c) => c.provider_id === activeProvId) || configs[0];
          if (match) {
            setModelConfig({
              providerId: match.provider_id,
              modelName: match.active_model || (match.models.length > 0 ? match.models[0] : ""),
              temperature: match.temperature ?? 0.7,
              systemPrompt: match.system_prompt || "",
              availableModels: match.models || [],
              baseUrl: match.base_url || undefined,
            });
          }
        }
      } catch (err) {
        console.error("Failed to load initial provider configs from DB", err);
      }
    }
    loadActiveConfigFromDb();
  }, []);

  const handleOpenConfig = () => {
    setActiveTab("chat");
    setChatViewMode("config");
  };

  const handleUpdateModelConfig = (updatedConfig: ModelConfigState) => {
    setModelConfig(updatedConfig);
    if (typeof window !== "undefined") {
      localStorage.setItem("active_provider_id", updatedConfig.providerId);
      localStorage.setItem("active_model_name", updatedConfig.modelName);
      localStorage.setItem("active_temperature", updatedConfig.temperature.toString());
      if (updatedConfig.systemPrompt !== undefined) {
        localStorage.setItem("active_system_prompt", updatedConfig.systemPrompt);
      }
    }
  };

  const {
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
  } = useChatSession({
    modelConfig,
    onSessionSelected: () => {
      setActiveTab("chat");
      setChatViewMode("playground");
    },
  });

  // Keyboard shortcut listener for Command Palette (⌘K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Load saved hyperparameters & provider settings from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedProv = localStorage.getItem("active_provider_id");
      const savedModel = localStorage.getItem("active_model_name");
      const savedTemp = localStorage.getItem("active_temperature");
      const savedSys = localStorage.getItem("active_system_prompt");
      if (savedProv || savedModel || savedTemp) {
        setModelConfig((prev) => ({
          ...prev,
          providerId: savedProv || prev.providerId,
          modelName: savedModel || prev.modelName,
          temperature: savedTemp ? Math.min(parseFloat(savedTemp), 1.0) : prev.temperature,
          systemPrompt: savedSys ?? prev.systemPrompt,
        }));
      }
    }
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-zinc-900 font-sans">
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
          onOpenSettings={handleOpenConfig}
        />
      )}

      <main className="flex-1 flex flex-col h-full overflow-hidden bg-white relative">
        <Header
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          onOpenSettings={handleOpenConfig}
          onOpenAgentBuilder={() => setActiveTab("agents")}
          modelConfig={modelConfig}
        />

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

        {/* 1. Dashboard View */}
        <div className={activeTab === "home" ? "flex-1 flex flex-col h-full overflow-hidden" : "hidden"}>
          <DashboardView
            onNavigate={(tab) => setActiveTab(tab)}
            onOpenAgentBuilder={() => setActiveTab("agents")}
            onOpenSettings={handleOpenConfig}
            onLaunchAgentChat={() => {
              setActiveTab("chat");
              handleNewSession();
            }}
          />
        </div>

        {/* 2. Interactive Chat Playground View */}
        <div className={activeTab === "chat" ? "flex-1 flex flex-col h-full overflow-hidden bg-white" : "hidden"}>
          <EngineSubBar
            modelConfig={modelConfig}
            chatViewMode={chatViewMode}
            onToggleViewMode={() =>
              setChatViewMode(chatViewMode === "config" ? "playground" : "config")
            }
          />

          {chatViewMode === "config" ? (
            <AssistantConfigView
              config={modelConfig}
              onSaveConfig={handleUpdateModelConfig}
              onNavigateToPlayground={() => setChatViewMode("playground")}
            />
          ) : (
            <ChatPlaygroundView
              messages={messages}
              isLoadingMessages={isLoadingMessages}
              isStreaming={isStreaming}
              onSendMessage={handleSendMessage}
              onStopStreaming={handleStopStreaming}
              onRetryLastMessage={handleRetryLastMessage}
            />
          )}
        </div>

        {/* 3. Placeholder Views for Other Modules */}
        {activeTab !== "home" && activeTab !== "chat" && (
          <ModulePlaceholderView
            activeTab={activeTab}
            onNavigateHome={() => setActiveTab("home")}
            onNavigatePlayground={() => setActiveTab("chat")}
          />
        )}
      </main>

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={(tab) => setActiveTab(tab as NavTabId)}
        onOpenSettings={handleOpenConfig}
        onOpenAgentBuilder={() => setActiveTab("agents")}
      />

      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        config={modelConfig}
        onSaveConfig={setModelConfig}
      />
    </div>
  );
}
