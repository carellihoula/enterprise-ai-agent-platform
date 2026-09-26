'use client';

/**
 * CommandPalette component implementing quick navigation and action dispatching (⌘K / Ctrl+K)
 * using cmdk and shadcn/ui dialog primitives.
 */

import React, { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Bot,
  Brain,
  Cpu,
  Database,
  FileCode,
  FolderGit2,
  Home,
  Network,
  Plus,
  Search,
  Settings,
  Sparkles,
  Workflow,
  Wrench,
} from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (section: string) => void;
  onOpenSettings: () => void;
  onOpenAgentBuilder: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onOpenSettings,
  onOpenAgentBuilder,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl p-0 overflow-hidden bg-white border-zinc-200 shadow-2xl rounded-2xl">
        <Command className="flex flex-col w-full text-zinc-900">
          <div className="flex items-center px-4 border-b border-zinc-200 gap-2.5">
            <Search className="w-4 h-4 text-zinc-400 shrink-0" />
            <Command.Input
              placeholder="Search agents, workflows, knowledge, models, or actions... (⌘K)"
              className="w-full py-3 text-xs bg-transparent focus:outline-none placeholder:text-zinc-400 font-sans"
            />
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-2 space-y-1 text-xs">
            <Command.Empty className="p-4 text-center text-xs text-zinc-400">
              No matching results found.
            </Command.Empty>

            {/* Quick Actions Group */}
            <Command.Group heading="Quick Actions" className="px-2 py-1 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              <Command.Item
                onSelect={() => {
                  onClose();
                  onOpenAgentBuilder();
                }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer hover:bg-zinc-100 aria-selected:bg-indigo-50 aria-selected:text-indigo-900 transition-colors"
              >
                <div className="p-1 bg-indigo-50 rounded-lg text-indigo-600">
                  <Plus className="w-3.5 h-3.5" />
                </div>
                <span className="font-medium text-zinc-800">Create new AI Agent</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  onClose();
                  onOpenSettings();
                }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer hover:bg-zinc-100 aria-selected:bg-indigo-50 aria-selected:text-indigo-900 transition-colors"
              >
                <div className="p-1 bg-amber-50 rounded-lg text-amber-600">
                  <Settings className="w-3.5 h-3.5" />
                </div>
                <span className="font-medium text-zinc-800">Configure Model Providers & Credentials</span>
              </Command.Item>
            </Command.Group>

            {/* Workspace Navigation Group */}
            <Command.Group heading="Workspace Navigation" className="px-2 py-1 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              <Command.Item
                onSelect={() => {
                  onClose();
                  onNavigate('home');
                }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer hover:bg-zinc-100 aria-selected:bg-zinc-100 transition-colors"
              >
                <Home className="w-3.5 h-3.5 text-zinc-500" />
                <span>Dashboard (Home)</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  onClose();
                  onNavigate('agents');
                }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer hover:bg-zinc-100 aria-selected:bg-zinc-100 transition-colors"
              >
                <Bot className="w-3.5 h-3.5 text-indigo-600" />
                <span>AI Agents</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  onClose();
                  onNavigate('workflows');
                }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer hover:bg-zinc-100 aria-selected:bg-zinc-100 transition-colors"
              >
                <Workflow className="w-3.5 h-3.5 text-purple-600" />
                <span>Workflows & Multi-Agent</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  onClose();
                  onNavigate('knowledge');
                }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer hover:bg-zinc-100 aria-selected:bg-zinc-100 transition-colors"
              >
                <Database className="w-3.5 h-3.5 text-emerald-600" />
                <span>Knowledge Bases & RAG</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  onClose();
                  onNavigate('tools');
                }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer hover:bg-zinc-100 aria-selected:bg-zinc-100 transition-colors"
              >
                <Wrench className="w-3.5 h-3.5 text-blue-600" />
                <span>Tools & APIs</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  onClose();
                  onNavigate('mcp');
                }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer hover:bg-zinc-100 aria-selected:bg-zinc-100 transition-colors"
              >
                <Network className="w-3.5 h-3.5 text-rose-600" />
                <span>MCP Servers</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  onClose();
                  onNavigate('models');
                }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer hover:bg-zinc-100 aria-selected:bg-zinc-100 transition-colors"
              >
                <Cpu className="w-3.5 h-3.5 text-teal-600" />
                <span>Models & Providers</span>
              </Command.Item>
            </Command.Group>
          </Command.List>

          <div className="px-4 py-2 border-t border-zinc-100 bg-zinc-50 flex items-center justify-between text-[11px] text-zinc-400">
            <span>Navigation: <kbd className="font-mono bg-white border border-zinc-200 px-1 py-0.5 rounded">↑</kbd> <kbd className="font-mono bg-white border border-zinc-200 px-1 py-0.5 rounded">↓</kbd></span>
            <span>Select: <kbd className="font-mono bg-white border border-zinc-200 px-1.5 py-0.5 rounded">↵ Enter</kbd></span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
};
