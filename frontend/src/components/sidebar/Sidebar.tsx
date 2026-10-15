"use client";

import React from "react";
import { SidebarProps } from "./types";
import { SidebarHeader } from "./SidebarHeader";
import { SidebarSearchBar } from "./SidebarSearchBar";
import { SidebarNavList } from "./SidebarNavList";
import { SidebarSessionDrawer } from "./SidebarSessionDrawer";
import { SidebarFooter } from "./SidebarFooter";

/**
 * Modular Sidebar container orchestrating header, search, navigation, sessions, and footer.
 */
export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  sessions,
  currentSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  isLoadingSessions,
  onOpenSettings,
  onToggleSidebar,
  onOpenCommandPalette,
}) => {
  return (
    <aside className="w-60 bg-zinc-50 border-r border-zinc-200/80 flex flex-col h-full text-zinc-800 select-none shrink-0 transition-all duration-200">
      <SidebarHeader onToggleSidebar={onToggleSidebar} />

      <SidebarSearchBar onOpenCommandPalette={onOpenCommandPalette} />

      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        <SidebarNavList activeTab={activeTab} onSelectTab={onSelectTab} />

        {activeTab === "chat" && (
          <SidebarSessionDrawer
            sessions={sessions}
            currentSessionId={currentSessionId}
            isLoadingSessions={isLoadingSessions}
            onSelectSession={onSelectSession}
            onNewSession={onNewSession}
            onDeleteSession={onDeleteSession}
          />
        )}
      </div>

      <SidebarFooter onOpenSettings={onOpenSettings} />
    </aside>
  );
};
