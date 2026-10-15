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
    <div className="space-y-3 pb-6">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold text-zinc-900 tracking-tight">
          5. Assistant System Prompt
        </Label>
        <span className="text-[11px] font-mono text-zinc-400">
          Persistent context header
        </span>
      </div>

      <textarea
        rows={5}
        placeholder="e.g., You are an enterprise AI assistant specialized in software engineering and cloud architecture. Provide structured, production-ready solutions with clear explanations..."
        value={systemPrompt}
        onChange={(e) => onSystemPromptChange(e.target.value)}
        className="w-full px-3 py-2 text-xs font-mono text-zinc-900 placeholder:text-zinc-400 bg-white border border-zinc-300 rounded-md focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 transition-colors resize-y leading-relaxed"
      />
    </div>
  );
};
