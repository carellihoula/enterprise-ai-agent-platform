"use client";

/**
 * Top Global Navigation Header following the Enterprise SaaS AI Agent Platform specification.
 * Houses workspace context, global ⌘K search trigger, model status, and user profile.
 */

import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Plus,
  Settings,
  Sparkles,
  ChevronDown,
  Building2,
  ShieldCheck,
  PanelLeftOpen,
  PanelLeftClose,
  LogOut,
} from "lucide-react";
import { ModelConfigState } from "@/types/chat";
import { useAuth } from "@/contexts/AuthContext";

interface HeaderProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenCommandPalette: () => void;
  onOpenSettings: () => void;
  onOpenAgentBuilder: () => void;
  modelConfig: ModelConfigState;
}

export const Header: React.FC<HeaderProps> = ({
  isSidebarOpen,
  onToggleSidebar,
  onOpenCommandPalette,
  onOpenSettings,
  onOpenAgentBuilder,
  modelConfig,
}) => {
  const { user, activeWorkspace, activeRole, logout } = useAuth();
  const initials = (user?.full_name || user?.email || "U")
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");

  return (
    <header className="h-12 px-4 flex items-center justify-between bg-white z-20 shrink-0">
      {/* Left: Re-open Sidebar Toggle & Quick Search when sidebar is closed */}
      <div className="flex items-center gap-2">
        {!isSidebarOpen && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleSidebar}
              title="Ouvrir la barre latérale"
              className="h-8 w-8 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-md shrink-0"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onOpenCommandPalette}
              title="Search (⌘K)"
              className="h-8 w-8 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-md shrink-0"
            >
              <Search className="w-4 h-4" />
            </Button>
          </>
        )}
      </div>

      {/* Right: Workspace Context, Quick Actions & Profile */}
      <div className="flex items-center gap-2.5">
        {activeWorkspace && (
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenSettings}
            title="Workspace Settings, Members & Invitations"
            className="h-7 px-2.5 gap-1.5 border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 rounded-md text-xs font-medium shadow-none cursor-pointer"
          >
            <Building2 className="w-3.5 h-3.5 text-zinc-500" />
            <span className="max-w-[140px] truncate">{activeWorkspace.name}</span>
            {activeRole && (
              <span className="text-[10px] text-zinc-400 capitalize">· {activeRole}</span>
            )}
          </Button>
        )}

        {/* Global Settings */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSettings}
          title="Workspace Settings & Members"
          className="h-7 w-7 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-md shrink-0 cursor-pointer"
        >
          <Settings className="w-4 h-4" />
        </Button>

        {/* User Profile Avatar & Sign Out */}
        <div className="flex items-center gap-2 pl-2 border-l border-zinc-200">
          <div
            title={user?.email || "Authenticated User"}
            className="w-6 h-6 rounded-full bg-zinc-900 text-white flex items-center justify-center font-medium text-[11px]"
          >
            {initials || "U"}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={logout}
            title="Sign Out"
            aria-label="Sign Out"
            className="h-7 w-7 text-zinc-500 hover:text-red-600 hover:bg-red-50 rounded-md shrink-0 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </header>
  );
};
