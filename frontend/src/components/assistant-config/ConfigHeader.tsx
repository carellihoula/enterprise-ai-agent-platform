import React from "react";
import { Button } from "@/components/ui/button";
import { Bot, ArrowLeft } from "lucide-react";

interface ConfigHeaderProps {
  isEditing?: boolean;
  assistantName?: string;
  onNavigateToPlayground: () => void;
}

/**
 * Header banner for Assistant Configuration with title, mode indicator, and return action.
 */
export const ConfigHeader: React.FC<ConfigHeaderProps> = ({
  isEditing = false,
  assistantName,
  onNavigateToPlayground,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-zinc-200/80">
      <div>
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-50 border border-indigo-200/60 rounded-xl text-indigo-600 shadow-2xs">
            <Bot className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">
              {isEditing ? `Edit Assistant: ${assistantName || ""}` : "Create New Assistant"}
            </h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {isEditing ? "Modify" : "New"}
            </span>
          </div>
        </div>
        <p className="text-xs text-zinc-500 mt-1.5 max-w-xl leading-relaxed">
          {isEditing
            ? "Update assistant identity, LLM provider, models, temperature, and system prompt."
            : "Define a specialized assistant with custom persona instructions, model provider, and hyperparameters."}
        </p>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={onNavigateToPlayground}
          className="text-xs rounded-xl border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 gap-1.5 shadow-2xs"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-zinc-400" />
          <span>Back to Assistants</span>
        </Button>
      </div>
    </div>
  );
};
