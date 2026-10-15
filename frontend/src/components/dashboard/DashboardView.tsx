"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
  Bot,
  Workflow,
  Database,
  Cpu,
  Plus,
  Key,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import { NavTabId } from "@/components/Sidebar";

interface DashboardViewProps {
  onNavigate: (tab: NavTabId) => void;
  onOpenAgentBuilder: () => void;
  onOpenSettings: () => void;
  onLaunchAgentChat: (agentName: string) => void;
}

/**
 * Clean, minimalistic GitHub-styled dashboard overview.
 */
export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onOpenAgentBuilder,
  onOpenSettings,
}) => {
  return (
    <div className="flex-1 overflow-y-auto bg-white p-4 sm:p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Header Bar */}
        <div className="flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row pb-5 border-b border-zinc-200">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">
              Good morning, Carel
            </h1>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenSettings}
              className="rounded-md border-zinc-200 text-xs font-medium h-8 gap-1.5 shadow-none hover:bg-zinc-50 cursor-pointer"
            >
              <Key className="w-3.5 h-3.5 text-zinc-500" />
              <span>Connect Provider</span>
            </Button>

            <Button
              size="sm"
              onClick={onOpenAgentBuilder}
              className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-md text-xs font-medium h-8 gap-1.5 shadow-none transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-white" />
              <span>Create Agent</span>
            </Button>
          </div>
        </div>

        {/* 4 Core Platform Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Metric 1: Agents */}
          <div
            onClick={() => onNavigate("agents")}
            className="p-3.5 rounded-md border border-zinc-200 bg-white hover:border-zinc-300 transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Total Agents</span>
              <Bot className="w-3.5 h-3.5 text-zinc-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-bold text-zinc-900">12</span>
              <span className="text-[11px] font-mono text-zinc-400">+2 active this week</span>
            </div>
          </div>

          {/* Metric 2: Active Workflows */}
          <div
            onClick={() => onNavigate("workflows")}
            className="p-3.5 rounded-md border border-zinc-200 bg-white hover:border-zinc-300 transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Active Workflows</span>
              <Workflow className="w-3.5 h-3.5 text-zinc-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-bold text-zinc-900">5</span>
              <span className="text-[11px] font-mono text-zinc-400">Pipelines</span>
            </div>
          </div>

          {/* Metric 3: Knowledge Bases */}
          <div
            onClick={() => onNavigate("knowledge")}
            className="p-3.5 rounded-md border border-zinc-200 bg-white hover:border-zinc-300 transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Knowledge Bases</span>
              <Database className="w-3.5 h-3.5 text-zinc-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-bold text-zinc-900">8</span>
              <span className="text-[11px] font-mono text-zinc-400">RAG Sources</span>
            </div>
          </div>

          {/* Metric 4: Connected Providers */}
          <div
            onClick={() => onNavigate("models")}
            className="p-3.5 rounded-md border border-zinc-200 bg-white hover:border-zinc-300 transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Connected Providers</span>
              <Cpu className="w-3.5 h-3.5 text-zinc-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-bold text-zinc-900">4</span>
              <span className="text-[11px] font-mono text-zinc-400">Gateways online</span>
            </div>
          </div>
        </div>

        {/* Infrastructure & Security Sovereignty Banner */}
        <div className="p-4 rounded-md bg-zinc-50 border border-zinc-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-zinc-900 text-white flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-zinc-900">
                Enterprise Infrastructure Sovereignty
              </h4>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                API credentials, custom LLMs, and vector databases reside securely in your VPC or local host.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate("models")}
            className="rounded-md border-zinc-200 bg-white text-xs font-medium text-zinc-700 shadow-none hover:bg-zinc-100 shrink-0 cursor-pointer"
          >
            <span>View Gateway Providers</span>
            <ChevronRight className="w-3.5 h-3.5 ml-1 text-zinc-400" />
          </Button>
        </div>
      </div>
    </div>
  );
};
