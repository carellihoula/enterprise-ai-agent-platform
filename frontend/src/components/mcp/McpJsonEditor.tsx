"use client";

import React, { useRef, useState } from "react";
import {
  AlertCircle,
  AlignLeft,
  Check,
  Copy,
  FileCode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatByteSize } from "./mcpUtils";
import { McpJsonError } from "@/types/mcp";

export interface McpJsonEditorProps {
  jsonText: string;
  jsonError: McpJsonError | null;
  serverCount: number;
  statusShake: boolean;
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
          </span>
        );
      } else {
        nodes.push(
          <span key={key} className="text-sky-900">
            {str}
          </span>
        );
      }
    } else if (bool) {
      nodes.push(
        <span key={key} className="text-rose-600">
          {full}
        </span>
      );
    } else if (num) {
      nodes.push(
        <span key={key} className="text-blue-700">
          {full}
        </span>
      );
    } else {
      nodes.push(
        <span key={key} className="text-zinc-500">
          {full}
        </span>
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
 * Synchronized mcp.json file editor with line numbers, syntax highlighting,
 * smart indentation, and live validation status bar.
 */
export const McpJsonEditor: React.FC<McpJsonEditorProps> = ({
  jsonText,
  jsonError,
  serverCount,
  statusShake,
  onChange,
  onFormat,
  onCopy,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const [trapOff, setTrapOff] = useState(false);

  const lines = jsonText.split("\n");
  const byteSize = new TextEncoder().encode(jsonText).length;
  const errorLine = jsonError?.line ?? null;

  const handleScroll = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (preRef.current) {
      preRef.current.scrollTop = ta.scrollTop;
      preRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = ta.scrollTop;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    if (e.key === "Escape") {
      setTrapOff(true);
      return;
    }
    if (e.key === "Tab" && !e.shiftKey && !trapOff) {
      e.preventDefault();
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const updated = jsonText.slice(0, start) + "  " + jsonText.slice(end);
      onChange(updated);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const lineStart = jsonText.lastIndexOf("\n", start - 1) + 1;
      const indentMatch = jsonText.slice(lineStart, start).match(/^\s*/);
      const indent = indentMatch ? indentMatch[0] : "";
      const prevChar = jsonText[start - 1];
      const nextChar = jsonText[end];
      const isOpenBlock = prevChar === "{" || prevChar === "[";
      const isClosedPair =
        isOpenBlock && (nextChar === "}" || nextChar === "]");

      let insertion = "\n" + indent + (isOpenBlock ? "  " : "");
      const caretOffset = insertion.length;
      if (isClosedPair) {
        insertion += "\n" + indent;
      }

      const updated =
        jsonText.slice(0, start) + insertion + jsonText.slice(end);
      onChange(updated);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + caretOffset;
      });
    }
  };

  return (
    <div role="tabpanel" aria-labelledby="tab-json">
      {/* File Header */}
      <div className="flex items-center justify-between gap-2 pl-4 pr-2 py-2 border-b border-zinc-200 bg-zinc-50/80">
        <div className="flex items-center gap-2 min-w-0 font-mono text-[13px] font-medium text-zinc-900">
          <FileCode className="w-4 h-4 text-zinc-500 shrink-0" />
          <span>mcp.json</span>
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
            onClick={onCopy}
            className="h-7 px-2.5 text-xs gap-1.5 text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900"
          >
            <Copy className="w-3.5 h-3.5 shrink-0" />
            <span>Copy</span>
          </Button>
        </div>
      </div>

      {/* Synchronized Gutter + Overlay Code Editor */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] h-[min(560px,72vh)] focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-blue-600">
        <div
          ref={gutterRef}
          aria-hidden="true"
          className="overflow-hidden min-w-[48px] pt-3 px-3 pb-9 border-r border-zinc-200 bg-zinc-50/80 font-mono text-[13px] leading-5 text-right text-zinc-400 select-none"
        >
          {lines.map((_, idx) => {
            const lineNum = idx + 1;
            const isBad = errorLine === lineNum;
            return (
              <div
                key={lineNum}
                className={cn(
                  "h-5",
                  isBad && "text-rose-600 font-semibold"
                )}
              >
                {lineNum}
              </div>
            );
          })}
        </div>

        <div className="relative overflow-hidden bg-white">
          <pre
            ref={preRef}
            aria-hidden="true"
            className="absolute inset-0 w-full h-full m-0 pt-3 pr-9 pb-9 pl-4 border-0 font-mono text-[13px] leading-5 tab-2 whitespace-pre overflow-hidden pointer-events-none text-zinc-900"
          >
            {lines.map((line, idx) => {
              const lineNum = idx + 1;
              const isBad = errorLine === lineNum;
              return (
                <span
                  key={lineNum}
                  className={cn(
                    "block min-h-[20px]",
                    isBad && "bg-rose-50 shadow-[inset_2px_0_0_#e11d48]"
                  )}
                >
                  {renderHighlightedJsonLine(line)}
                </span>
              );
            })}
          </pre>

          <textarea
            ref={textareaRef}
            value={jsonText}
            onChange={(e) => onChange(e.target.value)}
            onScroll={handleScroll}
            onKeyDown={handleKeyDown}
            onBlur={() => setTrapOff(false)}
            wrap="off"
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            aria-label="Contents of mcp.json"
            className="absolute inset-0 w-full h-full m-0 pt-3 pr-9 pb-9 pl-4 border-0 font-mono text-[13px] leading-5 tab-2 whitespace-pre overflow-auto resize-none outline-none bg-transparent text-transparent caret-zinc-900 selection:bg-blue-600/20 selection:text-transparent"
          />
        </div>
      </div>

      {/* Editor Status Bar */}
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1.5 border-t border-zinc-200 bg-zinc-50/80 font-mono text-xs text-zinc-500",
          statusShake && "animate-pulse"
        )}
      >
        {jsonError ? (
          <span className="inline-flex items-center gap-1.5 min-w-0 text-rose-600">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>
              Invalid JSON
              {jsonError.line
                ? ` (line ${jsonError.line}, col ${jsonError.col})`
                : ""}
              : {jsonError.msg}
            </span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 min-w-0 text-emerald-700">
            <Check className="w-3.5 h-3.5 shrink-0" />
            <span>
              Valid JSON · {serverCount}{" "}
              {serverCount === 1 ? "server" : "servers"}
            </span>
          </span>
        )}
        <span>UTF-8 · 2 spaces</span>
      </div>
    </div>
  );
};
