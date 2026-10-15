import React, { memo } from "react";
import {
  Bot,
  Code2,
  Sparkles,
  Cpu,
  Zap,
  Brain,
  Compass,
  Terminal,
  MessageSquare,
  Pencil,
  Trash2,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AssistantCardProps } from "./types";

/**
 * Maps avatar string identifiers to Lucide React SVG components.
 */
function getAssistantIcon(avatar?: string | null) {
  switch (avatar?.toLowerCase()) {
    case "code":
    case "code2":
      return <Code2 className="w-4 h-4 text-zinc-800" />;
    case "sparkles":
      return <Sparkles className="w-4 h-4 text-zinc-800" />;
    case "cpu":
      return <Cpu className="w-4 h-4 text-zinc-800" />;
    case "zap":
      return <Zap className="w-4 h-4 text-zinc-800" />;
    case "brain":
      return <Brain className="w-4 h-4 text-zinc-800" />;
    case "terminal":
      return <Terminal className="w-4 h-4 text-zinc-800" />;
    case "compass":
      return <Compass className="w-4 h-4 text-zinc-800" />;
    default:
      return <Bot className="w-4 h-4 text-zinc-800" />;
  }
}

/**
 * Clean GitHub-styled assistant card displaying persona, model attribution, and actions.
 */
const BaseAssistantCard: React.FC<AssistantCardProps> = ({
  assistant,
  isSelected = false,
  onSelect,
  onEdit,
  onDelete,
  onChatWithAssistant,
}) => {
  return (
    <div
      onClick={() => onSelect?.(assistant)}
      className={cn(
        "flex flex-col justify-between p-4 rounded-lg border transition-colors cursor-pointer bg-white group",
        isSelected
          ? "border-zinc-900 ring-1 ring-zinc-900"
          : "border-zinc-200 hover:border-zinc-300",
      )}
    >
      <div>
        {/* Header: Icon, Name & Default Badge */}
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-md border border-zinc-200 bg-zinc-50 shrink-0">
              {getAssistantIcon(assistant.avatar)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-zinc-900 truncate">
                  {assistant.name}
                </h3>
                {assistant.is_default && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-zinc-100 text-zinc-800 border border-zinc-200 font-medium shrink-0">
                    <Star className="w-2.5 h-2.5 fill-zinc-800 text-zinc-800" />
                    Default
                  </span>
                )}
              </div>
              <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                {assistant.provider_id} / {assistant.model_name || "default model"}
              </p>
            </div>
          </div>
        </div>

        {/* Description & System Prompt Snippet */}
        <p className="text-xs text-zinc-600 line-clamp-2 leading-relaxed mb-3">
          {assistant.description || assistant.system_prompt || "No custom instructions configured."}
        </p>
      </div>

      {/* Footer: Metadata Tags & Action Buttons */}
      <div className="pt-2.5 border-t border-zinc-100 flex items-center justify-between gap-2 mt-auto">
        <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
          <span>T: {assistant.temperature}</span>
          {assistant.tools && assistant.tools.length > 0 && (
            <span className="px-1.5 py-0.2 bg-zinc-100 rounded text-zinc-600">
              {assistant.tools.length} tools
            </span>
          )}
        </div>

        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit?.(assistant)}
            title="Edit assistant"
            className="h-6 w-6 p-0 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md"
          >
            <Pencil className="w-3 h-3" />
          </Button>

          {!assistant.is_default && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete?.(assistant)}
              title="Delete assistant"
              className="h-6 w-6 p-0 text-zinc-400 hover:text-rose-600 hover:bg-zinc-100 rounded-md"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          )}

          <Button
            size="sm"
            onClick={() => onChatWithAssistant?.(assistant)}
            className="h-6 px-2.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium rounded-md gap-1 transition-colors ml-1"
          >
            <MessageSquare className="w-3 h-3 text-white" />
            <span>Chat</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

// [Performance] Memoize to localize re-renders to only the selected/deselected cards
export const AssistantCard = memo(BaseAssistantCard, (prev, next) => {
  return (
    prev.assistant.id === next.assistant.id &&
    prev.assistant.name === next.assistant.name &&
    prev.assistant.updated_at === next.assistant.updated_at &&
    prev.isSelected === next.isSelected
  );
});
