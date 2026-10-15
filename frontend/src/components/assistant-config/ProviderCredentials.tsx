import React from "react";
import { Label } from "@/components/ui/label";
import { Key, Link, Shield, CheckCircle2 } from "lucide-react";
import { ProviderDefinition } from "./types";

interface ProviderCredentialsProps {
  currentProviderDef: ProviderDefinition;
  apiKey: string;
  setApiKey: (val: string) => void;
  baseUrl?: string;
  setBaseUrl?: (val: string) => void;
  maskedKey?: string;
  hasApiKey?: boolean;
}

/**
 * Returns a recognizable API key placeholder according to the selected provider.
 */
function getApiKeyPlaceholder(
  providerId: string,
  hasApiKey: boolean,
  maskedKey?: string,
): string {
  if (hasApiKey) {
    return `•••••••• (${maskedKey || "Key encrypted in database"})`;
  }
  switch (providerId) {
    case "gemini":
      return "AIzaSy...";
    case "openai":
      return "sk-proj-...";
    case "anthropic":
      return "sk-ant-...";
    case "mistral":
      return "mistral-api-key...";
    case "groq":
      return "gsk_...";
    case "openrouter":
      return "sk-or-v1-...";
    default:
      return "sk-... (Optional for local Ollama, required for hosted gateways)";
  }
}

/**
 * Supabase-inspired credentials panel with clean white card backgrounds,
 * emerald input focus rings, and clear security attribution (Fernet AES-256 DB encryption).
 */
export const ProviderCredentials: React.FC<ProviderCredentialsProps> = ({
  currentProviderDef,
  apiKey,
  setApiKey,
  baseUrl = "",
  setBaseUrl,
  maskedKey,
  hasApiKey = false,
}) => {
  const isCustomEndpoint =
    currentProviderDef.id === "custom" || currentProviderDef.id === "openrouter";

  return (
    <div className="p-5 bg-white border border-zinc-200/90 rounded-xl space-y-4 shadow-2xs">
      <div className="flex items-center justify-between pb-3 border-b border-zinc-100 flex-wrap gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900">
          <div className="p-1 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-200/60">
            <Key className="w-3.5 h-3.5" />
          </div>
          <span>Connection Credentials: {currentProviderDef.name}</span>
        </div>

        {hasApiKey ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-600 bg-emerald-50/80 px-2 py-0.5 rounded-full border border-emerald-200/60">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>Encrypted in DB ({maskedKey || "Saved"})</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-zinc-400">
            <Shield className="w-3 h-3 text-zinc-400" />
            <span>AES-256 Encrypted on Save</span>
          </span>
        )}
      </div>

      <div className={isCustomEndpoint ? "grid grid-cols-1 md:grid-cols-2 gap-4" : "space-y-1.5"}>
        {isCustomEndpoint && setBaseUrl && (
          <div className="space-y-1.5">
            <Label className="text-[11px] font-mono font-medium text-zinc-700 flex items-center gap-1.5">
              <Link className="w-3 h-3 text-emerald-500" />
              <span>Base URL Endpoint</span>
            </Label>
            <input
              type="text"
              placeholder={
                currentProviderDef.id === "openrouter"
                  ? "https://openrouter.ai/api/v1"
                  : "http://localhost:11434/v1"
              }
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full px-3.5 py-2 text-xs font-mono bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all shadow-2xs"
            />
            <p className="text-[11px] text-zinc-400">
              {currentProviderDef.id === "openrouter"
                ? "Default: https://openrouter.ai/api/v1"
                : "Examples: Ollama (http://localhost:11434/v1), vLLM, or custom proxy."}
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-[11px] font-mono font-medium text-zinc-700">
            {currentProviderDef.name} API Key
          </Label>
          <input
            type="password"
            placeholder={getApiKeyPlaceholder(currentProviderDef.id, hasApiKey, maskedKey)}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full px-3.5 py-2 text-xs font-mono bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all shadow-2xs"
          />
          <p className="text-[11px] text-zinc-400">
            {hasApiKey
              ? "Key is stored encrypted in database. Type a new key to update, or leave empty to keep existing."
              : "API key will be encrypted and saved in your database."}
          </p>
        </div>
      </div>
    </div>
  );
};
