import React from "react";
import { Label } from "@/components/ui/label";
import { FileText } from "lucide-react";

interface SystemPromptEditorProps {
  systemPrompt: string;
  onSystemPromptChange: (val: string) => void;
}

/**
 * Supabase-styled system prompt editor with monospace typography and emerald focus states.
 */
export const SystemPromptEditor: React.FC<SystemPromptEditorProps> = ({
  systemPrompt,
  onSystemPromptChange,
}) => {
  return (
    <div className="p-5 bg-white border border-zinc-200/90 rounded-xl space-y-3.5 shadow-2xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-200/60">
            <FileText className="w-3.5 h-3.5" />
          </div>
          <Label className="text-xs font-semibold text-zinc-900 tracking-tight">
            5. Assistant System Prompt
          </Label>
        </div>
        <span className="text-[11px] font-mono text-zinc-400">
          Persistent context header
        </span>
      </div>

      <textarea
        rows={5}
        placeholder="e.g., You are an enterprise AI assistant specialized in software engineering and cloud architecture. Provide structured, production-ready solutions with clear explanations..."
        value={systemPrompt}
        onChange={(e) => onSystemPromptChange(e.target.value)}
        className="w-full px-3.5 py-3 text-xs font-mono text-zinc-900 placeholder:text-zinc-400 bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all shadow-2xs resize-y leading-relaxed"
      />
    </div>
  );
};
