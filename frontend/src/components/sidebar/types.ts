import React from "react";
import { Session } from "@/types/chat";
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
} from "lucide-react";

export type NavTabId =
  | "home"
  | "agents"
  | "workflows"
  | "knowledge"
  | "tools"
  | "mcp"
  | "models"
  | "chat"
  | "api"
  | "logs"
  | "usage"
  | "settings";

export interface NavItem {
  id: NavTabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

export interface SidebarProps {
  activeTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
  sessions: Session[];
  currentSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string, e: React.MouseEvent) => void;
  isLoadingSessions: boolean;
  onOpenSettings: () => void;
  onToggleSidebar?: () => void;
  onOpenCommandPalette?: () => void;
}

export const WORKSPACE_ITEMS: NavItem[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "workflows", label: "Workflows", icon: Workflow },
  { id: "knowledge", label: "Knowledge", icon: Database },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "mcp", label: "MCP", icon: Network },
  { id: "models", label: "Models", icon: Cpu },
  { id: "chat", label: "Playground", icon: Bot },
];

export const DEVELOPER_ITEMS: NavItem[] = [
  { id: "api", label: "API Keys", icon: Code2 },
  { id: "logs", label: "Logs & Traces", icon: Activity },
  { id: "usage", label: "Usage", icon: BarChart3 },
];
