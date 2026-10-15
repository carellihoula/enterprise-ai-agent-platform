import React, { memo } from "react";
import { MessageSquare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Session } from "@/types/chat";

interface SidebarSessionItemProps {
  session: Session;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
}

const BaseSidebarSessionItem: React.FC<SidebarSessionItemProps> = ({
  session,
  isSelected,
  onSelect,
  onDelete,
}) => {
  return (
    <div
      onClick={() => onSelect(session.id)}
      className={cn(
        "group relative flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors cursor-pointer",
        isSelected
          ? "bg-zinc-100 text-zinc-900 font-medium"
          : "text-zinc-600 hover:bg-zinc-100/60 hover:text-zinc-900",
      )}
    >
      <MessageSquare
        className={cn(
          "w-3 h-3 shrink-0",
          isSelected ? "text-zinc-900" : "text-zinc-400",
        )}
      />
      <span className="truncate flex-1 pr-4 text-[11px]">{session.title}</span>
      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => onDelete(session.id, e)}
        title="Delete conversation"
        className="opacity-0 group-hover:opacity-100 h-5 w-5 text-zinc-400 hover:text-rose-600 hover:bg-zinc-100 rounded shrink-0"
      >
        <Trash2 className="w-3 h-3" />
      </Button>
    </div>
  );
};

// [Performance] Memoize to avoid re-rendering entire conversation list on selection
export const SidebarSessionItem = memo(BaseSidebarSessionItem, (prev, next) => {
  return (
    prev.session.id === next.session.id &&
    prev.session.title === next.session.title &&
    prev.isSelected === next.isSelected
  );
});
