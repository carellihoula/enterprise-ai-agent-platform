"use client";

import React, { useState } from "react";
import { ChevronRight, Copy, PlugZap, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { McpStdioFields } from "./McpStdioFields";
import { McpRemoteFields } from "./McpRemoteFields";
import { McpToolsDialog } from "./McpToolsDialog";
import {
  McpServerFormState,
  McpTestState,
  McpTransportType,
  McpValidationErrors,
} from "@/types/mcp";

const TRANSPORT_OPTIONS: ReadonlyArray<{
  value: McpTransportType;
  title: string;
  description: string;
}> = [
  {
    value: "stdio",
    title: "Local (stdio)",
    description: "The agent runs a command on the machine.",
  },
  {
    value: "http",
    title: "Streamable HTTP",
    description: "Remote server, single access endpoint.",
  },
  {
    value: "sse",
    title: "SSE",
    description: "Remote server, event stream.",
  },
];

export interface McpServerCardProps {
  server: McpServerFormState;
  errors: McpValidationErrors;
  testState: McpTestState;
  isConfirmingDelete: boolean;
  onToggleOpen: () => void;
  onToggleEnabled: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onTestConnection: () => void;
  onChangeTransport: (type: McpTransportType) => void;
  onUpdate: (patch: Partial<McpServerFormState>) => void;
}

/**
 * Collapsible accordion card representing a single MCP server configuration.
 */
export const McpServerCard: React.FC<McpServerCardProps> = ({
  server,
  errors,
  testState,
  isConfirmingDelete,
  onToggleOpen,
  onToggleEnabled,
  onDuplicate,
  onDelete,
  onTestConnection,
  onChangeTransport,
  onUpdate,
}) => {
  const [toolsDialogOpen, setToolsDialogOpen] = useState(false);
  const errorCount = Object.keys(errors).length;
  const isTesting = testState.status === "testing";

  // [Status Dot] Reflect live connection state (yellow=testing, green=connected, red=failed, grey=untested/disabled)
  const dotClassName = server.disabled
    ? "bg-zinc-300"
    : testState.status === "testing"
      ? "bg-yellow-400 animate-pulse"
      : testState.status === "connected"
        ? "bg-emerald-600"
        : testState.status === "failed"
          ? "bg-rose-600"
          : "bg-zinc-300";

  return (
    <article
      data-sid={server.id}
      className="border-b border-zinc-200 last:border-b-0 bg-white"
    >
      {/* Card Header */}
      <div className="flex items-center gap-2 min-h-[52px] pl-2 pr-3">
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={server.open}
          aria-controls={`b-${server.id}`}
          className="flex items-center gap-2.5 flex-1 min-w-0 h-[52px] px-2 rounded-md bg-transparent text-left hover:bg-zinc-50 transition-colors cursor-pointer"
        >
          <span
            className={cn(
              "inline-grid text-zinc-500 transition-transform duration-150",
              server.open && "rotate-90"
            )}
          >
            <ChevronRight className="w-4 h-4 shrink-0" />
          </span>

          <span
            className={cn("w-2 h-2 rounded-full shrink-0", dotClassName)}
            title={
              server.disabled
                ? "Disabled"
                : testState.status === "testing"
                  ? "Testing connection..."
                  : testState.status === "connected"
                    ? testState.message || "Connected"
                    : testState.status === "failed"
                      ? testState.message || "Connection failed"
                      : "Not tested"
            }
          />

          <span className="flex-1 min-w-0 truncate font-mono text-sm font-medium text-zinc-900">
            {server.name || "unnamed"}
          </span>

          <Badge
            variant="outline"
            className="px-1.5 py-0 font-mono text-[11px] leading-[18px] font-normal text-zinc-500 border-zinc-200"
          >
            {server.type}
          </Badge>

          {!server.disabled && testState.status === "connected" && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                setToolsDialogOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  setToolsDialogOpen(true);
                }
              }}
              title="Inspect available tools"
              className="inline-flex items-center rounded-full h-[22px] px-2.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium text-xs transition-colors cursor-pointer"
            >
              {testState.toolsCount ?? 0}{" "}
              {testState.toolsCount === 1 ? "tool" : "tools"}
            </span>
          )}

          {!server.disabled && testState.status === "failed" && (
            <Badge className="h-[22px] px-2 border-transparent bg-rose-50 text-rose-600 hover:bg-rose-50 font-medium text-xs shadow-none">
              Failed
            </Badge>
          )}

          {errorCount > 0 && (
            <Badge className="h-[22px] px-2 border-transparent bg-rose-50 text-rose-600 hover:bg-rose-50 font-medium text-xs shadow-none">
              {errorCount} {errorCount > 1 ? "errors" : "error"}
            </Badge>
          )}
        </button>

        {/* Header Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={errorCount > 0 || isTesting || server.disabled}
            onClick={onTestConnection}
            title="Test MCP connection in isolated sandbox"
            className="h-7 px-2.5 text-xs gap-1.5 bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50 shadow-2xs mr-1"
          >
            <PlugZap className="w-3.5 h-3.5 shrink-0" />
            <span>{isTesting ? "Testing..." : "Test"}</span>
          </Button>

          <span
            id={`en-${server.id}`}
            className="hidden sm:inline mr-1.5 text-xs text-zinc-500"
          >
            {server.disabled ? "Disabled" : "Enabled"}
          </span>

          <Switch
            checked={!server.disabled}
            aria-labelledby={`en-${server.id}`}
            onCheckedChange={onToggleEnabled}
          />

          <button
            type="button"
            onClick={onDuplicate}
            aria-label="Duplicate server"
            title="Duplicate"
            className="inline-grid place-items-center w-8 h-8 rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors cursor-pointer"
          >
            <Copy className="w-4 h-4 shrink-0" />
          </button>

          {isConfirmingDelete ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={onDelete}
              className="h-7 px-2.5 text-xs bg-rose-600 hover:bg-rose-700 text-white"
            >
              Confirm
            </Button>
          ) : (
            <button
              type="button"
              onClick={onDelete}
              aria-label="Delete server"
              title="Delete"
              className="inline-grid place-items-center w-8 h-8 rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-rose-600 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4 shrink-0" />
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Body */}
      {server.open && (
        <div
          id={`b-${server.id}`}
          className="flex flex-col gap-6 pt-1 pb-7 px-4 sm:pl-[50px] sm:pr-5"
        >
          {testState.status === "failed" && testState.message && (
            <div className="rounded-md border border-rose-200 bg-rose-50/70 px-3 py-2 text-xs text-rose-700 font-mono break-words">
              {testState.message}
            </div>
          )}

          {/* Identity & Transport Section */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5 max-w-[440px] min-w-0">
              <Label
                htmlFor={`n-${server.id}`}
                className="text-[13px] font-medium text-zinc-900"
              >
                Name
              </Label>
              <Input
                id={`n-${server.id}`}
                value={server.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
                aria-invalid={Boolean(errors.name)}
                className="font-mono text-[13px] h-9"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="m-0 text-xs text-zinc-500">
                Identifier in <span className="font-mono">mcpServers</span>. It
                prefixes every tool exposed to the agent.
              </p>
              {errors.name && (
                <p className="m-0 text-xs text-rose-600">{errors.name}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5 min-w-0">
              <span
                id={`tr-${server.id}`}
                className="text-[13px] font-medium text-zinc-900"
              >
                Transport
              </span>
              <div
                role="radiogroup"
                aria-labelledby={`tr-${server.id}`}
                className="grid grid-cols-1 md:grid-cols-3 gap-2"
              >
                {TRANSPORT_OPTIONS.map((opt) => {
                  const isChecked = server.type === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={isChecked}
                      onClick={() => onChangeTransport(opt.value)}
                      className={cn(
                        "flex flex-col gap-0.5 p-2.5 px-3 border rounded-lg text-left transition-all cursor-pointer",
                        isChecked
                          ? "border-zinc-900 ring-1 ring-zinc-900 bg-zinc-50"
                          : "border-zinc-200 bg-white hover:bg-zinc-50"
                      )}
                    >
                      <b className="text-[13px] font-semibold text-zinc-900">
                        {opt.title}
                      </b>
                      <span className="text-xs text-zinc-500">
                        {opt.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Transport-Specific Fields */}
          {server.type === "stdio" ? (
            <McpStdioFields
              server={server}
              errors={errors}
              onUpdate={onUpdate}
            />
          ) : (
            <McpRemoteFields
              server={server}
              errors={errors}
              onUpdate={onUpdate}
            />
          )}
        </div>
      )}

      <McpToolsDialog
        open={toolsDialogOpen}
        onOpenChange={setToolsDialogOpen}
        serverName={server.name || "unnamed"}
        tools={testState.tools || []}
        latencyMs={testState.latencyMs}
      />
    </article>
  );
};
