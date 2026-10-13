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
} from "lucide-react";
import { ModelConfigState } from "@/types/chat";

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
  return (
    <header className="h-14 border-b border-zinc-200/80 px-4 flex items-center justify-between bg-white/95 backdrop-blur-sm z-20 shrink-0">
      {/* Left: Sidebar Toggle & Workspace Context */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          className="h-8 w-8 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg shrink-0"
        >
          {isSidebarOpen ? (
            <PanelLeftClose className="w-4 h-4" />
          ) : (
            <PanelLeftOpen className="w-4 h-4" />
          )}
        </Button>
      </div>

      {/* Center: Search Command Palette Trigger */}
      <div className="flex-1 max-w-md mx-4">
        <button
          onClick={onOpenCommandPalette}
          className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-zinc-400 bg-zinc-50/80 hover:bg-zinc-100/90 border border-zinc-200/80 rounded-xl transition-all shadow-2xs group"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-600 transition-colors" />
            <span className="text-zinc-500 font-normal">
              Search agents, workflows, models...
            </span>
          </div>
          <div className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-medium text-zinc-500 bg-white border border-zinc-200 rounded shadow-2xs">
              ⌘K
            </kbd>
          </div>
        </button>
      </div>

      {/* Right: Quick Actions & Profile */}
      <div className="flex items-center gap-2.5">
        {/* Global Settings */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSettings}
          title="Platform Settings & Credentials"
          className="h-8 w-8 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg shrink-0"
        >
          <Settings className="w-4 h-4" />
        </Button>

        {/* User Profile Avatar */}
        <div className="flex items-center gap-2 pl-2 border-l border-zinc-200">
          <div className="w-7 h-7 rounded-full bg-zinc-800 text-white flex items-center justify-center font-medium text-xs shadow-sm">
            CH
          </div>
        </div>
      </div>
    </header>
  );
};
