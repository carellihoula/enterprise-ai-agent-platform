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
        <div className="flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row pb-5 border-b border-zinc-200">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">
              Assistants Catalog
            </h1>
          </div>

          <Button
            size="sm"
            onClick={onCreateAssistant}
            className="bg-zinc-900 hover:bg-zinc-800 text-white text-xs rounded-md font-medium px-3.5 py-1.5 gap-1.5 shadow-none shrink-0 transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-white" />
            <span>Create Assistant</span>
          </Button>
        </div>

        {/* Content State: Loading, Empty, or Grid of Cards */}
        {isLoading ? (
          <div className="p-12 text-center text-xs text-zinc-400 font-mono">
            Loading assistants catalog...
          </div>
        ) : assistants.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-zinc-300 rounded-lg space-y-3">
            <div className="w-9 h-9 rounded-md bg-zinc-100 flex items-center justify-center mx-auto text-zinc-500">
              <Bot className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-semibold text-zinc-900">No Assistants Configured</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              Create your first specialized assistant to start chatting with tailored personas and instructions.
            </p>
            <Button
              size="sm"
              onClick={onCreateAssistant}
              className="bg-zinc-900 hover:bg-zinc-800 text-white text-xs rounded-md font-medium px-3.5 py-1.5 gap-1.5 shadow-none transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-white" />
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
