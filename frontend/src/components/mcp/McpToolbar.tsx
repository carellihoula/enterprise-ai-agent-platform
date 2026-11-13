"use client";

import React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { McpServerFormState } from "@/types/mcp";

export interface McpToolbarProps {
  servers: McpServerFormState[];
  onToggleCollapseAll: () => void;
  onAddServer: () => void;
}

/**
 * Toolbar rendered at the top of the Form panel showing server counts,
 * collapse/expand all toggle, and add server action button.
 */
export const McpToolbar: React.FC<McpToolbarProps> = ({
  servers,
  onToggleCollapseAll,
  onAddServer,
}) => {
  const totalCount = servers.length;
  const activeCount = servers.filter((s) => !s.disabled).length;
  const anyOpen = servers.some((s) => s.open);

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2.5 border-b border-zinc-200 bg-zinc-50/80">
      <span className="text-[13px] text-zinc-500">
        {totalCount} {totalCount === 1 ? "server" : "servers"} · {activeCount}{" "}
        {activeCount === 1 ? "active" : "active"}
      </span>

      <div className="flex items-center gap-1.5">
        {totalCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onToggleCollapseAll}
            className="h-7 px-2.5 text-xs text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900"
          >
            {anyOpen ? "Collapse all" : "Expand all"}
          </Button>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAddServer}
          className="h-7 px-2.5 text-xs gap-1.5 bg-white border-zinc-200 text-zinc-900 hover:bg-zinc-50 shadow-2xs"
        >
          <Plus className="w-3.5 h-3.5 shrink-0" />
          <span>Add server</span>
        </Button>
      </div>
    </div>
  );
};
