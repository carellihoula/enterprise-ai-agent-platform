import React from "react";
import { Label } from "@/components/ui/label";
import { Key, Link, Shield } from "lucide-react";
import { ProviderDefinition } from "./types";

interface ProviderCredentialsProps {
  currentProviderDef: ProviderDefinition;
  apiKeyGemini: string;
  setApiKeyGemini: (val: string) => void;
  apiKeyOpenai: string;
  setApiKeyOpenai: (val: string) => void;
  apiKeyAnthropic: string;
  setApiKeyAnthropic: (val: string) => void;
  apiKeyCustom: string;
  setApiKeyCustom: (val: string) => void;
  baseUrlCustom: string;
  setBaseUrlCustom: (val: string) => void;
}

/**
 * Supabase-inspired credentials panel with clean white card backgrounds,
 * emerald input focus rings, and clear security attribution.
 */
export const ProviderCredentials: React.FC<ProviderCredentialsProps> = ({
  currentProviderDef,
  apiKeyGemini,
  setApiKeyGemini,
  apiKeyOpenai,
  setApiKeyOpenai,
  apiKeyAnthropic,
  setApiKeyAnthropic,
  apiKeyCustom,
  setApiKeyCustom,
  baseUrlCustom,
  setBaseUrlCustom,
}) => {
  return (
    <div className="p-5 bg-white border border-zinc-200/90 rounded-xl space-y-4 shadow-2xs">
      <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900">
          <div className="p-1 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-200/60">
            <Key className="w-3.5 h-3.5" />
          </div>
          <span>Connection Credentials: {currentProviderDef.name}</span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-zinc-400">
          <Shield className="w-3 h-3 text-emerald-500" />
          Browser Client Storage
        </span>
      </div>

      {currentProviderDef.id === "gemini" && (
        <div className="space-y-1.5">
          <Label className="text-[11px] font-mono font-medium text-zinc-700">
            Google Gemini API Key
          </Label>
          <input
            type="password"
            placeholder="AIzaSy..."
            value={apiKeyGemini}
            onChange={(e) => setApiKeyGemini(e.target.value)}
            className="w-full px-3.5 py-2 text-xs font-mono bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all shadow-2xs"
          />
          <p className="text-[11px] text-zinc-400">
            API key used to query Google Gemini models directly via LangChain.
          </p>
        </div>
      )}

      {currentProviderDef.id === "openai" && (
        <div className="space-y-1.5">
          <Label className="text-[11px] font-mono font-medium text-zinc-700">
            OpenAI API Key
          </Label>
          <input
            type="password"
            placeholder="sk-proj-..."
            value={apiKeyOpenai}
            onChange={(e) => setApiKeyOpenai(e.target.value)}
            className="w-full px-3.5 py-2 text-xs font-mono bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all shadow-2xs"
          />
          <p className="text-[11px] text-zinc-400">
            Official OpenAI API key for GPT-6 Astra, GPT-6.1 Sol, GPT-5.6, GPT-4o, etc.
          </p>
        </div>
      )}

      {currentProviderDef.id === "anthropic" && (
        <div className="space-y-1.5">
          <Label className="text-[11px] font-mono font-medium text-zinc-700">
            Anthropic Claude API Key
          </Label>
          <input
            type="password"
            placeholder="sk-ant-..."
            value={apiKeyAnthropic}
            onChange={(e) => setApiKeyAnthropic(e.target.value)}
            className="w-full px-3.5 py-2 text-xs font-mono bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all shadow-2xs"
          />
          <p className="text-[11px] text-zinc-400">
            Official Anthropic API key for Claude Fable 5.1, Claude Opus 5.5, Claude Sonnet 5.5, etc.
          </p>
        </div>
      )}

      {currentProviderDef.id === "custom" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-mono font-medium text-zinc-700 flex items-center gap-1.5">
              <Link className="w-3 h-3 text-emerald-500" />
              <span>OpenAI-Compatible Base URL</span>
            </Label>
            <input
              type="text"
              placeholder="http://localhost:11434/v1 or https://api.groq.com/openai/v1"
              value={baseUrlCustom}
              onChange={(e) => setBaseUrlCustom(e.target.value)}
              className="w-full px-3.5 py-2 text-xs font-mono bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all shadow-2xs"
            />
            <p className="text-[11px] text-zinc-400">
              Examples: Ollama (`http://localhost:11434/v1`), vLLM, Groq, OpenRouter.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] font-mono font-medium text-zinc-700">
              Custom Provider API Key (optional)
            </Label>
            <input
              type="password"
              placeholder="gsk_... or custom gateway token"
              value={apiKeyCustom}
              onChange={(e) => setApiKeyCustom(e.target.value)}
              className="w-full px-3.5 py-2 text-xs font-mono bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all shadow-2xs"
            />
            <p className="text-[11px] text-zinc-400">
              Optional for local Ollama, required for hosted gateways like Groq or OpenRouter.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
