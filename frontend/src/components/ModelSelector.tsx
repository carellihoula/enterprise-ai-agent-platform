'use client';

/**
 * ModelSelector component offering model selection and freeform input for provider agnosticism,
 * alongside temperature and parameter configuration using shadcn/ui primitives.
 */

import React, { useState } from 'react';
import { PRESET_PROVIDERS, ModelConfigState } from '@/types/chat';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Cpu, Edit3, Key, Server, Sliders } from 'lucide-react';

interface ModelSelectorProps {
  config: ModelConfigState;
  onChangeConfig: (newConfig: ModelConfigState) => void;
  onOpenSettings?: () => void;
  disabled?: boolean;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  config,
  onChangeConfig,
  onOpenSettings,
  disabled = false,
}) => {
  const [isCustomInputMode, setIsCustomInputMode] = useState(false);
  const [showParameters, setShowParameters] = useState(false);

  // [Fallback] Default to first preset if provider is not found
  const currentProviderObj =
    PRESET_PROVIDERS.find(
      (p) => p.id.toLowerCase() === config.providerId.toLowerCase()
    ) || PRESET_PROVIDERS[0];

  const suggestedModels = currentProviderObj.suggestedModels || [];

  const handleProviderChange = (newProviderId: string) => {
    const providerPreset =
      PRESET_PROVIDERS.find((p) => p.id === newProviderId) || PRESET_PROVIDERS[0];

    // [State Update] Set default model when changing provider
    onChangeConfig({
      ...config,
      providerId: providerPreset.id,
      modelName: providerPreset.defaultModel,
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5 flex-wrap">
        {/* Provider Select Dropdown */}
        <div className="flex items-center gap-1.5">
          <div className="p-1.5 bg-zinc-100 border border-zinc-200 rounded-xl text-zinc-700 shadow-sm">
            <Server className="w-4 h-4 text-indigo-600" />
          </div>
          <Select
            value={config.providerId}
            onValueChange={handleProviderChange}
            disabled={disabled}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Select Provider" />
            </SelectTrigger>
            <SelectContent>
              {PRESET_PROVIDERS.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  {provider.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Model Selection: Dropdown OR Freeform Custom Input */}
        <div className="flex items-center gap-1.5">
          <div className="p-1.5 bg-zinc-100 border border-zinc-200 rounded-xl text-zinc-700 shadow-sm">
            <Cpu className="w-4 h-4 text-emerald-600" />
          </div>

          {isCustomInputMode ? (
            <input
              type="text"
              placeholder="Type any model ID (e.g. gpt-4o, gemini-1.5-flash)..."
              value={config.modelName}
              onChange={(e) => onChangeConfig({ ...config, modelName: e.target.value })}
              disabled={disabled}
              className="w-64 px-3 py-1.5 text-xs font-mono bg-white border border-emerald-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
            />
          ) : (
            <Select
              value={config.modelName}
              onValueChange={(val) => onChangeConfig({ ...config, modelName: val })}
              disabled={disabled || suggestedModels.length === 0}
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Select Model" />
              </SelectTrigger>
              <SelectContent>
                {suggestedModels.map((modelId) => (
                  <SelectItem key={modelId} value={modelId}>
                    <span className="font-semibold text-zinc-900">{modelId}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Toggle Mode Button: Select from presets vs Type custom string */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCustomInputMode(!isCustomInputMode)}
            disabled={disabled}
            title={isCustomInputMode ? 'Switch to preset dropdown' : 'Enter custom Model ID string'}
            className={`h-8 w-8 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 ${
              isCustomInputMode ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : ''
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Parameters Toggle Button */}
        <Button
          variant={showParameters ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setShowParameters(!showParameters)}
          disabled={disabled}
          className={`flex items-center gap-1.5 border-zinc-200 text-zinc-700 ${
            showParameters ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'hover:bg-zinc-100'
          }`}
          title="Configure Model Hyperparameters (Temperature, Max Tokens, System Prompt)"
        >
          <Sliders className="w-4 h-4 text-indigo-600" />
          <span className="hidden sm:inline">Parameters</span>
        </Button>

        {/* Configure Key / Endpoint Button */}
        {onOpenSettings && (
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenSettings}
            disabled={disabled}
            className="flex items-center gap-1.5 border-zinc-200 hover:bg-zinc-100 text-zinc-700"
            title="Configure API Keys & Custom Base URLs"
          >
            <Key className="w-4 h-4 text-amber-600" />
            <span className="hidden sm:inline">API Keys / Base URL</span>
          </Button>
        )}
      </div>

      {/* Expandable Parameters Drawer */}
      {showParameters && (
        <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl space-y-3.5 text-xs">
          {/* Temperature Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <Label htmlFor="temperature-slider" className="font-semibold text-zinc-700">
                Temperature: <span className="text-indigo-600 font-mono font-bold">{config.temperature}</span>
              </Label>
              <span className="text-[10px] text-zinc-400">0.0 (Deterministic) - 2.0 (Creative)</span>
            </div>
            <Slider
              id="temperature-slider"
              min={0}
              max={2}
              step={0.05}
              value={[config.temperature]}
              onValueChange={([val]) => onChangeConfig({ ...config, temperature: val })}
              disabled={disabled}
              className="py-1"
            />
          </div>

          {/* Max Tokens & System Prompt Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 border-t border-zinc-200/60">
            <div className="space-y-1">
              <Label htmlFor="max-tokens-input" className="font-semibold text-zinc-700">
                Max Tokens
              </Label>
              <input
                id="max-tokens-input"
                type="number"
                placeholder="Leave blank for model default"
                value={config.maxTokens ?? ''}
                onChange={(e) =>
                  onChangeConfig({
                    ...config,
                    maxTokens: e.target.value ? parseInt(e.target.value, 10) : undefined,
                  })
                }
                disabled={disabled}
                className="w-full px-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-sm"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="system-prompt-input" className="font-semibold text-zinc-700">
                System Prompt / Instruction
              </Label>
              <input
                id="system-prompt-input"
                type="text"
                placeholder="Optional system instructions..."
                value={config.systemPrompt ?? ''}
                onChange={(e) => onChangeConfig({ ...config, systemPrompt: e.target.value })}
                disabled={disabled}
                className="w-full px-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-sm"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
