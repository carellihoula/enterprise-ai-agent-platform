import React from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SidebarFooterProps {
  onOpenSettings: () => void;
}

/**
 * Bottom section of Sidebar containing system settings trigger and version attribution.
 */
export const SidebarFooter: React.FC<SidebarFooterProps> = ({ onOpenSettings }) => {
  return (
    <div className="p-3 border-t border-zinc-200 space-y-2 shrink-0">
      <Button
        variant="outline"
        size="sm"
        onClick={onOpenSettings}
        className="w-full justify-start gap-2 border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-800 rounded-md text-xs font-medium shadow-none cursor-pointer"
      >
        <Settings className="w-3.5 h-3.5 text-zinc-500" />
        <span>Settings</span>
      </Button>

      <div className="text-[10px] text-zinc-400 px-1 flex items-center justify-between">
        <span>Enterprise Cloud</span>
        <span className="font-mono text-zinc-500">v0.2.0</span>
      </div>
    </div>
  );
};
