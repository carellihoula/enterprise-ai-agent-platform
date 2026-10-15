import React from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, Plus, Trash2, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProviderDefinition } from "./types";

interface ModelListManagerProps {
  currentProviderDef: ProviderDefinition;
  currentModelList: string[];
  activeModel: string;
  newModelInput: string;
  setNewModelInput: (val: string) => void;
  onSetActiveModel: (modelName: string) => void;
  onAddModel: (e?: React.FormEvent) => void;
  onRemoveModel: (modelName: string) => void;
  onResetProviderModels: () => void;
}

/**
 * Supabase-inspired interactive model management with monospace chips,
 * emerald accent highlights, and clean card containment.
 */
export const ModelListManager: React.FC<ModelListManagerProps> = ({
  currentProviderDef,
  currentModelList,
  activeModel,
  newModelInput,
  setNewModelInput,
  onSetActiveModel,
  onAddModel,
  onRemoveModel,
  onResetProviderModels,
}) => {
  return (
    <div className="space-y-4 pb-6 border-b border-zinc-200">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs font-semibold text-zinc-900 tracking-tight">
            3. Models for {currentProviderDef.name} ({currentModelList.length})
          </Label>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Configure your active model catalog. Click any model to activate it.
          </p>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onResetProviderModels}
          title="Clear model list"
          className="text-[11px] font-mono text-zinc-400 hover:text-zinc-900 h-6 px-2 gap-1 rounded"
        >
          <RotateCcw className="w-3 h-3 text-zinc-400" />
          <span>Clear List</span>
        </Button>
      </div>

      {/* Add Model Input Bar */}
      <form onSubmit={onAddModel} className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Type a model ID (e.g. gpt-4o, gemini-2.5-flash, claude-3-5-sonnet)..."
          value={newModelInput}
          onChange={(e) => setNewModelInput(e.target.value)}
          className="flex-1 px-3 py-1.5 text-xs font-mono bg-white border border-zinc-300 rounded-md focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 transition-colors"
        />
        <Button
          type="submit"
          size="sm"
          className="bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-xs rounded-md gap-1.5 shrink-0 px-3 py-1.5 shadow-none transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Model</span>
        </Button>
      </form>

      {/* List of Models as Interactive Badges */}
      <div className="flex items-center gap-2 flex-wrap pt-1">
        {currentModelList.length === 0 ? (
          <div className="w-full py-4 px-3 text-center rounded-md border border-dashed border-zinc-300 bg-zinc-50/50 text-xs text-zinc-500 font-mono">
            No models configured for this provider yet. Type a model ID above and click &quot;Add Model&quot;.
          </div>
        ) : (
          currentModelList.map((modelName) => {
            const isActive = activeModel === modelName;
            return (
              <div
                key={modelName}
                onClick={() => onSetActiveModel(modelName)}
                className={cn(
                  "group flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs font-mono cursor-pointer transition-colors",
                  isActive
                    ? "border-zinc-900 ring-1 ring-zinc-900 bg-white text-zinc-900 font-medium"
                    : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50",
                )}
              >
                <span className="font-medium">{modelName}</span>

                {isActive && (
                  <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-800 border border-zinc-200">
                    Active
                  </span>
                )}

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveModel(modelName);
                  }}
                  title={`Remove ${modelName}`}
                  className={cn(
                    "p-0.5 rounded transition-colors",
                    isActive
                      ? "hover:bg-zinc-300 text-zinc-500 hover:text-zinc-900"
                      : "hover:bg-zinc-100 text-zinc-400 hover:text-rose-600",
                  )}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Active Model Indicator */}
      {currentModelList.length > 0 && activeModel && (
        <div className="pt-2 flex items-center justify-between text-xs text-zinc-500">
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-900" />
            <span>Active Model:</span>
            <strong className="text-zinc-900 font-mono font-medium">
              {activeModel}
            </strong>
          </span>
        </div>
      )}
    </div>
  );
};
