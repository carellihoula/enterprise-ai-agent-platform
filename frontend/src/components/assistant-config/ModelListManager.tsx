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
    <div className="p-5 bg-white border border-zinc-200/90 rounded-xl space-y-4 shadow-2xs">
      <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-200/60">
              <Cpu className="w-3.5 h-3.5" />
            </div>
            <Label className="text-xs font-semibold text-zinc-900 tracking-tight">
              3. Models for {currentProviderDef.name} ({currentModelList.length})
            </Label>
          </div>
          <p className="text-[11px] text-zinc-400 mt-1">
            Build your active model catalog. Click any model to activate it.
          </p>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onResetProviderModels}
          title="Clear model list"
          className="text-[11px] font-mono text-zinc-400 hover:text-zinc-900 h-7 px-2.5 gap-1.5 rounded-lg"
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
          className="flex-1 px-3.5 py-2 text-xs font-mono bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all shadow-2xs"
        />
        <Button
          type="submit"
          size="sm"
          className="bg-[#3ECF8E] hover:bg-[#34b27b] text-zinc-950 font-semibold text-xs rounded-lg gap-1.5 shrink-0 px-3.5 shadow-xs transition-all"
        >
          <Plus className="w-3.5 h-3.5 text-zinc-950" />
          <span>Add Model</span>
        </Button>
      </form>

      {/* List of Models as Interactive Badges */}
      <div className="flex items-center gap-2 flex-wrap pt-1">
        {currentModelList.length === 0 ? (
          <div className="w-full py-4 px-3 text-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 text-xs text-zinc-400 font-mono">
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
                  "group flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono cursor-pointer transition-all",
                  isActive
                    ? "bg-zinc-900 text-emerald-400 border-zinc-900 shadow-xs ring-1 ring-emerald-500/40"
                    : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/60",
                )}
              >
                <span className="font-semibold">{modelName}</span>

                {isActive && (
                  <Badge
                    variant="secondary"
                    className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] px-1.5 py-0 h-4 font-mono font-normal"
                  >
                    Active
                  </Badge>
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
                      ? "hover:bg-zinc-800 text-zinc-400 hover:text-rose-400"
                      : "hover:bg-zinc-100 text-zinc-300 hover:text-rose-600",
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
        <div className="pt-3 flex items-center justify-between text-xs text-zinc-500 border-t border-zinc-100">
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(62,207,142,0.6)]" />
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
