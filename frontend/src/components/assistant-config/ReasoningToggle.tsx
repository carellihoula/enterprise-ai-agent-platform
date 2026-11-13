import React from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Brain } from "lucide-react";

interface ReasoningToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

/**
 * Explicit toggle controlling whether native reasoning/thinking tokens are requested from the provider.
 */
export const ReasoningToggle: React.FC<ReasoningToggleProps> = ({
  enabled,
  onChange,
}) => {
  return (
    <div className="flex items-center justify-between gap-4 pb-6 border-b border-zinc-200">
      <div className="space-y-1">
        <Label
          htmlFor="enable-reasoning-toggle"
          className="text-xs font-semibold text-zinc-900 tracking-tight flex items-center gap-2 cursor-pointer"
        >
          <Brain className="w-3.5 h-3.5 text-zinc-600" />
          <span>Native Reasoning / Thinking Tokens</span>
        </Label>
        <p className="text-[11px] text-zinc-500">
          Enable only for reasoning-capable models to request provider thinking blocks without model-name heuristics.
        </p>
      </div>
      <Switch
        id="enable-reasoning-toggle"
        checked={enabled}
        onCheckedChange={onChange}
      />
    </div>
  );
};
