import React from "react";
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
      return <Code2 className="w-5 h-5 text-indigo-600" />;
    case "sparkles":
      return <Sparkles className="w-5 h-5 text-amber-500" />;
    case "cpu":
      return <Cpu className="w-5 h-5 text-emerald-600" />;
    case "zap":
      return <Zap className="w-5 h-5 text-yellow-500" />;
    case "brain":
      return <Brain className="w-5 h-5 text-rose-500" />;
    case "terminal":
      return <Terminal className="w-5 h-5 text-cyan-600" />;
    case "compass":
      return <Compass className="w-5 h-5 text-blue-500" />;
    default:
      return <Bot className="w-5 h-5 text-emerald-600" />;
  }
}

/**
 * Clean Supabase-style assistant card displaying persona, model attribution, and actions.
 */
export const AssistantCard: React.FC<AssistantCardProps> = ({
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
        "flex flex-col justify-between p-5 rounded-2xl border transition-all cursor-pointer bg-white group shadow-2xs",
        isSelected
          ? "border-emerald-500 bg-emerald-500/[0.02] ring-1 ring-emerald-500/30"
          : "border-zinc-200/90 hover:border-zinc-300 hover:shadow-xs",
      )}
    >
      <div>
        {/* Header: Icon, Name & Default Badge */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl border border-zinc-200 bg-zinc-50/80 shrink-0">
              {getAssistantIcon(assistant.avatar)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-zinc-900 truncate">
                  {assistant.name}
                </h3>
                {assistant.is_default && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-medium shrink-0">
                    <Star className="w-2.5 h-2.5 fill-emerald-600 text-emerald-600" />
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
        <p className="text-xs text-zinc-600 line-clamp-2 leading-relaxed mb-4">
          {assistant.description || assistant.system_prompt || "No custom instructions configured."}
        </p>
      </div>

      {/* Footer: Metadata Tags & Action Buttons */}
      <div className="pt-3 border-t border-zinc-100 flex items-center justify-between gap-2 mt-auto">
        <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
          <span>T: {assistant.temperature}</span>
          {assistant.tools && assistant.tools.length > 0 && (
            <span className="px-1.5 py-0.5 bg-zinc-100 rounded text-zinc-600">
              {assistant.tools.length} tools
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit?.(assistant)}
            title="Edit assistant"
            className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg"
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>

          {!assistant.is_default && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete?.(assistant)}
              title="Delete assistant"
              className="h-7 w-7 p-0 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}

          <Button
            size="sm"
            onClick={() => onChatWithAssistant?.(assistant)}
            className="h-7 px-3 bg-[#3ECF8E] hover:bg-[#34b27b] text-zinc-950 text-xs font-semibold rounded-lg gap-1.5 transition-all shadow-2xs ml-1"
          >
            <MessageSquare className="w-3 h-3 text-zinc-950" />
            <span>Chat</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
