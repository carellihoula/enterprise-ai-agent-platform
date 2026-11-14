"use client";

import React, { useEffect, useState } from "react";
import {
  Braces,
  Database,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PolicyJsonEditor } from "./PolicyJsonEditor";

interface PoliciesEditorProps {
  policies: Record<string, unknown>;
  onChange: (policies: Record<string, unknown>) => void;
}

type PolicyEditMode = "form" | "json";

function parseToolList(rawValue: unknown): string[] {
  if (!Array.isArray(rawValue)) return [];
  return rawValue.map((item) => String(item).trim()).filter(Boolean);
}

function formatToolListInput(rawValue: unknown): string {
  return parseToolList(rawValue).join(", ");
}

/**
 * Governance & guardrail policies editor with synchronized Form / JSON modes
 * matching the MCP configuration interface style.
 */
export const PoliciesEditor: React.FC<PoliciesEditorProps> = ({
  policies,
  onChange,
}) => {
  const [mode, setMode] = useState<PolicyEditMode>("form");
  const [jsonText, setJsonText] = useState(() =>
    JSON.stringify(policies ?? {}, null, 2),
  );
  const [jsonError, setJsonError] = useState<string | null>(null);

  // [Sync] Keep JSON buffer aligned when switching between agents
  useEffect(() => {
    setJsonText(JSON.stringify(policies ?? {}, null, 2));
    setJsonError(null);
  }, [policies]);

  const requireHumanApproval = Boolean(policies?.require_human_approval);
  const readOnlySql = Boolean(policies?.read_only_sql);
  const dlpFilterActive = Boolean(policies?.dlp_filter_active);

  const handleToggle = (key: string, value: boolean) => {
    const updated = { ...(policies ?? {}), [key]: value };
    onChange(updated);
    setJsonText(JSON.stringify(updated, null, 2));
    setJsonError(null);
  };

  const handleListChange = (key: string, rawText: string) => {
    const items = rawText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const updated = { ...(policies ?? {}) };
    if (items.length > 0) {
      updated[key] = items;
    } else {
      delete updated[key];
    }
    onChange(updated);
    setJsonText(JSON.stringify(updated, null, 2));
    setJsonError(null);
  };

  const handleJsonChange = (val: string) => {
    setJsonText(val);
    try {
      const parsed = JSON.parse(val);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setJsonError("Root value must be a JSON object");
        return;
      }
      onChange(parsed as Record<string, unknown>);
      setJsonError(null);
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : "Invalid JSON format");
    }
  };

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      const formatted = JSON.stringify(parsed, null, 2);
      setJsonText(formatted);
      setJsonError(null);
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : "Invalid JSON format");
    }
  };

  const handleCopyJson = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(jsonText);
    }
  };

  const activeRuleCount = Object.entries(policies ?? {}).filter(([, val]) =>
    Array.isArray(val) ? val.length > 0 : Boolean(val),
  ).length;

  return (
    <div className="space-y-4 pb-6 border-b border-zinc-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 tracking-tight">
            Governance & Guardrail Policies
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Define HITL approval gates, read-only SQL enforcement, DLP redaction, and tool access lists.
          </p>
        </div>

        <TabsList aria-label="Policies editing mode">
          <TabsTrigger
            id="policies-tab-form"
            active={mode === "form"}
            onClick={() => setMode("form")}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
            <span>Form</span>
          </TabsTrigger>
          <TabsTrigger
            id="policies-tab-json"
            active={mode === "json"}
            onClick={() => setMode("json")}
          >
            <Braces className="w-3.5 h-3.5 shrink-0" />
            <span>JSON</span>
          </TabsTrigger>
        </TabsList>
      </div>

      {mode === "form" ? (
        <div role="tabpanel" aria-labelledby="policies-tab-form" className="space-y-3">
          <label className="flex items-start gap-3 p-3 border border-zinc-200 rounded-lg hover:bg-zinc-50/50 cursor-pointer transition-colors bg-white">
            <input
              type="checkbox"
              checked={requireHumanApproval}
              onChange={(e) => handleToggle("require_human_approval", e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
            />
            <div>
              <div className="text-xs font-medium text-zinc-900 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                <span>Mandatory Human-in-the-Loop Approval</span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Pauses execution and displays an Approve / Reject card before running high-impact actions (writes, deletions, SQL mutations, or external executions).
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 border border-zinc-200 rounded-lg hover:bg-zinc-50/50 cursor-pointer transition-colors bg-white">
            <input
              type="checkbox"
              checked={readOnlySql}
              onChange={(e) => handleToggle("read_only_sql", e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
            />
            <div>
              <div className="text-xs font-medium text-zinc-900 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-blue-600" />
                <span>Read-Only SQL Enforcement</span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Unconditionally blocks mutating SQL statements (DELETE, TRUNCATE, DROP, UPDATE, INSERT, ALTER) locally before reaching database or MCP tools.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 border border-zinc-200 rounded-lg hover:bg-zinc-50/50 cursor-pointer transition-colors bg-white">
            <input
              type="checkbox"
              checked={dlpFilterActive}
              onChange={(e) => handleToggle("dlp_filter_active", e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
            />
            <div>
              <div className="text-xs font-medium text-zinc-900 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Automated DLP & Sensitive Data Redaction</span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Automatically masks credentials, API keys, bearer tokens, and email addresses before persisting chat turns.
              </p>
            </div>
          </label>

          <div className="p-3.5 border border-zinc-200 rounded-lg bg-white space-y-3">
            <div>
              <div className="text-xs font-medium text-zinc-900">Tool Access Lists</div>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Comma-separated tool names or patterns. Supports exact names and <code className="font-mono">*</code> wildcards (e.g. <code className="font-mono">server__*, *__tool, *delete*</code>).
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-zinc-700">
                  Blocked Tools
                </label>
                <Input
                  value={formatToolListInput(policies?.blocked_tools)}
                  onChange={(e) => handleListChange("blocked_tools", e.target.value)}
                  placeholder="apply_migration, *delete*"
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-zinc-700">
                  Require Approval Tools
                </label>
                <Input
                  value={formatToolListInput(policies?.require_approval_tools)}
                  onChange={(e) =>
                    handleListChange("require_approval_tools", e.target.value)
                  }
                  placeholder="execute_sql, server__*"
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-zinc-700">
                  Allowed Tools (Allowlist)
                </label>
                <Input
                  value={formatToolListInput(policies?.allowed_tools)}
                  onChange={(e) => handleListChange("allowed_tools", e.target.value)}
                  placeholder="list_tables, web_*"
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <PolicyJsonEditor
          jsonText={jsonText}
          jsonError={jsonError}
          ruleCount={activeRuleCount}
          onChange={handleJsonChange}
          onFormat={handleFormatJson}
          onCopy={handleCopyJson}
        />
      )}
    </div>
  );
};
