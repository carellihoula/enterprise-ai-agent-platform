import React from "react";
import { Button } from "@/components/ui/button";
import {
  Bot,
  Workflow,
  Database,
  Wrench,
  Network,
  Cpu,
  Code2,
  Activity,
  BarChart3,
  ArrowRight,
} from "lucide-react";
import { NavTabId } from "@/components/Sidebar";

interface ModulePlaceholderViewProps {
  activeTab: NavTabId;
  onNavigateHome: () => void;
  onNavigatePlayground: () => void;
}

/**
 * Placeholder view for upcoming modules (agents, workflows, knowledge, etc.).
 */
export const ModulePlaceholderView: React.FC<ModulePlaceholderViewProps> = ({
  activeTab,
  onNavigateHome,
  onNavigatePlayground,
}) => {
  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-4xl mx-auto w-full flex flex-col justify-center items-center text-center space-y-5">
      <div className="w-12 h-12 rounded-md bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-900 shadow-xs">
        {activeTab === "agents" && <Bot className="w-6 h-6" />}
        {activeTab === "workflows" && <Workflow className="w-6 h-6" />}
        {activeTab === "knowledge" && <Database className="w-6 h-6" />}
        {activeTab === "tools" && <Wrench className="w-6 h-6" />}
        {activeTab === "mcp" && <Network className="w-6 h-6" />}
        {activeTab === "models" && <Cpu className="w-6 h-6" />}
        {activeTab === "api" && <Code2 className="w-6 h-6" />}
        {activeTab === "logs" && <Activity className="w-6 h-6" />}
        {activeTab === "usage" && <BarChart3 className="w-6 h-6" />}
      </div>

      <div className="space-y-1.5">
        <h3 className="text-lg font-bold text-zinc-900 capitalize">
          {activeTab} Management Module
        </h3>
        <p className="text-xs text-zinc-500 max-w-md">
          This module is next in sequence according to the step-by-step
          implementation roadmap of interface.md.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={onNavigateHome}
          className="rounded-md text-xs border-zinc-200 hover:bg-zinc-100"
        >
          Return to Dashboard
        </Button>
        <Button
          size="sm"
          onClick={onNavigatePlayground}
          className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-md text-xs gap-1.5"
        >
          <span>Open Playground</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
};
