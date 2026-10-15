import React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Session } from "@/types/chat";
import { SidebarSessionItem } from "./SidebarSessionItem";

interface SidebarSessionDrawerProps {
  sessions: Session[];
  currentSessionId: string | null;
  isLoadingSessions: boolean;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string, e: React.MouseEvent) => void;
}

/**
 * Drawer listing chat conversation sessions with creation and deletion actions.
 */
export const SidebarSessionDrawer: React.FC<SidebarSessionDrawerProps> = ({
  sessions,
  currentSessionId,
  isLoadingSessions,
  onSelectSession,
  onNewSession,
  onDeleteSession,
}) => {
  return (
    <div className="pt-2 border-t border-zinc-200">
      <div className="flex items-center justify-between px-2 pb-1">
        <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
          Conversations
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onNewSession}
          title="New chat"
          className="h-5 w-5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded"
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="space-y-0.5 max-h-48 overflow-y-auto">
        {isLoadingSessions ? (
          <div className="p-2 text-center text-xs text-zinc-400 animate-pulse font-mono">
            Loading chats...
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-2 text-center text-xs text-zinc-400">No chats yet</div>
        ) : (
          sessions.map((session) => (
            <SidebarSessionItem
              key={session.id}
              session={session}
              isSelected={session.id === currentSessionId}
              onSelect={onSelectSession}
              onDelete={onDeleteSession}
            />
          ))
        )}
      </div>
    </div>
  );
};
