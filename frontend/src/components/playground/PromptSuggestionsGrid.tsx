import React from "react";
import { TableProperties, ShieldCheck, Workflow, Zap, Bot } from "lucide-react";

export const PROMPT_SUGGESTIONS = [
  {
    title: "Compare Vector DBs",
    subtitle: "Render a benchmark table of pgvector vs Milvus vs Pinecone",
    prompt:
      "Compare pgvector, Milvus, Qdrant, and Pinecone in a detailed Markdown table with columns: Provider, Architecture, Latency, Self-hosted support, and Best use case.",
    icon: TableProperties,
  },
  {
    title: "SOC2 & VPC Security",
    subtitle: "Audit compliance requirements for enterprise AI workloads",
    prompt:
      "Provide a structured SOC2 & ISO-27001 compliance checklist for deploying self-hosted LLMs and RAG pipelines in a corporate VPC.",
    icon: ShieldCheck,
  },
  {
    title: "Multi-Agent Workflow",
    subtitle: "Design an orchestrator pattern with Researcher and Reviewer",
    prompt:
      "Design a multi-agent orchestration architecture for automated code review, with role breakdown, message protocols, and fallback strategies.",
    icon: Workflow,
  },
  {
    title: "Streaming API Client",
    subtitle: "Generate a Python async client for streaming completions",
    prompt:
      "Write a Python FastAPI service that proxies LangChain streaming responses using Server-Sent Events (SSE) with error handling.",
    icon: Zap,
  },
];

interface PromptSuggestionsGridProps {
  onSelectPrompt: (promptText: string) => void;
}

/**
 * Empty-state prompt suggestions grid to bootstrap conversational workflows.
 */
export const PromptSuggestionsGrid: React.FC<PromptSuggestionsGridProps> = ({
  onSelectPrompt,
}) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[75%] text-center max-w-3xl mx-auto space-y-8 p-6">
      <div className="space-y-3">
        <div className="inline-flex p-2.5 bg-zinc-100 border border-zinc-200 rounded-xl text-zinc-900 shadow-none">
          <Bot className="w-6 h-6 text-zinc-900" />
        </div>
        <h2 className="text-xl font-semibold text-zinc-900 tracking-tight">
          What can I help with today?
        </h2>
        <p className="text-xs text-zinc-500 leading-relaxed max-w-md mx-auto">
          Test multi-turn agent interactions, compare complex schemas, render
          structured markdown tables, and review code.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full text-left">
        {PROMPT_SUGGESTIONS.map((item, idx) => {
          const Icon = item.icon;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectPrompt(item.prompt)}
              className="p-3 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 hover:border-zinc-300 transition-colors group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="text-xs font-medium text-zinc-900 group-hover:text-zinc-950 transition-colors">
                  {item.title}
                </span>
                <Icon className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-700 transition-colors" />
              </div>
              <span className="text-[11px] text-zinc-500 line-clamp-2">
                {item.subtitle}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
