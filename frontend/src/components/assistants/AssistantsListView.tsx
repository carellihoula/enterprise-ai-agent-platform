import React from "react";
import { Plus, Bot, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AssistantCard } from "./AssistantCard";
import { AssistantsListViewProps } from "./types";

/**
 * Top-level view listing all user-configured AI Assistants in a Supabase-inspired dashboard.
 */
export const AssistantsListView: React.FC<AssistantsListViewProps> = ({
  assistants,
  activeAssistantId,
  onSelectAssistant,
  onCreateAssistant,
  onEditAssistant,
  onDeleteAssistant,
  onChatWithAssistant,
  isLoading = false,
}) => {
  return (
    <div className="flex-1 overflow-y-auto bg-white p-4 sm:p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Header Bar */}
        <div className="flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row pb-4 border-b border-zinc-100">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200/60">
                <Bot className="w-4 h-4" />
              </div>
              <h1 className="text-lg font-bold text-zinc-900 tracking-tight">
                AI Assistants Catalog
              </h1>
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Configure specialized personas, models, and system instructions for independent assistants.
            </p>
          </div>

          <Button
            size="sm"
            onClick={onCreateAssistant}
            className="bg-[#3ECF8E] hover:bg-[#34b27b] text-zinc-950 text-xs rounded-xl font-semibold px-4 gap-1.5 shadow-xs shrink-0"
          >
            <Plus className="w-3.5 h-3.5 text-zinc-950" />
            <span>Create Assistant</span>
          </Button>
        </div>

        {/* Content State: Loading, Empty, or Grid of Cards */}
        {isLoading ? (
          <div className="p-12 text-center text-xs text-zinc-400 font-mono">
            Loading assistants catalog...
          </div>
        ) : assistants.length === 0 ? (
          <div className="p-12 text-center border-2 border-dashed border-zinc-200 rounded-2xl space-y-3">
            <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center mx-auto text-zinc-400">
              <Bot className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-900">No Assistants Configured</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              Create your first specialized assistant to start chatting with tailored personas and instructions.
            </p>
            <Button
              size="sm"
              onClick={onCreateAssistant}
              className="bg-[#3ECF8E] hover:bg-[#34b27b] text-zinc-950 text-xs rounded-xl font-semibold px-4 gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 text-zinc-950" />
              <span>Create Assistant</span>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {assistants.map((ast) => (
              <AssistantCard
                key={ast.id}
                assistant={ast}
                isSelected={ast.id === activeAssistantId}
                onSelect={onSelectAssistant}
                onEdit={onEditAssistant}
                onDelete={onDeleteAssistant}
                onChatWithAssistant={onChatWithAssistant}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
