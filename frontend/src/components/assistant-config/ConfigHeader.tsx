import React from "react";
import { Button } from "@/components/ui/button";
import { Sliders, MessageSquare, Check, Sparkles, Terminal } from "lucide-react";

interface ConfigHeaderProps {
  isSavedFeedback: boolean;
  onNavigateToPlayground: () => void;
  onSaveAndLaunch: () => void;
}

/**
 * Supabase-inspired header banner for Assistant Configuration with clean typography,
 * emerald accent indicators, and streamlined actions.
 */
export const ConfigHeader: React.FC<ConfigHeaderProps> = ({
  isSavedFeedback,
  onNavigateToPlayground,
  onSaveAndLaunch,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-zinc-200/80">
      <div>
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-600 shadow-2xs">
            <Sliders className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">
              Assistant Configuration
            </h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Runtime
            </span>
          </div>
        </div>
        <p className="text-xs text-zinc-500 mt-1.5 max-w-xl leading-relaxed">
          Manage AI providers, dynamic model catalogs, generation temperature,
          and system instructions with fine-grained parameter control.
        </p>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={onNavigateToPlayground}
          className="text-xs rounded-xl border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 gap-1.5 shadow-2xs"
        >
          <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
          <span>Open Playground</span>
        </Button>
        <Button
          size="sm"
          onClick={onSaveAndLaunch}
          className="bg-[#3ECF8E] hover:bg-[#34b27b] text-zinc-950 text-xs rounded-xl font-semibold shadow-xs gap-1.5 transition-all"
        >
          {isSavedFeedback ? (
            <>
              <Check className="w-3.5 h-3.5 text-zinc-950" />
              <span>Saved!</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 text-zinc-950" />
              <span>Save & Launch</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
