import React from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReasoningEffort } from "@/types/agent";
import { Brain } from "lucide-react";

interface ReasoningToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  effort: ReasoningEffort;
  onEffortChange: (effort: ReasoningEffort) => void;
}

/**
 * Explicit toggle and default effort selector controlling native reasoning/thinking tokens.
 */
export const ReasoningToggle: React.FC<ReasoningToggleProps> = ({
  enabled,
  onChange,
  effort,
  onEffortChange,
}) => {
  return (
    <div className="space-y-4 pb-6 border-b border-zinc-200">
      <div className="flex items-center justify-between gap-4">
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

      {enabled && (
        <div className="flex items-center justify-between gap-4 pt-1">
          <div className="space-y-0.5">
            <Label className="text-xs font-medium text-zinc-800">
              Default Reasoning Effort
            </Label>
            <p className="text-[11px] text-zinc-500">
              Default thinking depth used in conversations (can be overridden per message).
            </p>
          </div>
          <Select
            value={effort}
            onValueChange={(val) => onEffortChange(val as ReasoningEffort)}
          >
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
};
