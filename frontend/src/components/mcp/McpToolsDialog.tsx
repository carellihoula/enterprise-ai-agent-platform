"use client";

import React, { useMemo, useState } from "react";
import { Search, Wrench } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { McpToolInfo } from "@/types/mcp";

export interface McpToolsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverName: string;
  tools: McpToolInfo[];
  latencyMs?: number;
}

/**
 * Searchable modal dialog displaying all tools discovered from a connected MCP server.
 */
export const McpToolsDialog: React.FC<McpToolsDialogProps> = ({
  open,
  onOpenChange,
  serverName,
  tools,
  latencyMs,
}) => {
  const [query, setQuery] = useState("");

  const filteredTools = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q)
    );
  }, [tools, query]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setQuery("");
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden sm:rounded-xl">
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-zinc-200 bg-zinc-50/60">
          <div className="flex items-center gap-2.5 pr-6">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-700 shrink-0">
              <Wrench className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 text-base font-semibold text-zinc-900">
                <span className="font-mono truncate">{serverName}</span>
                <Badge className="h-5 px-2 border-transparent bg-emerald-50 text-emerald-700 hover:bg-emerald-50 font-medium text-xs shadow-none">
                  {tools.length} {tools.length === 1 ? "tool" : "tools"}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-500 mt-0.5">
                Available tools discovered during MCP handshake
                {latencyMs !== undefined ? ` (${latencyMs} ms)` : ""}.
              </DialogDescription>
            </div>
          </div>

          {tools.length > 0 && (
            <div className="relative mt-3">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter tools by name or description..."
                className="h-8 pl-8 text-xs bg-white"
                autoFocus
              />
            </div>
          )}
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto divide-y divide-zinc-100 bg-white">
          {filteredTools.length === 0 ? (
            <div className="py-12 px-6 text-center text-xs text-zinc-500">
              {tools.length === 0
                ? "This MCP server did not advertise any tools."
                : `No tools match "${query}".`}
            </div>
          ) : (
            filteredTools.map((tool) => (
              <div
                key={tool.name}
                className="px-5 py-3 hover:bg-zinc-50/80 transition-colors"
              >
                <div className="font-mono text-[13px] font-medium text-zinc-900">
                  {tool.name}
                </div>
                {tool.description && (
                  <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
                    {tool.description}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
