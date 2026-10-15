import React from "react";
import { Search } from "lucide-react";

interface SidebarSearchBarProps {
  onOpenCommandPalette?: () => void;
}

/**
 * Compact search bar trigger integrated into the top of the Sidebar.
 */
export const SidebarSearchBar: React.FC<SidebarSearchBarProps> = ({
  onOpenCommandPalette,
}) => {
  return (
    <div className="px-3 pb-2 shrink-0">
      <button
        type="button"
        onClick={onOpenCommandPalette}
        className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-zinc-400 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-md transition-colors group cursor-pointer shadow-xs"
      >
        <div className="flex items-center gap-2 truncate">
          <Search className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-700 shrink-0" />
          <span className="text-zinc-500 font-sans text-xs truncate">Search...</span>
        </div>
        <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.2 text-[10px] font-mono text-zinc-400 bg-zinc-50 border border-zinc-200 rounded shrink-0">
          <span>⌘</span>K
        </kbd>
      </button>
    </div>
  );
};
