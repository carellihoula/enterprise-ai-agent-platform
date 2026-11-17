"use client";

import React, { useState } from "react";
import { Building2, LogOut, Plus, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { acceptWorkspaceInvitation } from "@/lib/api";
import { WorkspaceMembersTab } from "./WorkspaceMembersTab";
import { WorkspaceApiKeysTab } from "./WorkspaceApiKeysTab";
import { WorkspaceAuditTab } from "./WorkspaceAuditTab";

export const WorkspaceSettingsView: React.FC = () => {
  const {
    user,
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    activeRole,
    hasPermission,
    switchWorkspace,
    createNewWorkspace,
    refreshProfile,
    logout,
  } = useAuth();

  const [newWsName, setNewWsName] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<"members" | "apikeys" | "audit">("members");

  if (!user || !activeWorkspaceId || !activeWorkspace) return null;

  const canManageMembers = hasPermission("members:manage");
  const canManageApiKeys = hasPermission("apikeys:manage");
  const canReadAudit = hasPermission("audit:read");

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    setStatusMsg(null);
    await createNewWorkspace(newWsName.trim(), "team");
    setNewWsName("");
    setStatusMsg("Workspace created and activated.");
  };

  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteToken.trim()) return;
    setStatusMsg(null);
    const joined = await acceptWorkspaceInvitation(inviteToken.trim());
    setInviteToken("");
    await refreshProfile();
    await switchWorkspace(joined.id);
    setStatusMsg(`Joined workspace '${joined.name}'.`);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-zinc-800" />
            <h1 className="text-lg font-semibold text-zinc-900">{activeWorkspace.name}</h1>
            <Badge variant="secondary" className="text-xs capitalize">
              {activeRole}
            </Badge>
            <Badge variant="outline" className="text-xs capitalize">
              {activeWorkspace.plan_tier}
            </Badge>
          </div>
          <p className="text-xs text-zinc-500">
            Signed in as <span className="font-medium text-zinc-700">{user.email}</span>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={logout} className="gap-1.5 text-xs cursor-pointer">
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </Button>
      </div>

      {statusMsg && (
        <div className="p-2.5 rounded-md bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">
          {statusMsg}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="p-4 rounded-lg border border-zinc-200 bg-white space-y-3">
          <div className="text-xs font-medium text-zinc-700 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" />
            <span>Switch or Create Team Workspace</span>
          </div>
          <select
            value={activeWorkspaceId}
            onChange={(e) => switchWorkspace(e.target.value)}
            className="w-full h-9 px-2.5 rounded-md border border-zinc-200 bg-white text-xs text-zinc-900"
          >
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.role} · {w.plan_tier})
              </option>
            ))}
          </select>
          <form onSubmit={handleCreateWorkspace} className="flex gap-2">
            <Input
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
              placeholder="New team workspace name"
              className="h-8 text-xs"
            />
            <Button type="submit" size="sm" className="h-8 text-xs gap-1 bg-zinc-900 text-white cursor-pointer">
              <Plus className="w-3.5 h-3.5" />
              <span>Create</span>
            </Button>
          </form>
        </div>

        <form
          onSubmit={handleAcceptInvite}
          className="p-4 rounded-lg border border-zinc-200 bg-white space-y-3"
        >
          <div className="text-xs font-medium text-zinc-700">Join Workspace via Invite Token</div>
          <div className="flex gap-2">
            <Input
              value={inviteToken}
              onChange={(e) => setInviteToken(e.target.value)}
              placeholder="inv_..."
              className="h-8 text-xs font-mono"
            />
            <Button type="submit" variant="outline" size="sm" className="h-8 text-xs cursor-pointer">
              Join
            </Button>
          </div>
        </form>
      </div>

      <div className="space-y-4 w-full">
        <TabsList>
          <TabsTrigger
            active={activeSubTab === "members"}
            onClick={() => setActiveSubTab("members")}
          >
            Members & Roles
          </TabsTrigger>
          {canManageApiKeys && (
            <TabsTrigger
              active={activeSubTab === "apikeys"}
              onClick={() => setActiveSubTab("apikeys")}
            >
              API Keys
            </TabsTrigger>
          )}
          {canReadAudit && (
            <TabsTrigger
              active={activeSubTab === "audit"}
              onClick={() => setActiveSubTab("audit")}
            >
              Audit Logs
            </TabsTrigger>
          )}
        </TabsList>

        {activeSubTab === "members" && (
          <WorkspaceMembersTab
            workspaceId={activeWorkspaceId}
            currentUserId={user.id}
            canManageMembers={canManageMembers}
          />
        )}

        {activeSubTab === "apikeys" && canManageApiKeys && (
          <WorkspaceApiKeysTab workspaceId={activeWorkspaceId} />
        )}

        {activeSubTab === "audit" && canReadAudit && (
          <WorkspaceAuditTab workspaceId={activeWorkspaceId} />
        )}
      </div>
    </div>
  );
};
