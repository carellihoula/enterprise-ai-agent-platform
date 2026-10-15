import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

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
    <div className="flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row pb-5 border-b border-zinc-200">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">
          {isEditing ? `Edit Assistant: ${assistantName || ""}` : "Create New Assistant"}
        </h1>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={onNavigateToPlayground}
        className="text-xs rounded-md border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 gap-1.5 shadow-none shrink-0"
      >
        <ArrowLeft className="w-3.5 h-3.5 text-zinc-400" />
        <span>Back to Assistants</span>
      </Button>
    </div>
  );
};
