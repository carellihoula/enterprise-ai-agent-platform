"use client";

/**
 * AssistantConfigView orchestrator component.
 * Unified view for creating and modifying AI assistants, configuring provider credentials,
 * dynamic model lists, generation temperature, and system instructions.
 */

import React from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Plus, Check, Loader2 } from "lucide-react";
import {
  SUPPORTED_PROVIDERS,
  AssistantConfigViewProps,
  ConfigHeader,
  AssistantIdentityEditor,
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
  assistantToEdit,
  onSaveConfig,
  onNavigateToPlayground,
  onCreateAssistant,
  onUpdateAssistant,
}) => {
  const {
    name,
    setName,
    description,
    setDescription,
    avatar,
    setAvatar,
    isDefault,
    setIsDefault,
    selectedProviderId,
    activeModel,
    temperature,
    systemPrompt,
    currentApiKey,
    setCurrentApiKey,
    currentBaseUrl,
    setCurrentBaseUrl,
    maskedKeys,
    hasApiKeys,
    currentProviderDef,
    currentModelList,
    newModelInput,
    isSubmitting,
    validationError,
    setTemperature,
    setSystemPrompt,
    setNewModelInput,
    setActiveModel,
    handleSelectProvider,
    handleAddModel,
    handleRemoveModel,
    handleResetProviderModels,
    handleSubmitAssistant,
  } = useAssistantConfig({
    config,
    assistantToEdit,
    onSaveConfig,
    onNavigateToPlayground,
    onCreateAssistant,
    onUpdateAssistant,
  });

  return (
    <div className="flex-1 overflow-y-auto bg-white p-4 sm:p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <ConfigHeader
          isEditing={!!assistantToEdit}
          assistantName={assistantToEdit?.name}
          onNavigateToPlayground={onNavigateToPlayground}
        />

        {validationError && (
          <Alert variant="destructive" className="py-2.5 px-4 text-xs font-medium">
            {validationError}
          </Alert>
        )}

        {/* 1. Assistant Identity: Name, Description, Avatar, Default flag */}
        <AssistantIdentityEditor
          name={name}
          setName={setName}
          description={description}
          setDescription={setDescription}
          avatar={avatar}
          setAvatar={setAvatar}
          isDefault={isDefault}
          setIsDefault={setIsDefault}
        />

        {/* 2. Provider Selection */}
        <ProviderSelector
          selectedProviderId={selectedProviderId}
          onSelectProvider={handleSelectProvider}
        />

        {/* 3. Provider Credentials */}
        <ProviderCredentials
          currentProviderDef={currentProviderDef}
          apiKey={currentApiKey}
          setApiKey={setCurrentApiKey}
          baseUrl={currentBaseUrl}
          setBaseUrl={setCurrentBaseUrl}
          maskedKey={maskedKeys[currentProviderDef.id]}
          hasApiKey={hasApiKeys[currentProviderDef.id]}
        />

        {/* 4. Model Catalog */}
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

        {/* 5. Temperature Hyperparameter */}
        <TemperatureSlider
          temperature={temperature}
          onTemperatureChange={setTemperature}
        />

        {/* 6. System Instructions */}
        <SystemPromptEditor
          systemPrompt={systemPrompt}
          onSystemPromptChange={setSystemPrompt}
        />

        {/* Bottom Actions Footer */}
        <div className="flex items-center justify-end gap-3 pt-3 pb-8">
          <Button
            variant="outline"
            size="sm"
            onClick={onNavigateToPlayground}
            className="text-xs rounded-xl border-zinc-200 text-zinc-600 hover:bg-zinc-50 shadow-2xs"
          >
            Annuler
          </Button>

          <Button
            size="sm"
            disabled={isSubmitting}
            onClick={handleSubmitAssistant}
            className="bg-[#3ECF8E] hover:bg-[#34b27b] text-zinc-950 text-xs rounded-xl font-semibold px-5 gap-2 shadow-xs transition-all"
          >
            {isSubmitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-950" />
            ) : assistantToEdit ? (
              <Check className="w-3.5 h-3.5 text-zinc-950" />
            ) : (
              <Plus className="w-3.5 h-3.5 text-zinc-950" />
            )}
            <span>
              {isSubmitting
                ? "Enregistrement..."
                : assistantToEdit
                ? "Modifier l'assistant"
                : "Créer l'assistant"}
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
};
