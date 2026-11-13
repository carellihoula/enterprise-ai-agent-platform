"use client";

import React from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { McpKeyValueList } from "./McpKeyValueList";
import { McpServerFormState, McpValidationErrors } from "@/types/mcp";

export interface McpStdioFieldsProps {
  server: McpServerFormState;
  errors: McpValidationErrors;
  onUpdate: (patch: Partial<McpServerFormState>) => void;
}

/**
 * Form sections for local stdio MCP servers: command, arguments list, and environment variables.
 */
export const McpStdioFields: React.FC<McpStdioFieldsProps> = ({
  server,
  errors,
  onUpdate,
}) => {
  const handleAddArg = () => {
    onUpdate({ args: [...server.args, ""] });
  };

  const handleUpdateArg = (index: number, value: string) => {
    const nextArgs = server.args.map((arg, idx) => (idx === index ? value : arg));
    onUpdate({ args: nextArgs });
  };

  const handleRemoveArg = (index: number) => {
    onUpdate({ args: server.args.filter((_, idx) => idx !== index) });
  };

  return (
    <>
      {/* Launch Section */}
      <div className="flex flex-col gap-4 pt-6 border-t border-zinc-200">
        <div>
          <h3 className="m-0 text-sm font-semibold text-zinc-900">Launch</h3>
          <p className="mt-0.5 text-[13px] text-zinc-500">
            Command executed when starting the agent.
          </p>
        </div>

        <div className="flex flex-col gap-1.5 max-w-[440px] min-w-0">
          <Label
            htmlFor={`c-${server.id}`}
            className="text-[13px] font-medium text-zinc-900"
          >
            Command
          </Label>
          <Input
            id={`c-${server.id}`}
            list="cmds"
            value={server.command}
            onChange={(e) => onUpdate({ command: e.target.value })}
            placeholder="npx"
            aria-invalid={Boolean(errors.command)}
            className="font-mono text-[13px] h-9"
            autoComplete="off"
            spellCheck={false}
          />
          {errors.command && (
            <p className="m-0 text-xs text-rose-600">{errors.command}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-zinc-900">
              Arguments
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddArg}
              className="h-7 px-2.5 text-xs gap-1.5 bg-white border-zinc-200 text-zinc-900 hover:bg-zinc-50 shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>Add</span>
            </Button>
          </div>

          {server.args.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {server.args.map((arg, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <Input
                    aria-label={`Argument ${idx + 1}`}
                    value={arg}
                    onChange={(e) => handleUpdateArg(idx, e.target.value)}
                    className="flex-1 min-w-0 font-mono text-[13px] h-9"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveArg(idx)}
                    aria-label={`Remove argument ${idx + 1}`}
                    className="inline-grid place-items-center w-8 h-8 rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4 shrink-0" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="m-0 p-3 border border-dashed border-zinc-200 rounded-lg text-[13px] text-zinc-500">
              No arguments.
            </p>
          )}
        </div>
      </div>

      {/* Environment Variables Section */}
      <div className="flex flex-col gap-4 pt-6 border-t border-zinc-200">
        <div>
          <h3 className="m-0 text-sm font-semibold text-zinc-900">
            Environment Variables
          </h3>
          <p className="mt-0.5 text-[13px] text-zinc-500">
            Values are masked. Write{" "}
            <span className="font-mono text-[13px]">{"${NAME}"}</span> to read a
            secret from the environment rather than storing it here.
          </p>
        </div>

        <McpKeyValueList
          rows={server.env}
          keyPlaceholder="VARIABLE_NAME"
          valuePlaceholder="value"
          emptyText="No variables."
          addButtonLabel="Add variable"
          errorMessage={errors.kv}
          onChange={(env) => onUpdate({ env })}
        />
      </div>
    </>
  );
};
