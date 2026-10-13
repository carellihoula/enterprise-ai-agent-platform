"use client";

/**
 * Dashboard (Home) view conforming strictly to Section 4 of interface.md.
 * Features greeting banner, key enterprise metrics, agent cards with status and infrastructure tags,
 * and quick actions for agent creation and provider connectivity.
 */

import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Bot,
  Workflow,
  Database,
  Cpu,
  Plus,
  ArrowUpRight,
  Sparkles,
  ShieldCheck,
  Clock,
  ChevronRight,
  ExternalLink,
  Layers,
  Play,
  Key,
} from "lucide-react";
import { NavTabId } from "@/components/Sidebar";

interface DashboardViewProps {
  onNavigate: (tab: NavTabId) => void;
  onOpenAgentBuilder: () => void;
  onOpenSettings: () => void;
  onLaunchAgentChat: (agentName: string) => void;
}

interface AgentCardData {
  id: string;
  name: string;
  category: string;
  status: "active" | "draft" | "idle";
  modelBadge: string;
  ragSource?: string;
  toolsCount: number;
  updatedAt: string;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onOpenAgentBuilder,
  onOpenSettings,
  onLaunchAgentChat,
}) => {
  return (
    <div className="flex-1 overflow-y-auto bg-white p-6 md:p-8 space-y-8 max-w-7xl mx-auto w-full">
      {/* Top Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-100 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
              Good morning, Carel
            </h1>
            <Badge
              variant="subtle"
              className="text-[11px] font-normal text-zinc-500"
            >
              Enterprise Admin
            </Badge>
          </div>
          <p className="text-xs text-zinc-500 max-w-xl">
            The platform provides the experience. Your enterprise keeps total
            control of the models, data, and infrastructure.
          </p>
        </div>

        {/* Quick CTA Actions */}
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenSettings}
            className="rounded-xl border-zinc-200 text-xs font-medium h-9 gap-1.5 shadow-2xs hover:bg-zinc-50"
          >
            <Key className="w-3.5 h-3.5 text-zinc-500" />
            <span>Connect Provider</span>
          </Button>

          <Button
            size="sm"
            onClick={onOpenAgentBuilder}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-medium h-9 gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Agent</span>
          </Button>
        </div>
      </div>

      {/* 4 Core Platform Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Agents */}
        <Card
          onClick={() => onNavigate("agents")}
          className="p-4 cursor-pointer hover:border-zinc-300 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500">
              Total Agents
            </span>
            <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600 group-hover:scale-105 transition-transform">
              <Bot className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-zinc-900">12</span>
            <span className="text-[11px] font-medium text-emerald-600 flex items-center">
              +2 active this week
            </span>
          </div>
          <div className="mt-2 flex items-center text-[11px] text-zinc-400 group-hover:text-zinc-600">
            <span>Manage agent catalog</span>
            <ChevronRight className="w-3 h-3 ml-0.5" />
          </div>
        </Card>

        {/* Metric 2: Active Workflows */}
        <Card
          onClick={() => onNavigate("workflows")}
          className="p-4 cursor-pointer hover:border-zinc-300 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500">
              Active Workflows
            </span>
            <div className="p-1.5 bg-purple-50 rounded-lg text-purple-600 group-hover:scale-105 transition-transform">
              <Workflow className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-zinc-900">5</span>
            <span className="text-[11px] font-medium text-zinc-500">
              Multi-agent pipelines
            </span>
          </div>
          <div className="mt-2 flex items-center text-[11px] text-zinc-400 group-hover:text-zinc-600">
            <span>View orchestrations</span>
            <ChevronRight className="w-3 h-3 ml-0.5" />
          </div>
        </Card>

        {/* Metric 3: Knowledge Bases */}
        <Card
          onClick={() => onNavigate("knowledge")}
          className="p-4 cursor-pointer hover:border-zinc-300 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500">
              Knowledge Bases
            </span>
            <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600 group-hover:scale-105 transition-transform">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-zinc-900">8</span>
            <span className="text-[11px] font-medium text-zinc-500">
              Vector & hybrid RAG
            </span>
          </div>
          <div className="mt-2 flex items-center text-[11px] text-zinc-400 group-hover:text-zinc-600">
            <span>Explore data sources</span>
            <ChevronRight className="w-3 h-3 ml-0.5" />
          </div>
        </Card>

        {/* Metric 4: Connected Providers */}
        <Card
          onClick={() => onNavigate("models")}
          className="p-4 cursor-pointer hover:border-zinc-300 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500">
              Connected Providers
            </span>
            <div className="p-1.5 bg-teal-50 rounded-lg text-teal-600 group-hover:scale-105 transition-transform">
              <Cpu className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-zinc-900">4</span>
            <span className="text-[11px] font-medium text-emerald-600">
              All systems online
            </span>
          </div>
          <div className="mt-2 flex items-center text-[11px] text-zinc-400 group-hover:text-zinc-600">
            <span>Model gateway status</span>
            <ChevronRight className="w-3 h-3 ml-0.5" />
          </div>
        </Card>
      </div>

      {/* Your Agents Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 tracking-tight">
              Your Agents
            </h2>
            <p className="text-xs text-zinc-500">
              Recently deployed and active agents in this workspace.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigate("agents")}
            className="text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 font-medium gap-1"
          >
            <span>View all agents</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Infrastructure & Security Sovereignty Banner */}
      <div className="p-4 rounded-2xl bg-zinc-50/80 border border-zinc-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-zinc-900 text-white flex items-center justify-center shrink-0 shadow-sm">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-zinc-900">
              Enterprise Infrastructure Sovereignty
            </h4>
            <p className="text-[11px] text-zinc-500">
              API credentials, custom LLMs (vLLM / Ollama), and PostgreSQL
              vector databases reside securely in your VPC or local host.
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onNavigate("models")}
          className="rounded-xl border-zinc-200 bg-white text-xs font-medium text-zinc-700 shadow-2xs hover:bg-zinc-100 shrink-0"
        >
          <span>View Gateway Providers</span>
          <ChevronRight className="w-3.5 h-3.5 ml-1 text-zinc-400" />
        </Button>
      </div>
    </div>
  );
};
