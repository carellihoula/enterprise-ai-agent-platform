"use client";

import React from "react";
import { LogOut, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

interface SidebarFooterProps {
  onOpenSettings: () => void;
}

/**
 * Bottom section of Sidebar containing system settings trigger, sign-out button, and version attribution.
 */
export const SidebarFooter: React.FC<SidebarFooterProps> = ({ onOpenSettings }) => {
  const { user, activeWorkspace, logout } = useAuth();

  return (
    <div className="p-3 border-t border-zinc-200 space-y-2 shrink-0">
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenSettings}
          className="flex-1 justify-start gap-2 border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-800 rounded-md text-xs font-medium shadow-none cursor-pointer"
        >
          <Settings className="w-3.5 h-3.5 text-zinc-500" />
          <span>Settings</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={logout}
          title="Sign Out"
          aria-label="Sign Out"
          className="px-2.5 border-zinc-200 bg-white hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-zinc-600 rounded-md text-xs shadow-none cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="text-[10px] text-zinc-400 px-1 flex items-center justify-between gap-2">
        <span className="truncate">{activeWorkspace?.name || user?.email || "Enterprise Cloud"}</span>
        <span className="font-mono text-zinc-500 shrink-0">v0.2.0</span>
      </div>
    </div>
  );
};
