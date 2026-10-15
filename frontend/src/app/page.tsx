"use client";

/**
 * Enterprise AI Agent Platform - Main Application Shell.
 * Orchestrator integrating global Header, Sidebar, Command Palette,
 * Dashboard, Multi-Assistant Catalog, and the conversational Agent Playground.
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
import { Assistant } from "@/types/assistant";
import { useChatSession } from "@/hooks/useChatSession";
import { useAssistants } from "@/hooks/useAssistants";
import { AssistantsListView, AssistantPickerModal } from "@/components/assistants";
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
  const [isAssistantPickerOpen, setIsAssistantPickerOpen] = useState(false);
  const [chatViewMode, setChatViewMode] = useState<"playground" | "config">("playground");

  const [modelConfig, setModelConfig] = useState<ModelConfigState>({
    providerId: PRESET_PROVIDERS[0].id,
    modelName: PRESET_PROVIDERS[0].defaultModel,
    temperature: 0.7,
    availableModels: [],
  });

  // [Multi-Assistant] Hook managing custom AI assistants
  const handleSyncModelConfig = React.useCallback((cfg: Partial<ModelConfigState>) => {
    setModelConfig((prev) => ({
      ...prev,
      ...cfg,
    }));
  }, []);

  const {
    assistants,
    activeAssistant,
    assistantToEdit,
    setAssistantToEdit,
    isLoading: isLoadingAssistants,
    selectAssistant,
    selectAssistantById,
    createAssistant,
    updateAssistant,
    deleteAssistant,
  } = useAssistants({
    onSyncModelConfig: handleSyncModelConfig,
  });


  const handleOpenConfigForNew = () => {
    setAssistantToEdit(null);
    setActiveTab("chat");
    setChatViewMode("config");
  };

  const handleOpenConfigForEdit = (assistant: Assistant) => {
    setAssistantToEdit(assistant);
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
    activeAssistantId: activeAssistant?.id,
    onSessionSelected: () => {
      setActiveTab("chat");
      setChatViewMode("playground");
    },
    onAssistantMatched: (matchedAssistantId) => {
      selectAssistantById(matchedAssistantId);
    },
  });

  const handleChatWithAssistant = (assistant: Assistant) => {
    selectAssistant(assistant);
    setActiveTab("chat");
    setChatViewMode("playground");
    handleNewSession(`Chat with ${assistant.name}`, assistant.id);
  };

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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-zinc-900 font-sans">
      {isSidebarOpen && (
        <Sidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={() => handleNewSession("New Conversation", activeAssistant?.id)}
          onDeleteSession={handleDeleteSession}
          isLoadingSessions={isLoadingSessions}
          onOpenSettings={handleOpenConfigForNew}
        />
      )}

      <main className="flex-1 flex flex-col h-full overflow-hidden bg-white relative">
        <Header
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          onOpenSettings={handleOpenConfigForNew}
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
            onOpenSettings={handleOpenConfigForNew}
            onLaunchAgentChat={() => {
              setActiveTab("chat");
              setChatViewMode("playground");
              handleNewSession("New Conversation", activeAssistant?.id);
            }}
          />
        </div>

        {/* 2. Interactive Chat Playground / Assistant Config View */}
        <div className={activeTab === "chat" ? "flex-1 flex flex-col h-full overflow-hidden bg-white" : "hidden"}>
          <EngineSubBar
            modelConfig={modelConfig}
            activeAssistant={activeAssistant}
            chatViewMode={chatViewMode}
            onToggleViewMode={() =>
              setChatViewMode(chatViewMode === "config" ? "playground" : "config")
            }
          />

          {chatViewMode === "config" ? (
            <AssistantConfigView
              config={modelConfig}
              assistantToEdit={assistantToEdit}
              onSaveConfig={handleUpdateModelConfig}
              onNavigateToPlayground={() => setChatViewMode("playground")}
              onCreateAssistant={createAssistant}
              onUpdateAssistant={updateAssistant}
            />
          ) : (
            <ChatPlaygroundView
              messages={messages}
              isLoadingMessages={isLoadingMessages}
              isStreaming={isStreaming}
              onSendMessage={handleSendMessage}
              onStopStreaming={handleStopStreaming}
              onRetryLastMessage={handleRetryLastMessage}
              onOpenAssistantPicker={() => setIsAssistantPickerOpen(true)}
              activeAssistantName={activeAssistant?.name}
            />
          )}
        </div>

        {/* 3. Assistants Catalog View */}
        <div className={activeTab === "agents" ? "flex-1 flex flex-col h-full overflow-hidden" : "hidden"}>
          <AssistantsListView
            assistants={assistants}
            activeAssistantId={activeAssistant?.id}
            onSelectAssistant={selectAssistant}
            onCreateAssistant={handleOpenConfigForNew}
            onEditAssistant={handleOpenConfigForEdit}
            onDeleteAssistant={deleteAssistant}
            onChatWithAssistant={handleChatWithAssistant}
            isLoading={isLoadingAssistants}
          />
        </div>

        {/* 4. Placeholder Views for Other Modules */}
        {activeTab !== "home" && activeTab !== "chat" && activeTab !== "agents" && (
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
        onOpenSettings={handleOpenConfigForNew}
        onOpenAgentBuilder={() => setActiveTab("agents")}
      />

      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        config={modelConfig}
        onSaveConfig={setModelConfig}
      />

      <AssistantPickerModal
        isOpen={isAssistantPickerOpen}
        onClose={() => setIsAssistantPickerOpen(false)}
        assistants={assistants}
        activeAssistantId={activeAssistant?.id}
        onSelectAssistant={(assistant) => {
          selectAssistant(assistant);
          setIsAssistantPickerOpen(false);
        }}
        onCreateNewAssistant={handleOpenConfigForNew}
      />
    </div>
  );
}
