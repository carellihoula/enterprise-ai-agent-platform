'use client';

/**
 * Sidebar navigation component matching Section 3 and Section 13 of interface.md.
 * Provides hierarchical navigation across Workspace, Developer tools, and System Settings.
 */

import React from 'react';
import { Session } from '@/types/chat';
import { Button } from '@/components/ui/button';
import {
  Home,
  Bot,
  Workflow,
  Database,
  Wrench,
  Network,
  Cpu,
  Code2,
  Activity,
  BarChart3,
  Settings,
  Plus,
  MessageSquare,
  Trash2,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type NavTabId =
  | 'home'
  | 'agents'
  | 'workflows'
  | 'knowledge'
  | 'tools'
  | 'mcp'
  | 'models'
  | 'chat'
  | 'api'
  | 'logs'
  | 'usage';

interface SidebarProps {
  activeTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
  sessions: Session[];
  currentSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string, e: React.MouseEvent) => void;
  isLoadingSessions: boolean;
  onOpenSettings: () => void;
}

interface NavItem {
  id: NavTabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const WORKSPACE_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'agents', label: 'Agents', icon: Bot, badge: '4' },
  { id: 'workflows', label: 'Workflows', icon: Workflow },
  { id: 'knowledge', label: 'Knowledge', icon: Database },
  { id: 'tools', label: 'Tools', icon: Wrench },
  { id: 'mcp', label: 'MCP', icon: Network },
  { id: 'models', label: 'Models', icon: Cpu },
  { id: 'chat', label: 'Playground', icon: MessageSquare },
];

const DEVELOPER_ITEMS: NavItem[] = [
  { id: 'api', label: 'API Keys', icon: Code2 },
  { id: 'logs', label: 'Logs & Traces', icon: Activity },
  { id: 'usage', label: 'Usage', icon: BarChart3 },
];

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
}) => {
  return (
    <aside className="w-60 bg-zinc-50 border-r border-zinc-200/80 flex flex-col h-full text-zinc-800 select-none shrink-0 transition-all duration-200">
      {/* Platform Branding */}
      <div className="p-3.5 border-b border-zinc-200/80 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm shadow-indigo-500/20">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-zinc-900 text-xs tracking-tight">
              Enterprise AI Core
            </span>
            <span className="text-[10px] text-zinc-400">Agent Studio</span>
          </div>
        </div>
      </div>

      {/* Main Navigation Sections */}
      <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4">
        {/* Workspace Group */}
        <div>
          <div className="px-2.5 pb-1.5 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
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
                    'w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all group',
                    isActive
                      ? 'bg-zinc-200/80 text-zinc-950 shadow-2xs font-semibold'
                      : 'text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900'
                  )}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon
                      className={cn(
                        'w-4 h-4 shrink-0 transition-colors',
                        isActive
                          ? 'text-indigo-600'
                          : 'text-zinc-500 group-hover:text-zinc-800'
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={cn(
                        'text-[10px] px-1.5 py-0.2 rounded-full font-medium',
                        isActive
                          ? 'bg-white text-indigo-700 shadow-2xs'
                          : 'bg-zinc-200/60 text-zinc-500'
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
          <div className="px-2.5 pb-1.5 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
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
                    'w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all group',
                    isActive
                      ? 'bg-zinc-200/80 text-zinc-950 shadow-2xs font-semibold'
                      : 'text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900'
                  )}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon
                      className={cn(
                        'w-4 h-4 shrink-0 transition-colors',
                        isActive
                          ? 'text-indigo-600'
                          : 'text-zinc-500 group-hover:text-zinc-800'
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Playground Session Drawer when Playground active */}
        {activeTab === 'chat' && (
          <div className="pt-2 border-t border-zinc-200/80">
            <div className="flex items-center justify-between px-2.5 pb-1">
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                Conversations
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={onNewSession}
                title="New chat"
                className="h-5 w-5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200"
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>

            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              {isLoadingSessions ? (
                <div className="p-2 text-center text-xs text-zinc-400 animate-pulse">
                  Loading chats...
                </div>
              ) : sessions.length === 0 ? (
                <div className="p-2 text-center text-xs text-zinc-400">
                  No chats yet
                </div>
              ) : (
                sessions.map((session) => {
                  const isSelected = session.id === currentSessionId;
                  return (
                    <div
                      key={session.id}
                      onClick={() => onSelectSession(session.id)}
                      className={cn(
                        'group relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer',
                        isSelected
                          ? 'bg-zinc-200/90 text-zinc-900 font-medium'
                          : 'text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900'
                      )}
                    >
                      <MessageSquare
                        className={cn(
                          'w-3 h-3 shrink-0',
                          isSelected ? 'text-indigo-600' : 'text-zinc-400'
                        )}
                      />
                      <span className="truncate flex-1 pr-4 text-[11px]">
                        {session.title}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => onDeleteSession(session.id, e)}
                        title="Delete conversation"
                        className="opacity-0 group-hover:opacity-100 h-5 w-5 text-zinc-400 hover:text-rose-600 hover:bg-zinc-200 shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Settings & Org specs */}
      <div className="p-3 border-t border-zinc-200/80 space-y-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenSettings}
          className="w-full justify-start gap-2 border-zinc-200/90 bg-white hover:bg-zinc-100 text-zinc-700 rounded-xl text-xs font-medium shadow-2xs"
        >
          <Settings className="w-3.5 h-3.5 text-zinc-500" />
          <span>Settings</span>
        </Button>

        <div className="text-[10px] text-zinc-400 px-1 flex items-center justify-between">
          <span>Enterprise Cloud</span>
          <span className="font-mono text-zinc-500">v0.2.0</span>
        </div>
      </div>
    </aside>
  );
};
