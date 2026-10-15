import React from "react";
import { cn } from "@/lib/utils";
import { NavTabId, WORKSPACE_ITEMS, DEVELOPER_ITEMS } from "./types";

interface SidebarNavListProps {
  activeTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
}

/**
 * Presentational navigation list for Workspace and Developer groups.
 */
export const SidebarNavList: React.FC<SidebarNavListProps> = ({
  activeTab,
  onSelectTab,
}) => {
  return (
    <div className="space-y-4">
      {/* Workspace Group */}
      <div>
        <div className="px-2 pb-1.5 text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
          Workspace
        </div>
        <nav className="space-y-0.5">
          {WORKSPACE_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={cn(
                  "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors group cursor-pointer",
                  isActive
                    ? "bg-zinc-100 text-zinc-900 font-medium"
                    : "text-zinc-600 hover:bg-zinc-100/60 hover:text-zinc-900",
                )}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Icon
                    className={cn(
                      "w-4 h-4 shrink-0 transition-colors",
                      isActive
                        ? "text-zinc-900"
                        : "text-zinc-400 group-hover:text-zinc-700",
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.2 rounded-full font-mono font-medium",
                      isActive
                        ? "bg-zinc-900 text-white"
                        : "bg-zinc-100 text-zinc-600 border border-zinc-200/60",
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Developer Group */}
      <div>
        <div className="px-2 pb-1.5 text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
          Developer
        </div>
        <nav className="space-y-0.5">
          {DEVELOPER_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={cn(
                  "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors group cursor-pointer",
                  isActive
                    ? "bg-zinc-100 text-zinc-900 font-medium"
                    : "text-zinc-600 hover:bg-zinc-100/60 hover:text-zinc-900",
                )}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Icon
                    className={cn(
                      "w-4 h-4 shrink-0 transition-colors",
                      isActive
                        ? "text-zinc-900"
                        : "text-zinc-400 group-hover:text-zinc-700",
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                </div>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};
