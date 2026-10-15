import React from "react";
import { Label } from "@/components/ui/label";
import { Server, Sparkles, Cpu, Zap, Flame, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProviderDefinition, SUPPORTED_PROVIDERS } from "./types";

interface ProviderSelectorProps {
  selectedProviderId: string;
  onSelectProvider: (providerId: string) => void;
}

/**
 * Supabase-inspired provider selection cards with crisp white surfaces,
 * emerald highlight accents, and clean technical metadata tags.
 */
export const ProviderSelector: React.FC<ProviderSelectorProps> = ({
  selectedProviderId,
  onSelectProvider,
}) => {
  return (
    <div className="space-y-3 pb-6 border-b border-zinc-200">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold text-zinc-900">
          1. Model Provider
        </Label>
        <span className="text-[11px] font-mono text-zinc-400">
          Native LangChain Connectors
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {SUPPORTED_PROVIDERS.map((prov) => {
          const isSelected = selectedProviderId === prov.id;
          return (
            <button
              key={prov.id}
              type="button"
              onClick={() => onSelectProvider(prov.id)}
              className={cn(
                "flex flex-col text-left p-3 rounded-md border transition-colors relative group cursor-pointer bg-white",
                isSelected
                  ? "border-zinc-900 ring-1 ring-zinc-900 text-zinc-900 font-medium"
                  : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/60 text-zinc-700",
              )}
            >
              <div className="flex items-center justify-between w-full mb-1.5">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "p-1 rounded border transition-colors",
                      isSelected
                        ? "bg-white text-zinc-900 border-zinc-300 shadow-xs"
                        : "bg-zinc-100 text-zinc-700 border-zinc-200 group-hover:border-zinc-300",
                    )}
                  >
                    {prov.id === "custom" ? (
                      <Server className="w-3.5 h-3.5" />
                    ) : prov.id === "gemini" ? (
                      <Sparkles className="w-3.5 h-3.5" />
                    ) : prov.id === "groq" ? (
                      <Zap className="w-3.5 h-3.5" />
                    ) : prov.id === "mistral" ? (
                      <Flame className="w-3.5 h-3.5" />
                    ) : prov.id === "openrouter" ? (
                      <Globe className="w-3.5 h-3.5" />
                    ) : (
                      <Cpu className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <span className="text-xs font-medium tracking-tight">
                    {prov.name.split(" ")[0]}
                  </span>
                </div>

                {isSelected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-900" />
                )}
              </div>

              <span className={cn(
                "text-[10px] font-mono line-clamp-1",
                isSelected ? "text-zinc-600" : "text-zinc-400"
              )}>
                {prov.type === "builtin" ? "Direct SDK" : "Gateway"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
