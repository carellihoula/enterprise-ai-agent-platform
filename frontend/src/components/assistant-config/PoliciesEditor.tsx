"use client";

import React, { useState } from "react";
import { ShieldCheck, ShieldAlert, Code2 } from "lucide-react";

interface PoliciesEditorProps {
  policies: Record<string, unknown>;
  onChange: (policies: Record<string, unknown>) => void;
}

export const PoliciesEditor: React.FC<PoliciesEditorProps> = ({
  policies,
  onChange,
}) => {
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [jsonText, setJsonText] = useState(JSON.stringify(policies, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  const requireHumanApproval = Boolean(policies.require_human_approval);
  const dlpFilterActive = Boolean(policies.dlp_filter_active);

  const handleToggle = (key: string, value: boolean) => {
    const updated = { ...policies, [key]: value };
    onChange(updated);
    setJsonText(JSON.stringify(updated, null, 2));
  };

  const handleJsonChange = (val: string) => {
    setJsonText(val);
    try {
      const parsed = JSON.parse(val);
      onChange(parsed);
      setJsonError(null);
    } catch {
      setJsonError("Invalid JSON format");
    }
  };

  return (
    <div className="space-y-4 pb-6 border-b border-zinc-200">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 tracking-tight">
            Governance & Guardrail Policies
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Define safety constraints, human approval requirements, and data loss prevention (DLP) rules.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowJsonEditor(!showJsonEditor)}
          className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-900 px-2.5 py-1 border border-zinc-200 rounded-md hover:bg-zinc-50 transition-colors shadow-none"
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>{showJsonEditor ? "Form Mode" : "JSON Editor"}</span>
        </button>
      </div>

      {!showJsonEditor ? (
        <div className="space-y-3">
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
                Requires explicit operator confirmation before executing high-impact actions (file writes, database mutations, external calls).
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
                Automatically masks credentials, API keys, tokens, and personally identifiable information (PII) before storage.
              </p>
            </div>
          </label>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            rows={6}
            value={jsonText}
            onChange={(e) => handleJsonChange(e.target.value)}
            className="w-full px-3 py-2 text-xs font-mono bg-white border border-zinc-300 rounded-md focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 transition-colors"
          />
          {jsonError && (
            <p className="text-[11px] font-mono text-rose-600">{jsonError}</p>
          )}
        </div>
      )}
    </div>
  );
};
