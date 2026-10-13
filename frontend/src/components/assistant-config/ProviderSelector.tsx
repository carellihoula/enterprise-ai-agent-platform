import React from "react";
import { Label } from "@/components/ui/label";
import { Server, Sparkles, Cpu } from "lucide-react";
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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] font-mono font-semibold text-zinc-800 uppercase tracking-wider">
          1. Model Provider
        </Label>
        <span className="text-[11px] font-mono text-zinc-400">
          Native LangChain Connectors
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {SUPPORTED_PROVIDERS.map((prov) => {
          const isSelected = selectedProviderId === prov.id;
          return (
            <button
              key={prov.id}
              type="button"
              onClick={() => onSelectProvider(prov.id)}
              className={cn(
                "flex flex-col text-left p-4 rounded-xl border transition-all relative group bg-white",
                isSelected
                  ? "border-emerald-500 bg-emerald-500/[0.03] ring-1 ring-emerald-500/30 shadow-xs"
                  : "border-zinc-200/90 hover:border-zinc-300 hover:shadow-xs",
              )}
            >
              <div className="flex items-center justify-between w-full mb-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      "p-1.5 rounded-lg border transition-colors",
                      isSelected
                        ? "bg-emerald-500 text-zinc-950 border-emerald-500 shadow-2xs"
                        : "bg-white text-zinc-600 border-zinc-200 group-hover:border-zinc-300",
                    )}
                  >
                    {prov.id === "custom" ? (
                      <Server className="w-4 h-4" />
                    ) : prov.id === "gemini" ? (
                      <Sparkles className="w-4 h-4" />
                    ) : (
                      <Cpu className="w-4 h-4" />
                    )}
                  </div>
                  <span className="text-xs font-semibold text-zinc-900 tracking-tight">
                    {prov.name.split(" ")[0]}
                  </span>
                </div>

                {isSelected && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 ring-4 ring-emerald-100 shadow-[0_0_8px_rgba(62,207,142,0.6)]" />
                )}
              </div>

              <span className="text-[11px] font-mono text-zinc-500 line-clamp-1 mt-0.5">
                {prov.type === "builtin" ? "Direct SDK" : "OpenAI Gateway"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
