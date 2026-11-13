"use client";

import React from "react";
import { AlertCircle, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { McpJsonError } from "@/types/mcp";

export interface McpFooterBarProps {
  isDirty: boolean;
  isSaving: boolean;
  jsonError: McpJsonError | null;
  issueCount: number;
  onRevert: () => void;
  onSave: () => void;
}

/**
 * Sticky card footer displaying unsaved modification state, validation summary badge,
 * and Discard / Save action buttons.
 */
export const McpFooterBar: React.FC<McpFooterBarProps> = ({
  isDirty,
  isSaving,
  jsonError,
  issueCount,
  onRevert,
  onSave,
}) => {
  const canSave = isDirty && !jsonError && issueCount === 0 && !isSaving;

  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-zinc-200 bg-zinc-50/80">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-zinc-500">
        <span className="inline-flex items-center">
          <span
            className={cn(
              "inline-block w-2 h-2 mr-2 rounded-full",
              isDirty ? "bg-amber-600" : "bg-emerald-600"
            )}
          />
          {isDirty ? "Unsaved changes" : "All changes saved"}
        </span>

        <span>
          {jsonError ? (
            <Badge className="h-[22px] px-2 gap-1.5 border-transparent bg-rose-50 text-rose-600 hover:bg-rose-50 font-medium text-xs shadow-none">
              <AlertCircle className="w-3 h-3 shrink-0" />
              <span>Invalid JSON</span>
            </Badge>
          ) : issueCount > 0 ? (
            <Badge className="h-[22px] px-2 gap-1.5 border-transparent bg-rose-50 text-rose-600 hover:bg-rose-50 font-medium text-xs shadow-none">
              <AlertCircle className="w-3 h-3 shrink-0" />
              <span>
                {issueCount}{" "}
                {issueCount === 1 ? "issue to fix" : "issues to fix"}
              </span>
            </Badge>
          ) : (
            <Badge className="h-[22px] px-2 gap-1.5 border-transparent bg-emerald-50 text-emerald-700 hover:bg-emerald-50 font-medium text-xs shadow-none">
              <Check className="w-3 h-3 shrink-0" />
              <span>Valid configuration</span>
            </Badge>
          )}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!isDirty || isSaving}
          onClick={onRevert}
          className="h-8 px-3 text-[13px] bg-white border-zinc-200 text-zinc-900 hover:bg-zinc-50 shadow-2xs"
        >
          Discard
        </Button>

        <Button
          type="button"
          size="sm"
          disabled={!canSave}
          onClick={onSave}
          className="h-8 px-3 text-[13px] bg-zinc-900 hover:bg-zinc-800 text-white shadow-2xs"
        >
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </div>
    </footer>
  );
};
