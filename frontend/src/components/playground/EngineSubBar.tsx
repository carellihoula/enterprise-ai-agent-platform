import React from "react";
import { ModelConfigState } from "@/types/chat";

interface EngineSubBarProps {
  modelConfig: ModelConfigState;
  chatViewMode: "playground" | "config";
  onToggleViewMode: () => void;
}

/**
 * Sub-bar displaying active model engine badge and toggling configuration view.
 */
export const EngineSubBar: React.FC<EngineSubBarProps> = ({
  modelConfig,
  chatViewMode,
  onToggleViewMode,
}) => {
  return (
    <div className="px-6 py-2.5 flex items-center justify-end shrink-0">
      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={onToggleViewMode}
          title="Click to toggle assistant configuration"
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
