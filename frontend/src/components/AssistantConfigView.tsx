"use client";

/**
 * AssistantConfigView orchestrator component.
 * Assembles modular sub-components for provider selection, credentials, dynamic model lists,
 * generation temperature (bounded 0 to 1), and system prompt configuration with a Supabase-inspired aesthetic.
 */

import React from "react";
import { Button } from "@/components/ui/button";
import { Check, MessageSquare } from "lucide-react";
import {
  SUPPORTED_PROVIDERS,
  AssistantConfigViewProps,
  ConfigHeader,
  ProviderSelector,
  ProviderCredentials,
  ModelListManager,
  TemperatureSlider,
  SystemPromptEditor,
} from "./assistant-config";
import { useAssistantConfig } from "./assistant-config/useAssistantConfig";

export { SUPPORTED_PROVIDERS };
export type { ProviderDefinition } from "./assistant-config";

export const AssistantConfigView: React.FC<AssistantConfigViewProps> = ({
  config,
  onSaveConfig,
  onNavigateToPlayground,
}) => {
  const {
    selectedProviderId,
    activeModel,
    temperature,
    systemPrompt,
    apiKeyGemini,
    apiKeyOpenai,
    apiKeyAnthropic,
    apiKeyCustom,
    baseUrlCustom,
    currentProviderDef,
    currentModelList,
    newModelInput,
    isSavedFeedback,
    setTemperature,
    setSystemPrompt,
    setApiKeyGemini,
    setApiKeyOpenai,
    setApiKeyAnthropic,
    setApiKeyCustom,
    setBaseUrlCustom,
    setNewModelInput,
    setActiveModel,
    handleSelectProvider,
    handleAddModel,
    handleRemoveModel,
    handleResetProviderModels,
    handleSaveAll,
    handleSaveAndLaunch,
  } = useAssistantConfig({
    config,
    onSaveConfig,
    onNavigateToPlayground,
  });

  return (
    <div className="flex-1 overflow-y-auto bg-white p-4 sm:p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <ConfigHeader
          isSavedFeedback={isSavedFeedback}
          onNavigateToPlayground={onNavigateToPlayground}
          onSaveAndLaunch={handleSaveAndLaunch}
        />

        <ProviderSelector
          selectedProviderId={selectedProviderId}
          onSelectProvider={handleSelectProvider}
        />

        <ProviderCredentials
          currentProviderDef={currentProviderDef}
          apiKeyGemini={apiKeyGemini}
          setApiKeyGemini={setApiKeyGemini}
          apiKeyOpenai={apiKeyOpenai}
          setApiKeyOpenai={setApiKeyOpenai}
          apiKeyAnthropic={apiKeyAnthropic}
          setApiKeyAnthropic={setApiKeyAnthropic}
          apiKeyCustom={apiKeyCustom}
          setApiKeyCustom={setApiKeyCustom}
          baseUrlCustom={baseUrlCustom}
          setBaseUrlCustom={setBaseUrlCustom}
        />

        <ModelListManager
          currentProviderDef={currentProviderDef}
          currentModelList={currentModelList}
          activeModel={activeModel}
          newModelInput={newModelInput}
          setNewModelInput={setNewModelInput}
          onSetActiveModel={setActiveModel}
          onAddModel={handleAddModel}
          onRemoveModel={handleRemoveModel}
          onResetProviderModels={handleResetProviderModels}
        />

        <TemperatureSlider
          temperature={temperature}
          onTemperatureChange={setTemperature}
        />

        <SystemPromptEditor
          systemPrompt={systemPrompt}
          onSystemPromptChange={setSystemPrompt}
        />

        {/* Bottom Save & Actions Footer */}
        <div className="flex items-center justify-end gap-3 pt-3 pb-8">
          <Button
            variant="outline"
            size="sm"
            onClick={onNavigateToPlayground}
            className="text-xs rounded-xl border-zinc-200 text-zinc-600 hover:bg-zinc-50 shadow-2xs"
          >
            Cancel
          </Button>

          <Button
            size="sm"
            onClick={handleSaveAll}
            className="bg-[#3ECF8E] hover:bg-[#34b27b] text-zinc-950 text-xs rounded-xl font-semibold px-4 gap-1.5 shadow-xs transition-all"
          >
            <Check className="w-3.5 h-3.5 text-zinc-950" />
            <span>{isSavedFeedback ? "Configuration Saved" : "Save Configuration"}</span>
          </Button>

          <Button
            size="sm"
            onClick={handleSaveAndLaunch}
            className="bg-zinc-900 hover:bg-zinc-800 text-white text-xs rounded-xl font-medium px-4 gap-1.5 shadow-xs transition-all"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Go to Playground</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
