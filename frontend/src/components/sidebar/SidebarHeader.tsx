import React from "react";
import { Button } from "@/components/ui/button";
import { PanelLeftClose } from "lucide-react";

interface SidebarHeaderProps {
  onToggleSidebar?: () => void;
}

/**
 * Top header of the Sidebar housing the sidebar collapse toggle action.
 */
export const SidebarHeader: React.FC<SidebarHeaderProps> = ({ onToggleSidebar }) => {
  return (
    <div className="h-12 px-3 flex items-center justify-between shrink-0">
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleSidebar}
        title="Fermer la barre latérale"
        className="h-8 w-8 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-md"
      >
        <PanelLeftClose className="w-4 h-4" />
      </Button>
    </div>
  );
};
