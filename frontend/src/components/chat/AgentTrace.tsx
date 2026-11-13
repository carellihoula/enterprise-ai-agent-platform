"use client";

import React, { useState } from "react";
import { Check, ChevronRight, Loader2, Sparkles, Wrench, X } from "lucide-react";
import { ToolExecutionBadge } from "@/types/chat";
import { cn } from "@/lib/utils";
import { JsonCodeBlock } from "./JsonCodeBlock";

interface AgentTraceProps {
  steps?: ToolExecutionBadge[];
  isStreaming?: boolean;
}

function formatDuration(ms?: number): string {
  if (ms === undefined || ms === null) return "";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
}

function splitToolName(fullName: string): { server: string; fn: string } {
  const sepIdx = fullName.indexOf("__");
  if (sepIdx > 0) {
    return {
      server: fullName.slice(0, sepIdx),
      fn: fullName.slice(sepIdx + 2),
    };
  }
  return { server: "builtin", fn: fullName };
}

function formatInlineArgs(args?: Record<string, unknown>): string {
  if (!args) return "";
  return Object.entries(args)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join(", ");
}

export const AgentTrace: React.FC<AgentTraceProps> = ({ steps, isStreaming = false }) => {
  const hasRunning = Boolean(steps?.some((s) => s.status === "running"));
  const [traceOpen, setTraceOpen] = useState<boolean>(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  if (!steps || steps.length === 0) return null;

  const isExpanded = traceOpen || (isStreaming && hasRunning);

  const toggleItem = (key: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="mb-2">
      {/* Trace header toggle: chevron icon button only */}
      <div className="mb-2">
        <button
          type="button"
          onClick={() => setTraceOpen((prev) => !prev)}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "Hide reasoning and tools" : "Show reasoning and tools"}
          title={isExpanded ? "Hide reasoning and tools" : "Show reasoning and tools"}
          className="inline-grid place-items-center w-7 h-7 border border-zinc-200 rounded-md bg-white hover:bg-zinc-50 text-zinc-500 hover:text-zinc-900 shadow-2xs transition-colors"
        >
          <ChevronRight
            className={cn(
              "w-4 h-4 transition-transform duration-150",
              isExpanded && "rotate-90",
            )}
          />
        </button>
      </div>

      {/* Vertical rail steps */}
      {isExpanded && (
        <div className="space-y-0">
          {steps.map((step, idx) => {
            const key = step.id ?? `${step.name}-${idx}`;
            const isLast = idx === steps.length - 1;
            const isOpen = expandedIds.has(key);

            if (step.type === "think") {
              const isThinkRunning = isStreaming && step.status === "running";
              const thinkOpen = isOpen || isThinkRunning;
              return (
                <div key={key} className="relative grid grid-cols-[24px_minmax(0,1fr)] gap-3 pb-3">
                  {!isLast && (
                    <span className="absolute left-[11.5px] top-6 bottom-0 w-px bg-zinc-200" />
                  )}
                  <span
                    className={cn(
                      "relative z-10 grid place-items-center w-6 h-6 rounded-full border bg-white",
                      isThinkRunning
                        ? "border-blue-600 text-blue-600 ring-3 ring-blue-500/20"
                        : "border-zinc-200 text-zinc-500",
                    )}
                  >
                    <Sparkles className="w-3 h-3" />
                  </span>
                  <div className="min-w-0">
                    <button
                      type="button"
                      disabled={isThinkRunning}
                      onClick={() => toggleItem(key)}
                      aria-expanded={thinkOpen}
                      className="flex items-center gap-2 w-full h-6 text-left group disabled:cursor-default"
                    >
                      <ChevronRight
                        className={cn(
                          "w-3 h-3 text-zinc-400 transition-transform duration-150 shrink-0",
                          thinkOpen && "rotate-90",
                        )}
                      />
                      <span className="text-[13px] font-medium text-zinc-600 group-hover:text-zinc-900">
                        {isThinkRunning ? "Thinking..." : "Reasoning"}
                      </span>
                      {!thinkOpen && step.text && (
                        <span className="text-xs text-zinc-400 truncate flex-1">{step.text}</span>
                      )}
                    </button>
                    {thinkOpen && step.text && (
                      <p className="mt-1.5 pl-3 border-l-2 border-zinc-200 text-[13px] leading-relaxed text-zinc-600 whitespace-pre-wrap">
                        {step.text}
                        {isThinkRunning && (
                          <span className="inline-block w-1.5 h-3.5 ml-1 align-middle bg-blue-600 animate-pulse" />
                        )}
                      </p>
                    )}
                  </div>
                </div>
              );
            }

            const isRunning = step.status === "running";
            const isError = step.status === "error";
            const { server, fn } = splitToolName(step.name);
            const inlineArgs = formatInlineArgs(step.arguments);

            return (
              <div key={key} className="relative grid grid-cols-[24px_minmax(0,1fr)] gap-3 pb-3">
                {!isLast && (
                  <span className="absolute left-[11.5px] top-6 bottom-0 w-px bg-zinc-200" />
                )}
                <span
                  className={cn(
                    "relative z-10 grid place-items-center w-6 h-6 rounded-full border bg-white",
                    isRunning && "border-blue-600 text-blue-600 ring-3 ring-blue-500/20",
                    isError && "border-transparent bg-red-50 text-red-600",
                    !isRunning && !isError && "border-zinc-200 text-zinc-800",
                  )}
                >
                  <Wrench className="w-3 h-3" />
                </span>

                <div className="min-w-0 border border-zinc-200 rounded-lg bg-white shadow-2xs overflow-hidden">
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={() => toggleItem(key)}
                    aria-expanded={isOpen}
                    className="flex items-center gap-2 w-full min-h-9 px-2.5 py-1.5 text-left hover:bg-zinc-50 disabled:cursor-default transition-colors"
                  >
                    <ChevronRight
                      className={cn(
                        "w-3 h-3 text-zinc-400 transition-transform duration-150 shrink-0",
                        isOpen && "rotate-90",
                      )}
                    />
                    <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-[11px] font-mono font-medium text-zinc-600 shrink-0">
                      {server}
                    </span>
                    <span className="text-[13px] font-mono font-medium text-zinc-900 truncate">
                      {fn}
                    </span>
                    {inlineArgs && (
                      <span className="hidden sm:inline text-xs font-mono text-zinc-400 truncate flex-1">
                        {inlineArgs}
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-2 shrink-0">
                      {isRunning ? (
                        <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                      ) : isError ? (
                        <X className="w-3.5 h-3.5 text-red-600" />
                      ) : (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      )}
                      {!isRunning && step.latencyMs !== undefined && (
                        <span className="text-xs font-mono text-zinc-400 tabular-nums">
                          {formatDuration(step.latencyMs)}
                        </span>
                      )}
                    </span>
                  </button>

                  {isOpen && !isRunning && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 border-t border-zinc-200 divide-y sm:divide-y-0 sm:divide-x divide-zinc-200 bg-zinc-50/40">
                      <div className="min-w-0">
                        <div className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                          Input
                        </div>
                        <JsonCodeBlock value={step.arguments ?? {}} />
                      </div>
                      <div className="min-w-0">
                        <div
                          className={cn(
                            "px-3 pt-2 text-[10px] font-semibold uppercase tracking-wider",
                            isError ? "text-red-600" : "text-zinc-500",
                          )}
                        >
                          {isError ? "Error" : "Output"}
                        </div>
                        <JsonCodeBlock value={step.output ?? ""} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
