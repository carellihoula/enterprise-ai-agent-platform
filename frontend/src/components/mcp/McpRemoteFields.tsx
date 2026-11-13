"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { McpKeyValueList } from "./McpKeyValueList";
import { McpServerFormState, McpValidationErrors } from "@/types/mcp";

export interface McpRemoteFieldsProps {
  server: McpServerFormState;
  errors: McpValidationErrors;
  onUpdate: (patch: Partial<McpServerFormState>) => void;
}

/**
 * Form sections for remote HTTP / SSE MCP servers: endpoint URL and HTTP request headers.
 */
export const McpRemoteFields: React.FC<McpRemoteFieldsProps> = ({
  server,
  errors,
  onUpdate,
}) => {
  return (
    <>
      {/* Connection URL Section */}
      <div className="flex flex-col gap-4 pt-6 border-t border-zinc-200">
        <div>
          <h3 className="m-0 text-sm font-semibold text-zinc-900">
            Connection
          </h3>
          <p className="mt-0.5 text-[13px] text-zinc-500">
            Remote server endpoint address.
          </p>
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <Label
            htmlFor={`u-${server.id}`}
            className="text-[13px] font-medium text-zinc-900"
          >
            URL
          </Label>
          <Input
            id={`u-${server.id}`}
            type="url"
            inputMode="url"
            value={server.url}
            onChange={(e) => onUpdate({ url: e.target.value })}
            placeholder="https://mcp.example.com/mcp"
            aria-invalid={Boolean(errors.url)}
            className="font-mono text-[13px] h-9"
            autoComplete="off"
            spellCheck={false}
          />
          {errors.url && (
            <p className="m-0 text-xs text-rose-600">{errors.url}</p>
          )}
        </div>
      </div>

      {/* HTTP Headers Section */}
      <div className="flex flex-col gap-4 pt-6 border-t border-zinc-200">
        <div>
          <h3 className="m-0 text-sm font-semibold text-zinc-900">
            HTTP Headers
          </h3>
          <p className="mt-0.5 text-[13px] text-zinc-500">
            Sent with every request, for example for authentication. Values are
            masked.
          </p>
        </div>

        <McpKeyValueList
          rows={server.headers}
          keyPlaceholder="Authorization"
          valuePlaceholder="Bearer …"
          emptyText="No headers."
          addButtonLabel="Add header"
          errorMessage={errors.kv}
          onChange={(headers) => onUpdate({ headers })}
        />
      </div>
    </>
  );
};
