"use client";

import React, { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { listWorkspaceAuditLogs } from "@/lib/api";
import { AuditLogDto } from "@/types/auth";

interface WorkspaceAuditTabProps {
  workspaceId: string;
}

export const WorkspaceAuditTab: React.FC<WorkspaceAuditTabProps> = ({ workspaceId }) => {
  const [logs, setLogs] = useState<AuditLogDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listWorkspaceAuditLogs(workspaceId, 50)
      .then(setLogs)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load audit logs"));
  }, [workspaceId]);

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-2.5 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="border border-zinc-200 rounded-lg divide-y divide-zinc-200 bg-white">
        {logs.length === 0 ? (
          <div className="p-6 text-xs text-zinc-500 text-center flex flex-col items-center gap-2">
            <ScrollText className="w-4 h-4 text-zinc-400" />
            <span>No audit events recorded yet.</span>
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="p-3 flex items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[11px]">
                    {log.action}
                  </Badge>
                  {log.resource_type && (
                    <span className="text-zinc-500 truncate">
                      {log.resource_type}
                      {log.resource_id ? `:${log.resource_id.slice(0, 8)}` : ""}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-zinc-400 font-mono truncate">
                  actor={log.actor_user_id?.slice(0, 8) || "system"} · ip={log.ip_address || "n/a"}
                </div>
              </div>
              <div className="text-[11px] text-zinc-400 shrink-0">
                {new Date(log.created_at).toLocaleString()}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
