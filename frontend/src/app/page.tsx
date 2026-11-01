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
import { AgentConfigView } from "@/components/AgentConfigView";
import { Button } from "@/components/ui/button";
import { PRESET_PROVIDERS, ModelConfigState } from "@/types/chat";
import { Agent } from "@/types/agent";
import { useChatSession } from "@/hooks/useChatSession";
import { useAgents } from "@/hooks/useAgents";
import { AssistantsListView as AgentsListView, AssistantPickerModal as AgentPickerModal } from "@/components/assistants";
import {
  EngineSubBar,
  ChatPlaygroundView,
  ModulePlaceholderView,
} from "@/components/playground";

export default function EnterpriseAppPage() {
  const [activeTab, setActiveTab] = useState<NavTabId>("home");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isAgentPickerOpen, setIsAgentPickerOpen] = useState(false);
  const [chatViewMode, setChatViewMode] = useState<"playground" | "config">("playground");

  const [modelConfig, setModelConfig] = useState<ModelConfigState>({
    providerId: PRESET_PROVIDERS[0].id,
    modelName: PRESET_PROVIDERS[0].defaultModel,
    temperature: 0.7,
    availableModels: [],
  });

  // [Multi-Agent] Hook managing custom AI agents
  const handleSyncModelConfig = React.useCallback((cfg: Partial<ModelConfigState>) => {
    setModelConfig((prev) => ({
      ...prev,
      ...cfg,
    }));
  }, []);

  const {
    agents,
    activeAgent,
    agentToEdit,
    setAgentToEdit,
    isLoading: isLoadingAgents,
    selectAgent,
    selectAgentById,
    createAgent,
    updateAgent,
    deleteAgent,
  } = useAgents({
    onSyncModelConfig: handleSyncModelConfig,
  });

  const handleOpenConfigForNew = () => {
    setAgentToEdit(null);
    setActiveTab("chat");
    setChatViewMode("config");
  };

  const handleOpenConfigForEdit = (agent: Agent) => {
    setAgentToEdit(agent);
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
    handleSelectSession,
    handleNewSession,
    handleDeleteSession,
    handleSendMessage,
    handleStopStreaming,
    handleRetryLastMessage,
  } = useChatSession({
    modelConfig,
    activeAssistantId: activeAgent?.id,
    onSessionSelected: () => {
      setActiveTab("chat");
      setChatViewMode("playground");
    },
    onAssistantMatched: (matchedAgentId) => {
      selectAgentById(matchedAgentId);
    },
  });

  const handleChatWithAgent = (agent: Agent) => {
    selectAgent(agent);
    setActiveTab("chat");
    setChatViewMode("playground");
    handleNewSession(`Chat with ${agent.name}`, agent.id);
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
          onNewSession={() => handleNewSession("New Conversation", activeAgent?.id)}
          onDeleteSession={handleDeleteSession}
          isLoadingSessions={isLoadingSessions}
          onOpenSettings={handleOpenConfigForNew}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
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

        {/* 1. Dashboard View */}
        <div className={activeTab === "home" ? "flex-1 flex flex-col h-full overflow-hidden" : "hidden"}>
          <DashboardView
            onNavigate={(tab) => setActiveTab(tab)}
            onOpenAgentBuilder={() => setActiveTab("agents")}
            onOpenSettings={handleOpenConfigForNew}
            onLaunchAgentChat={() => {
              setActiveTab("chat");
              setChatViewMode("playground");
              handleNewSession("New Conversation", activeAgent?.id);
            }}
          />
        </div>

        {/* 2. Interactive Chat Playground / Agent Config View */}
        <div className={activeTab === "chat" ? "flex-1 flex flex-col h-full overflow-hidden bg-white" : "hidden"}>
          {chatViewMode === "config" ? (
            <AgentConfigView
              config={modelConfig}
              assistantToEdit={agentToEdit}
              onSaveConfig={handleUpdateModelConfig}
              onNavigateToPlayground={() => setChatViewMode("playground")}
              onCreateAssistant={createAgent}
              onUpdateAssistant={updateAgent}
            />
          ) : (
            <>
              <EngineSubBar
                modelConfig={modelConfig}
                onToggleViewMode={() => setChatViewMode("config")}
              />
              <ChatPlaygroundView
                messages={messages}
                isLoadingMessages={isLoadingMessages}
                isStreaming={isStreaming}
                onSendMessage={handleSendMessage}
                onStopStreaming={handleStopStreaming}
                onRetryLastMessage={handleRetryLastMessage}
                onOpenAssistantPicker={() => setIsAgentPickerOpen(true)}
                activeAssistantName={activeAgent?.name}
              />
            </>
          )}
        </div>

        {/* 3. Agents Catalog View */}
        <div className={activeTab === "agents" ? "flex-1 flex flex-col h-full overflow-hidden" : "hidden"}>
          <AgentsListView
            assistants={agents}
            activeAssistantId={activeAgent?.id}
            onSelectAssistant={selectAgent}
            onCreateAssistant={handleOpenConfigForNew}
            onEditAssistant={handleOpenConfigForEdit}
            onDeleteAssistant={(agent) => deleteAgent(agent.id)}
            onChatWithAssistant={handleChatWithAgent}
            isLoading={isLoadingAgents}
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

      <AgentPickerModal
        isOpen={isAgentPickerOpen}
        onClose={() => setIsAgentPickerOpen(false)}
        assistants={agents}
        activeAssistantId={activeAgent?.id}
        onSelectAssistant={(agent) => {
          selectAgent(agent);
          setIsAgentPickerOpen(false);
        }}
        onCreateNewAssistant={handleOpenConfigForNew}
      />
    </div>
  );
}
