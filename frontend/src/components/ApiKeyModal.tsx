'use client';

/**
 * ApiKeyModal component consolidating all Model Configurations (Provider, Model identifier,
 * Temperature, Max Tokens, System Prompt) and Provider API Keys / Custom Base URLs
 * into a single unified settings modal built on shadcn/ui primitives.
 */

import React, { useState, useEffect } from 'react';
import { PRESET_PROVIDERS, ModelConfigState } from '@/types/chat';
import { GenericModal } from '@/components/ui/generic-modal';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Cpu, Edit3, Key, Link, Server, Settings, Sliders } from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ModelConfigState;
  onSaveConfig: (newConfig: ModelConfigState) => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
}) => {
  // [State] Local form state for model hyperparameters and selection
  const [localConfig, setLocalConfig] = useState<ModelConfigState>(config);
  const [isCustomModelMode, setIsCustomModelMode] = useState(false);

  // [State] API Keys and custom base URL storage
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [customKey, setCustomKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');

  // [Lifecycle] Sync state whenever modal is opened
  useEffect(() => {
    if (isOpen) {
      setLocalConfig(config);
      if (typeof window !== 'undefined') {
        setOpenaiKey(localStorage.getItem('api_key_openai') || '');
        setAnthropicKey(localStorage.getItem('api_key_anthropic') || '');
        setGeminiKey(localStorage.getItem('api_key_gemini') || '');
        setCustomKey(localStorage.getItem('api_key_custom') || '');
        setBaseUrl(localStorage.getItem('base_url_custom') || '');
      }
    }
  }, [isOpen, config]);

  const currentProviderObj =
    PRESET_PROVIDERS.find(
      (p) => p.id.toLowerCase() === localConfig.providerId.toLowerCase()
    ) || PRESET_PROVIDERS[0];

  const suggestedModels = currentProviderObj.suggestedModels || [];

  const handleProviderChange = (newProviderId: string) => {
    const providerPreset =
      PRESET_PROVIDERS.find((p) => p.id === newProviderId) || PRESET_PROVIDERS[0];

    // [State Update] Set default model when changing provider
    setLocalConfig((prev) => ({
      ...prev,
      providerId: providerPreset.id,
      modelName: providerPreset.defaultModel,
    }));
  };

  const handleSaveAll = () => {
    // [Persistence] Save API Keys & Base URLs to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('api_key_openai', openaiKey);
      localStorage.setItem('api_key_anthropic', anthropicKey);
      localStorage.setItem('api_key_gemini', geminiKey);
      localStorage.setItem('api_key_custom', customKey);
      localStorage.setItem('base_url_custom', baseUrl);
    }

    // [State Update] Propagate model configuration upwards
    onSaveConfig(localConfig);
    onClose();
  };

  const modalFooter = (
    <div className="flex justify-end gap-2 w-full">
      <Button variant="outline" size="sm" onClick={onClose}>
        Cancel
      </Button>
      <Button
        size="sm"
        onClick={handleSaveAll}
        className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
      >
        Save Settings
      </Button>
    </div>
  );

  return (
    <GenericModal
      isOpen={isOpen}
      onClose={onClose}
      title="Platform Settings & Model Configuration"
      description="Configure model providers, hyperparameters, and local API keys in a single unified place."
      icon={<Settings className="w-5 h-5 text-indigo-600" />}
      footer={modalFooter}
      maxWidthClassName="max-w-xl"
    >
      <div className="space-y-4 text-xs max-h-[70vh] overflow-y-auto pr-1">
        {/* Section 1: Provider & Model Selection */}
        <div className="space-y-3 p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl">
          <div className="flex items-center gap-1.5 font-semibold text-zinc-900 text-xs pb-1 border-b border-zinc-200">
            <Server className="w-4 h-4 text-indigo-600" />
            <span>Active Model & Provider</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Provider Selection */}
            <div className="space-y-1.5">
              <Label className="font-semibold text-zinc-700">Provider</Label>
              <Select
                value={localConfig.providerId}
                onValueChange={handleProviderChange}
              >
                <SelectTrigger className="w-full">
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

            {/* Model Name Selection / Freeform Input */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label className="font-semibold text-zinc-700">Model Identifier</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsCustomModelMode(!isCustomModelMode)}
                  className="h-5 px-1.5 text-[10px] text-zinc-500 hover:text-zinc-900"
                >
                  <Edit3 className="w-3 h-3 mr-1" />
                  {isCustomModelMode ? 'Presets' : 'Custom'}
                </Button>
              </div>

              {isCustomModelMode ? (
                <input
                  type="text"
                  placeholder="e.g. gpt-4o, llama3..."
                  value={localConfig.modelName}
                  onChange={(e) =>
                    setLocalConfig((prev) => ({ ...prev, modelName: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-xs font-mono bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              ) : (
                <Select
                  value={localConfig.modelName}
                  onValueChange={(val) =>
                    setLocalConfig((prev) => ({ ...prev, modelName: val }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select Model" />
                  </SelectTrigger>
                  <SelectContent>
                    {suggestedModels.map((modelId) => (
                      <SelectItem key={modelId} value={modelId}>
                        {modelId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </div>

        {/* Section 2: Hyperparameters */}
        <div className="space-y-3.5 p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl">
          <div className="flex items-center gap-1.5 font-semibold text-zinc-900 text-xs pb-1 border-b border-zinc-200">
            <Sliders className="w-4 h-4 text-purple-600" />
            <span>Generation Hyperparameters</span>
          </div>

          {/* Temperature Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <Label htmlFor="modal-temperature" className="font-semibold text-zinc-700">
                Temperature: <span className="text-indigo-600 font-mono font-bold">{localConfig.temperature}</span>
              </Label>
              <span className="text-[10px] text-zinc-400">0.0 (Deterministic) - 2.0 (Creative)</span>
            </div>
            <Slider
              id="modal-temperature"
              min={0}
              max={2}
              step={0.05}
              value={[localConfig.temperature]}
              onValueChange={([val]) =>
                setLocalConfig((prev) => ({ ...prev, temperature: val }))
              }
              className="py-1"
            />
          </div>

          {/* Max Tokens & System Prompt */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-zinc-200/60">
            <div className="space-y-1">
              <Label htmlFor="modal-max-tokens" className="font-semibold text-zinc-700">
                Max Tokens
              </Label>
              <input
                id="modal-max-tokens"
                type="number"
                placeholder="Unlimited (model default)"
                value={localConfig.maxTokens ?? ''}
                onChange={(e) =>
                  setLocalConfig((prev) => ({
                    ...prev,
                    maxTokens: e.target.value ? parseInt(e.target.value, 10) : undefined,
                  }))
                }
                className="w-full px-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-sm"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="modal-system-prompt" className="font-semibold text-zinc-700">
                System Prompt / Instruction
              </Label>
              <input
                id="modal-system-prompt"
                type="text"
                placeholder="Optional system instruction..."
                value={localConfig.systemPrompt ?? ''}
                onChange={(e) =>
                  setLocalConfig((prev) => ({ ...prev, systemPrompt: e.target.value }))
                }
                className="w-full px-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-sm"
              />
            </div>
          </div>
        </div>

        {/* Section 3: API Keys & Endpoints */}
        <div className="space-y-3 p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl">
          <div className="flex items-center gap-1.5 font-semibold text-zinc-900 text-xs pb-1 border-b border-zinc-200">
            <Key className="w-4 h-4 text-amber-600" />
            <span>API Keys & Endpoints (Stored Locally)</span>
          </div>

          <div className="space-y-2.5">
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-zinc-700">OpenAI API Key</Label>
              <input
                type="password"
                placeholder="sk-..."
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-zinc-700">Anthropic Claude API Key</Label>
              <input
                type="password"
                placeholder="sk-ant-..."
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-zinc-700">Google Gemini API Key</Label>
              <input
                type="password"
                placeholder="AIzaSy..."
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div className="pt-2 border-t border-zinc-200/60 space-y-2">
              <Label className="text-[11px] font-medium text-zinc-700 flex items-center gap-1">
                <Link className="w-3.5 h-3.5 text-emerald-600" />
                Custom Provider Base URL (e.g. Ollama, vLLM)
              </Label>
              <input
                type="text"
                placeholder="http://localhost:11434/v1"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />

              <input
                type="password"
                placeholder="Custom Provider API Key (optional)"
                value={customKey}
                onChange={(e) => setCustomKey(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>
        </div>
      </div>
    </GenericModal>
  );
};
