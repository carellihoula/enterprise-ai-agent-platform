import React from "react";
import { ShieldAlert, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PendingApproval } from "@/types/chat";

interface ApprovalPromptCardProps {
  approval: PendingApproval;
  isSubmitting?: boolean;
  onDecision: (decision: "approve" | "reject") => void;
}

/**
 * Interactive Human-in-the-Loop (HITL) approval banner shown when an agent
 * policy requires explicit user confirmation before executing a tool call.
 */
export const ApprovalPromptCard: React.FC<ApprovalPromptCardProps> = ({
  approval,
  isSubmitting = false,
  onDecision,
}) => {
  const formattedArgs =
    approval.arguments && Object.keys(approval.arguments).length > 0
      ? JSON.stringify(approval.arguments, null, 2)
      : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-3">
      <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="min-w-0 space-y-1">
              <div className="text-xs font-semibold text-amber-950">
                Human approval required for{" "}
                <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[11px]">
                  {approval.toolName}
                </code>
              </div>
              {approval.reason && (
                <p className="text-xs text-amber-800 leading-relaxed">
                  {approval.reason}
                </p>
              )}
              {formattedArgs && (
                <pre className="mt-1.5 max-h-28 overflow-auto rounded-lg border border-amber-200/80 bg-white/80 p-2 font-mono text-[11px] text-zinc-800">
                  {formattedArgs}
                </pre>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => onDecision("reject")}
              className="h-7 px-2.5 text-xs border-zinc-300 bg-white hover:bg-zinc-100 text-zinc-800"
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Reject
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isSubmitting}
              onClick={() => onDecision("approve")}
              className="h-7 px-2.5 text-xs bg-zinc-900 hover:bg-zinc-800 text-white"
            >
              <Check className="w-3.5 h-3.5 mr-1" />
              Approve
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
