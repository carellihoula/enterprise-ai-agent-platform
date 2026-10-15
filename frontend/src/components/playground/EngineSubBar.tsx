import React from "react";
import { ModelConfigState } from "@/types/chat";

interface EngineSubBarProps {
  modelConfig: ModelConfigState;
  onToggleViewMode: () => void;
}

/**
 * Minimalist model engine badge displayed at top of the chat playground.
 */
export const EngineSubBar: React.FC<EngineSubBarProps> = ({
  modelConfig,
  onToggleViewMode,
}) => {
  return (
    <div className="px-6 py-1.5 flex items-center justify-end shrink-0 bg-white">
      <button
        type="button"
        onClick={onToggleViewMode}
        title="Click to view assistant configuration"
        className="text-[11px] text-zinc-600 hover:text-zinc-900 bg-zinc-50 hover:bg-zinc-100 px-2.5 py-0.5 rounded-md border border-zinc-200 transition-colors flex items-center gap-1.5 shadow-none cursor-pointer"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-900" />
        <span className="text-zinc-400 font-sans">Engine:</span>
        <span className="text-zinc-900 font-mono font-medium">
          {modelConfig.providerId}{modelConfig.modelName ? ` / ${modelConfig.modelName}` : ""}
        </span>
      </button>
    </div>
  );
};
