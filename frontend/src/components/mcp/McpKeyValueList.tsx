"use client";

import React from "react";
import { Eye, EyeOff, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { McpKeyValueRow } from "@/types/mcp";

export interface McpKeyValueListProps {
  rows: McpKeyValueRow[];
  keyPlaceholder: string;
  valuePlaceholder: string;
  emptyText: string;
  addButtonLabel: string;
  errorMessage?: string;
  onChange: (rows: McpKeyValueRow[]) => void;
}

/**
 * Reusable secret key-value list editor supporting masked values and visibility toggling.
 */
export const McpKeyValueList: React.FC<McpKeyValueListProps> = ({
  rows,
  keyPlaceholder,
  valuePlaceholder,
  emptyText,
  addButtonLabel,
  errorMessage,
  onChange,
}) => {
  const handleUpdateRow = (index: number, patch: Partial<McpKeyValueRow>) => {
    const updated = rows.map((row, idx) =>
      idx === index ? { ...row, ...patch } : row
    );
    onChange(updated);
  };

  const handleRemoveRow = (index: number) => {
    onChange(rows.filter((_, idx) => idx !== index));
  };

  const handleAddRow = () => {
    onChange([...rows, { k: "", v: "", show: false }]);
  };

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      {rows.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {rows.map((row, idx) => (
            <div
              key={idx}
              className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-1.5 items-center"
            >
              <Input
                className="font-mono text-[13px] h-9"
                placeholder={keyPlaceholder}
                aria-label="Name"
                value={row.k}
                onChange={(e) => handleUpdateRow(idx, { k: e.target.value })}
                autoComplete="off"
                spellCheck={false}
              />

              <div className="relative flex items-center min-w-0">
                <Input
                  type={row.show ? "text" : "password"}
                  className="font-mono text-[13px] h-9 pr-9"
                  placeholder={valuePlaceholder}
                  aria-label="Value"
                  value={row.v}
                  onChange={(e) => handleUpdateRow(idx, { v: e.target.value })}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => handleUpdateRow(idx, { show: !row.show })}
                  aria-label={row.show ? "Hide value" : "Show value"}
                  className="absolute right-0.5 top-0.5 inline-grid place-items-center w-8 h-8 rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors cursor-pointer"
                >
                  {row.show ? (
                    <EyeOff className="w-4 h-4 shrink-0" />
                  ) : (
                    <Eye className="w-4 h-4 shrink-0" />
                  )}
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleRemoveRow(idx)}
                aria-label="Remove row"
                className="inline-grid place-items-center w-8 h-8 rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4 shrink-0" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="m-0 p-3 border border-dashed border-zinc-200 rounded-lg text-[13px] text-zinc-500">
          {emptyText}
        </p>
      )}

      {errorMessage && (
        <p className="m-0 text-xs text-rose-600">{errorMessage}</p>
      )}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddRow}
          className="h-7 px-2.5 text-xs gap-1.5 bg-white border-zinc-200 text-zinc-900 hover:bg-zinc-50 shadow-2xs"
        >
          <Plus className="w-3.5 h-3.5 shrink-0" />
          <span>{addButtonLabel}</span>
        </Button>
      </div>
    </div>
  );
};
