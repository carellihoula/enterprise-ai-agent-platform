"use client";

import React, { useRef } from "react";
import { SlidersHorizontal, Braces } from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { McpEditMode } from "@/types/mcp";

export interface McpHeaderProps {
  mode: McpEditMode;
  onModeChange: (mode: McpEditMode) => void;
}

/**
 * Header section for the MCP Configuration page displaying the page title
 * and the synchronized Form / JSON view switcher.
 */
export const McpHeader: React.FC<McpHeaderProps> = ({
  mode,
  onModeChange,
}) => {
  const formTabRef = useRef<HTMLButtonElement>(null);
  const jsonTabRef = useRef<HTMLButtonElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const nextMode: McpEditMode = mode === "form" ? "json" : "form";
      onModeChange(nextMode);
      if (nextMode === "form") {
        formTabRef.current?.focus();
      } else {
        jsonTabRef.current?.focus();
      }
    }
  };

  return (
    <header className="flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row pb-5 border-b border-zinc-200">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">
          MCP Servers
        </h1>
      </div>

      <TabsList aria-label="Editing mode" onKeyDown={handleKeyDown}>
        <TabsTrigger
          ref={formTabRef}
          id="tab-form"
          active={mode === "form"}
          onClick={() => onModeChange("form")}
        >
          <SlidersHorizontal className="w-4 h-4 shrink-0" />
          <span>Form</span>
        </TabsTrigger>
        <TabsTrigger
          ref={jsonTabRef}
          id="tab-json"
          active={mode === "json"}
          onClick={() => onModeChange("json")}
        >
          <Braces className="w-4 h-4 shrink-0" />
          <span>JSON</span>
        </TabsTrigger>
      </TabsList>
    </header>
  );
};
