"use client";

import React, { useCallback, useEffect, useState } from "react";
import { UserPlus, Trash2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  createWorkspaceInvitation,
  listWorkspaceMembers,
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
} from "@/lib/api";
import { WorkspaceMemberDto } from "@/types/auth";

interface WorkspaceMembersTabProps {
  workspaceId: string;
  currentUserId: string;
  canManageMembers: boolean;
}

const ROLES = ["owner", "admin", "builder", "member", "viewer"] as const;

export const WorkspaceMembersTab: React.FC<WorkspaceMembersTabProps> = ({
  workspaceId,
  currentUserId,
  canManageMembers,
}) => {
  const [members, setMembers] = useState<WorkspaceMemberDto[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    try {
      const data = await listWorkspaceMembers(workspaceId);
      setMembers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load members");
    }
  }, [workspaceId]);

  useEffect(() => {
    let active = true;
    listWorkspaceMembers(workspaceId)
      .then((data) => {
        if (active) setMembers(data);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load members");
      });
    return () => {
      active = false;
    };
  }, [workspaceId]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setGeneratedToken(null);
    try {
      const inv = await createWorkspaceInvitation(workspaceId, inviteEmail, inviteRole);
      setGeneratedToken(inv.invite_token);
      setInviteEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invitation failed");
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    setError(null);
    try {
      await updateWorkspaceMemberRole(workspaceId, userId, role);
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Role update failed");
    }
  };

  const handleRemove = async (userId: string) => {
    setError(null);
    try {
      await removeWorkspaceMember(workspaceId, userId);
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member");
    }
  };

  const copyToken = () => {
    if (!generatedToken) return;
    navigator.clipboard.writeText(generatedToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-5">
      {error && (
        <div className="p-2.5 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}

      {canManageMembers && (
        <form
          onSubmit={handleInvite}
          className="p-4 rounded-lg border border-zinc-200 bg-zinc-50/70 space-y-3"
        >
          <div className="text-xs font-medium text-zinc-700 flex items-center gap-1.5">
            <UserPlus className="w-3.5 h-3.5" />
            <span>Invite Team Member</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="flex-1 min-w-[200px] h-8 text-xs bg-white"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="h-8 px-2.5 rounded-md border border-zinc-200 bg-white text-xs text-zinc-800"
            >
              <option value="admin">Admin</option>
              <option value="builder">Builder</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
            <Button type="submit" size="sm" className="h-8 text-xs bg-zinc-900 text-white cursor-pointer">
              Generate Invite
            </Button>
          </div>
          {generatedToken && (
            <div className="flex items-center justify-between gap-2 p-2 rounded bg-white border border-zinc-200 text-xs">
              <span className="font-mono truncate text-zinc-700">{generatedToken}</span>
              <Button type="button" variant="outline" size="sm" onClick={copyToken} className="h-7 px-2 text-xs">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            </div>
          )}
        </form>
      )}

      <div className="border border-zinc-200 rounded-lg divide-y divide-zinc-200 bg-white">
        {members.map((m) => (
          <div key={m.user_id} className="p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-zinc-900 truncate">
                {m.full_name || m.email}
                {m.user_id === currentUserId && (
                  <span className="ml-2 text-[11px] text-zinc-400">(you)</span>
                )}
              </div>
              <div className="text-xs text-zinc-500 truncate">{m.email}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {canManageMembers && m.user_id !== currentUserId ? (
                <select
                  value={m.role}
                  onChange={(e) => handleRoleChange(m.user_id, e.target.value)}
                  className="h-8 px-2 rounded-md border border-zinc-200 bg-white text-xs text-zinc-800"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              ) : (
                <Badge variant="secondary" className="text-xs capitalize">
                  {m.role}
                </Badge>
              )}
              {canManageMembers && m.user_id !== currentUserId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemove(m.user_id)}
                  className="h-8 w-8 p-0 text-zinc-400 hover:text-red-600 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
