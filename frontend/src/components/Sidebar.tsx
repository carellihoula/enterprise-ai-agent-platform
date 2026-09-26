'use client';

/**
 * Sidebar component with light theme design.
 */

import React from 'react';
import { Session } from '@/types/chat';
import { Button } from '@/components/ui/button';
import { MessageSquare, Plus, Trash2, Bot, Sparkles, PanelLeftClose, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  sessions: Session[];
  currentSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string, e: React.MouseEvent) => void;
  isLoadingSessions: boolean;
  onToggleSidebar: () => void;
  onOpenSettings?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  sessions,
  currentSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  isLoadingSessions,
  onToggleSidebar,
  onOpenSettings,
}) => {
  return (
    <aside className="w-64 bg-zinc-50 border-r border-zinc-200 flex flex-col h-full text-zinc-800 select-none shrink-0 transition-all duration-200">
      {/* Platform Header */}
      <div className="p-3.5 border-b border-zinc-200 flex items-center justify-between">
        <div className="flex items-center gap-2.5 font-semibold text-sm">
          <div className="p-1.5 bg-indigo-600 rounded-lg text-white shadow-sm shadow-indigo-500/30">
            <Bot className="w-4 h-4" />
          </div>
          <span className="font-semibold text-zinc-900 tracking-tight">
            AI Platform
          </span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          title="Close sidebar"
          className="h-8 w-8 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/60"
        >
          <PanelLeftClose className="w-4 h-4" />
        </Button>
      </div>

      {/* New Chat Button */}
      <div className="p-3">
        <Button
          onClick={onNewSession}
          variant="outline"
          className="w-full justify-start gap-2 border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-800 rounded-xl text-xs font-medium shadow-sm"
        >
          <Plus className="w-4 h-4 text-zinc-600" />
          <span>New chat</span>
        </Button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        <div className="px-3 py-2 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
          Conversations
        </div>

        {isLoadingSessions ? (
          <div className="p-4 text-center text-xs text-zinc-400 animate-pulse">
            Loading chats...
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-center text-xs text-zinc-400">
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
                  'group relative flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-all duration-150 cursor-pointer',
                  isSelected
                    ? 'bg-zinc-200/80 text-zinc-900 font-medium'
                    : 'text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900'
                )}
              >
                <MessageSquare className={cn('w-3.5 h-3.5 shrink-0', isSelected ? 'text-indigo-600' : 'text-zinc-400')} />
                <span className="truncate flex-1 pr-6">{session.title}</span>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => onDeleteSession(session.id, e)}
                  title="Delete conversation"
                  className="absolute right-1.5 opacity-0 group-hover:opacity-100 h-6 w-6 text-zinc-400 hover:text-rose-600 hover:bg-zinc-200"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Specs & Settings */}
      <div className="p-3 border-t border-zinc-200 flex flex-col gap-2">
        {onOpenSettings && (
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenSettings}
            className="w-full justify-start gap-2 border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 rounded-xl text-xs font-medium shadow-sm"
          >
            <Settings className="w-4 h-4 text-zinc-500" />
            <span>Settings & Models</span>
          </Button>
        )}
        <div className="text-[11px] text-zinc-400 px-1 flex items-center justify-between">
          <span>Enterprise AI Platform</span>
          <span>v0.1</span>
        </div>
      </div>
    </aside>
  );
};
