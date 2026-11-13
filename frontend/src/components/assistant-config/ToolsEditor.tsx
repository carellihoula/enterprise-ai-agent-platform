"use client";

import React, { useEffect, useState } from "react";
import { Check, Cpu, Loader2, Plus, Server, Trash2, Wrench } from "lucide-react";
import {
  BuiltinToolDescriptor,
  fetchBuiltinTools,
  fetchMcpConfig,
} from "@/lib/api";
import { McpServerDto } from "@/types/mcp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ToolsEditorProps {
  tools: Array<Record<string, unknown>>;
  onChange: (tools: Array<Record<string, unknown>>) => void;
}

export const ToolsEditor: React.FC<ToolsEditorProps> = ({ tools, onChange }) => {
  const [builtinCatalog, setBuiltinCatalog] = useState<BuiltinToolDescriptor[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showCustomForm, setShowCustomForm] = useState<boolean>(false);
  const [customName, setCustomName] = useState<string>("");
  const [customType, setCustomType] = useState<string>("api");
  const [customDesc, setCustomDesc] = useState<string>("");

  useEffect(() => {
    let active = true;
    const loadCatalogs = async () => {
      setIsLoading(true);
      try {
        const [builtins, mcpConfig] = await Promise.all([
          fetchBuiltinTools().catch(() => [] as BuiltinToolDescriptor[]),
          fetchMcpConfig().catch(() => ({ servers: [] as McpServerDto[] })),
        ]);
        if (active) {
          setBuiltinCatalog(builtins);
          setMcpServers(mcpConfig.servers ?? []);
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void loadCatalogs();
    return () => {
      active = false;
    };
  }, []);

  const isSelected = (type: string, name: string): boolean =>
    tools.some(
      (t) =>
        String(t.type ?? "").toLowerCase() === type.toLowerCase() &&
        String(t.name ?? "") === name,
    );

  const toggleTool = (type: string, name: string, description?: string) => {
    if (isSelected(type, name)) {
      onChange(
        tools.filter(
          (t) =>
            !(
              String(t.type ?? "").toLowerCase() === type.toLowerCase() &&
              String(t.name ?? "") === name
            ),
        ),
      );
      return;
    }
    onChange([...tools, { type, name, description: description || undefined }]);
  };

  const handleAddCustom = () => {
    if (!customName.trim()) return;
    onChange([
      ...tools,
      {
        name: customName.trim(),
        type: customType,
        description: customDesc.trim() || undefined,
      },
    ]);
    setCustomName("");
    setCustomDesc("");
    setShowCustomForm(false);
  };

  const customTools = tools.filter((t) => {
    const tType = String(t.type ?? "").toLowerCase();
    return tType !== "builtin" && tType !== "mcp";
  });

  return (
    <div className="space-y-5 pb-6 border-b border-zinc-200">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 tracking-tight">
            Tools &amp; Capabilities
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Select native built-in tools and connected MCP servers this agent can invoke.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setShowCustomForm((prev) => !prev)}
          className="text-xs gap-1.5 border-zinc-200 text-zinc-700 hover:bg-zinc-50 shadow-none"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Custom</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-zinc-500 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Loading available tools...</span>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-700">
              <Cpu className="w-3.5 h-3.5 text-zinc-500" />
              <span>Native Built-in Tools</span>
              <Badge variant="secondary" className="text-[10px]">
                {tools.filter((t) => t.type === "builtin").length}/{builtinCatalog.length}
              </Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {builtinCatalog.map((tool) => {
                const active = isSelected("builtin", tool.name);
                return (
                  <button
                    key={tool.name}
                    type="button"
                    onClick={() => toggleTool("builtin", tool.name, tool.description)}
                    className={cn(
                      "text-left p-2.5 rounded-lg border transition-colors flex items-start justify-between gap-2",
                      active
                        ? "border-zinc-900 bg-zinc-50"
                        : "border-zinc-200 bg-white hover:bg-zinc-50/70",
                    )}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono font-medium text-zinc-900 truncate">
                          {tool.name}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {tool.category}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-zinc-500 line-clamp-2">{tool.description}</p>
                    </div>
                    <span
                      className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5",
                        active
                          ? "bg-zinc-900 border-zinc-900 text-white"
                          : "border-zinc-300 bg-white",
                      )}
                    >
                      {active && <Check className="w-3 h-3" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-700">
              <Server className="w-3.5 h-3.5 text-zinc-500" />
              <span>Connected MCP Servers</span>
              <Badge variant="secondary" className="text-[10px]">
                {tools.filter((t) => t.type === "mcp").length}/{mcpServers.length}
              </Badge>
            </div>
            {mcpServers.length === 0 ? (
              <p className="text-xs text-zinc-500 border border-dashed border-zinc-200 rounded-lg p-3">
                No MCP servers configured yet. Add servers in the MCP tab to attach them here.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {mcpServers.map((srv) => {
                  const active = isSelected("mcp", srv.name);
                  const statusColor =
                    srv.connection_status === "connected"
                      ? "bg-emerald-500"
                      : srv.connection_status === "failed"
                        ? "bg-red-500"
                        : "bg-zinc-400";
                  return (
                    <button
                      key={srv.name}
                      type="button"
                      onClick={() =>
                        toggleTool("mcp", srv.name, `MCP server (${srv.type})`)
                      }
                      className={cn(
                        "text-left p-2.5 rounded-lg border transition-colors flex items-center justify-between gap-2",
                        active
                          ? "border-zinc-900 bg-zinc-50"
                          : "border-zinc-200 bg-white hover:bg-zinc-50/70",
                      )}
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className={cn("w-2 h-2 rounded-full shrink-0", statusColor)} />
                          <span className="text-xs font-mono font-medium text-zinc-900 truncate">
                            {srv.name}
                          </span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {srv.type}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-zinc-500">
                          {srv.tools_count ?? 0} tool(s) discovered
                        </p>
                      </div>
                      <span
                        className={cn(
                          "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                          active
                            ? "bg-zinc-900 border-zinc-900 text-white"
                            : "border-zinc-300 bg-white",
                        )}
                      >
                        {active && <Check className="w-3 h-3" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {showCustomForm && (
        <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Custom tool name"
              className="w-full text-xs px-2.5 py-1.5 border border-zinc-300 rounded-md bg-white"
            />
            <select
              value={customType}
              onChange={(e) => setCustomType(e.target.value)}
              className="w-full text-xs px-2.5 py-1.5 border border-zinc-300 rounded-md bg-white"
            >
              <option value="api">REST API (HTTP Webhook)</option>
              <option value="rag">RAG / Documents</option>
              <option value="database">Database (SQL)</option>
              <option value="custom">Custom Script</option>
            </select>
          </div>
          <input
            type="text"
            value={customDesc}
            onChange={(e) => setCustomDesc(e.target.value)}
            placeholder="Tool description"
            className="w-full text-xs px-2.5 py-1.5 border border-zinc-300 rounded-md bg-white"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowCustomForm(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleAddCustom}>
              Add
            </Button>
          </div>
        </div>
      )}

      {customTools.length > 0 && (
        <div className="space-y-1.5">
          {customTools.map((t, idx) => (
            <div
              key={`${String(t.name)}-${idx}`}
              className="flex items-center justify-between px-3 py-2 rounded-md border border-zinc-200 bg-zinc-50/50 text-xs"
            >
              <div className="flex items-center gap-2">
                <Wrench className="w-3.5 h-3.5 text-zinc-500" />
                <span className="font-mono font-medium text-zinc-900">{String(t.name)}</span>
                <Badge variant="outline" className="text-[10px]">
                  {String(t.type)}
                </Badge>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-zinc-400 hover:text-red-600"
                onClick={() =>
                  onChange(tools.filter((item) => item !== t))
                }
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
