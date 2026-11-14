"use client";

import React, { useRef, useState } from "react";
import { AlertCircle, AlignLeft, Check, Copy, FileCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatByteSize } from "@/components/mcp/mcpUtils";

export interface PolicyJsonEditorProps {
  jsonText: string;
  jsonError: string | null;
  ruleCount: number;
  onChange: (value: string) => void;
  onFormat: () => void;
  onCopy: () => void;
}

/**
 * Tokenizes a single line of JSON into syntax-highlighted React elements.
 */
function renderHighlightedJsonLine(line: string): React.ReactNode {
  const tokenRegex =
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}[\],:])/g;

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(line.slice(lastIndex, match.index));
    }
    const [full, str, colon, bool, num] = match;
    const key = `${match.index}-${full.length}`;
    if (str) {
      if (colon) {
        nodes.push(
          <span key={`${key}-k`} className="text-blue-700">
            {str}
          </span>,
          <span key={`${key}-p`} className="text-zinc-500">
            {colon}
          </span>,
        );
      } else {
        nodes.push(
          <span key={key} className="text-sky-900">
            {str}
          </span>,
        );
      }
    } else if (bool) {
      nodes.push(
        <span key={key} className="text-rose-600">
          {full}
        </span>,
      );
    } else if (num) {
      nodes.push(
        <span key={key} className="text-blue-700">
          {full}
        </span>,
      );
    } else {
      nodes.push(
        <span key={key} className="text-zinc-500">
          {full}
        </span>,
      );
    }
    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < line.length) {
    nodes.push(line.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : " ";
}

/**
 * Synchronized policies.json editor matching the MCP JSON editor styling
 * with line numbers, syntax highlighting, Format/Copy actions, and status bar.
 */
export const PolicyJsonEditor: React.FC<PolicyJsonEditorProps> = ({
  jsonText,
  jsonError,
  ruleCount,
  onChange,
  onFormat,
  onCopy,
}) => {
  const gutterRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);

  const lines = jsonText.split("\n");
  const byteSize = new TextEncoder().encode(jsonText).length;

  const handleScroll = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
    if (preRef.current) {
      preRef.current.scrollTop = ta.scrollTop;
      preRef.current.scrollLeft = ta.scrollLeft;
    }
  };

  const handleCopyClick = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      role="tabpanel"
      aria-labelledby="policies-tab-json"
      className="rounded-xl border border-zinc-200 bg-white overflow-hidden"
    >
      {/* File Header */}
      <div className="flex items-center justify-between gap-2 pl-4 pr-2 py-2 border-b border-zinc-200 bg-zinc-50/80">
        <div className="flex items-center gap-2 min-w-0 font-mono text-[13px] font-medium text-zinc-900">
          <FileCode className="w-4 h-4 text-zinc-500 shrink-0" />
          <span>policies.json</span>
          <span className="font-sans text-xs font-normal text-zinc-500 whitespace-nowrap">
            · {lines.length} {lines.length === 1 ? "line" : "lines"} ·{" "}
            {formatByteSize(byteSize)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onFormat}
            className="h-7 px-2.5 text-xs gap-1.5 text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900"
          >
            <AlignLeft className="w-3.5 h-3.5 shrink-0" />
            <span>Format</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCopyClick}
            className="h-7 px-2.5 text-xs gap-1.5 text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{copied ? "Copied" : "Copy"}</span>
          </Button>
        </div>
      </div>

      {/* Synchronized Gutter + Overlay Code Editor */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] h-64 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-blue-600">
        <div
          ref={gutterRef}
          aria-hidden="true"
          className="overflow-hidden min-w-[44px] pt-3 px-3 pb-6 border-r border-zinc-200 bg-zinc-50/80 font-mono text-[13px] leading-5 text-right text-zinc-400 select-none"
        >
          {lines.map((_, idx) => (
            <div key={idx + 1} className="h-5">
              {idx + 1}
            </div>
          ))}
        </div>

        <div className="relative overflow-hidden bg-white">
          <pre
            ref={preRef}
            aria-hidden="true"
            className="absolute inset-0 w-full h-full m-0 pt-3 pr-6 pb-6 pl-4 border-0 font-mono text-[13px] leading-5 tab-2 whitespace-pre overflow-hidden pointer-events-none text-zinc-900"
          >
            {lines.map((line, idx) => (
              <span key={idx + 1} className="block min-h-[20px]">
                {renderHighlightedJsonLine(line)}
              </span>
            ))}
          </pre>

          <textarea
            ref={textareaRef}
            value={jsonText}
            onChange={(e) => onChange(e.target.value)}
            onScroll={handleScroll}
            wrap="off"
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            aria-label="Contents of policies.json"
            className="absolute inset-0 w-full h-full m-0 pt-3 pr-6 pb-6 pl-4 border-0 font-mono text-[13px] leading-5 tab-2 whitespace-pre overflow-auto resize-none outline-none bg-transparent text-transparent caret-zinc-900 selection:bg-blue-600/20 selection:text-transparent"
          />
        </div>
      </div>

      {/* Editor Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1.5 border-t border-zinc-200 bg-zinc-50/80 font-mono text-xs text-zinc-500">
        {jsonError ? (
          <span className="inline-flex items-center gap-1.5 min-w-0 text-rose-600">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{jsonError}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 min-w-0 text-emerald-700">
            <Check className="w-3.5 h-3.5 shrink-0" />
            <span>
              Valid JSON · {ruleCount} {ruleCount === 1 ? "rule" : "rules"}
            </span>
          </span>
        )}
        <span>UTF-8 · 2 spaces</span>
      </div>
    </div>
  );
};
