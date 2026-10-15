import React from "react";
import { Bot } from "lucide-react";
import { ModelConfigState } from "@/types/chat";
import { Assistant } from "@/types/assistant";

interface EngineSubBarProps {
  modelConfig: ModelConfigState;
  activeAssistant?: Assistant | null;
  chatViewMode: "playground" | "config";
  onToggleViewMode: () => void;
}

/**
 * Sub-bar displaying active assistant identity on the left and model engine status on the right.
 */
export const EngineSubBar: React.FC<EngineSubBarProps> = ({
  modelConfig,
  activeAssistant,
  chatViewMode,
  onToggleViewMode,
}) => {
  return (
    <div className="px-6 py-2.5 flex items-center justify-between shrink-0 border-b border-zinc-100 bg-zinc-50/40">
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-5 h-5 rounded-md bg-indigo-50 border border-indigo-200/60 text-indigo-600">
          <Bot className="w-3.5 h-3.5" />
        </div>
        <span className="text-xs font-semibold text-zinc-800">
          {activeAssistant?.name || "Assistant"}
        </span>
        {activeAssistant?.description && (
          <span className="text-[11px] text-zinc-600 max-w-sm truncate hidden md:inline">
            — {activeAssistant.description}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={onToggleViewMode}
          title="Click to view assistant configuration"
          className="text-[11px] text-zinc-600 bg-white hover:bg-zinc-100/80 px-2.5 py-1 rounded-lg border border-zinc-200 transition-colors flex items-center gap-1.5 shadow-2xs"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-zinc-400">Engine:</span>
          <span className="text-indigo-600 font-mono font-medium">
            {modelConfig.providerId} / {modelConfig.modelName}
          </span>
          <span className="text-zinc-400 font-mono text-[10px] ml-0.5">
            (T: {modelConfig.temperature})
          </span>
        </button>
      </div>
    </div>
  );
};
