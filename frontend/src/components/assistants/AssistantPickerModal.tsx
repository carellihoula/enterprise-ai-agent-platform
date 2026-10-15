"use client";

import React, { useState, useMemo } from "react";
import {
  Search,
  Bot,
  Check,
  Plus,
  X,
  Sparkles,
  Code2,
  Zap,
  Brain,
  Terminal,
} from "lucide-react";
import { Assistant } from "@/types/assistant";
import { Button } from "@/components/ui/button";

export interface AssistantPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  assistants: Assistant[];
  activeAssistantId?: string | null;
  onSelectAssistant: (assistant: Assistant) => void;
  onCreateNewAssistant?: () => void;
}

/**
 * Returns matching icon component for an assistant avatar identifier.
 */
function getAssistantIcon(avatar?: string | null) {
  switch (avatar?.toLowerCase()) {
    case "code":
    case "code2":
      return <Code2 className="w-4 h-4 text-blue-600" />;
    case "sparkles":
      return <Sparkles className="w-4 h-4 text-amber-500" />;
    case "zap":
      return <Zap className="w-4 h-4 text-yellow-500" />;
    case "brain":
      return <Brain className="w-4 h-4 text-rose-500" />;
    case "terminal":
      return <Terminal className="w-4 h-4 text-cyan-600" />;
    default:
      return <Bot className="w-4 h-4 text-emerald-600" />;
  }
}

/**
 * Enterprise modal allowing users to search and select an AI assistant from the chat prompt bar.
 */
export const AssistantPickerModal: React.FC<AssistantPickerModalProps> = ({
  isOpen,
  onClose,
  assistants,
  activeAssistantId,
  onSelectAssistant,
  onCreateNewAssistant,
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredAssistants = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return assistants;
    return assistants.filter(
      (a) =>
        a.name.toLowerCase().includes(query) ||
        (a.description && a.description.toLowerCase().includes(query)) ||
        a.provider_id.toLowerCase().includes(query) ||
        a.model_name.toLowerCase().includes(query),
    );
  }, [assistants, searchQuery]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-zinc-200/90 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="p-5 border-b border-zinc-100 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200/60">
                <Sparkles className="w-4 h-4" />
              </div>
              <h2 className="text-base font-bold text-zinc-900 tracking-tight">
                Enterprise Assistant Selector
              </h2>
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Select the specialized AI assistant to drive this conversation.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Input Filter */}
        <div className="px-5 pt-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              autoFocus
              placeholder="Search by name, role, model, or provider..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 text-xs bg-zinc-50/80 border border-zinc-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 transition-all placeholder:text-zinc-400 font-sans"
            />
          </div>
        </div>

        {/* Assistants List */}
        <div className="flex-1 overflow-y-auto px-5 py-2 divide-y divide-zinc-50 space-y-1">
          {filteredAssistants.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-400">
              No assistants match your search query.
            </div>
          ) : (
            filteredAssistants.map((assistant) => {
              const isActive = assistant.id === activeAssistantId;
              return (
                <div
                  key={assistant.id}
                  onClick={() => {
                    onSelectAssistant(assistant);
                    onClose();
                  }}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 group mt-1.5 ${
                    isActive
                      ? "border-emerald-500/70 bg-emerald-50/30 ring-1 ring-emerald-500/20"
                      : "border-zinc-200/80 hover:border-zinc-300 hover:bg-zinc-50/60 shadow-2xs"
                  }`}
                >
                  <div className="p-2 rounded-xl bg-zinc-50 border border-zinc-200 shrink-0 mt-0.5">
                    {getAssistantIcon(assistant.avatar)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-zinc-900 truncate">
                          {assistant.name}
                        </span>
                        {isActive && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.2 rounded-full bg-emerald-100/70 text-emerald-800 border border-emerald-300/60">
                            <Check className="w-2.5 h-2.5" />
                            Active
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200/60 truncate max-w-[120px]">
                        {assistant.provider_id}/{assistant.model_name}
                      </span>
                    </div>

                    <p className="text-[11px] text-zinc-500 line-clamp-1 mt-1 leading-relaxed">
                      {assistant.description || assistant.system_prompt || "No custom instructions."}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-zinc-100 bg-zinc-50/60 flex items-center justify-between gap-3">
          {onCreateNewAssistant ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onCreateNewAssistant();
              }}
              className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create New Assistant</span>
            </button>
          ) : (
            <div />
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs rounded-xl border-zinc-200 text-zinc-600 hover:bg-white shadow-2xs"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
