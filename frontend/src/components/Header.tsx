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

      {/* Right: Quick Actions & Profile */}
      <div className="flex items-center gap-2.5">
        {/* Global Settings */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSettings}
          title="Platform Settings & Credentials"
          className="h-7 w-7 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-md shrink-0"
        >
          <Settings className="w-4 h-4" />
        </Button>

        {/* User Profile Avatar */}
        <div className="flex items-center gap-2 pl-2 border-l border-zinc-200">
          <div className="w-6 h-6 rounded-full bg-zinc-900 text-white flex items-center justify-center font-medium text-[11px]">
            CH
          </div>
        </div>
      </div>
    </header>
  );
};
