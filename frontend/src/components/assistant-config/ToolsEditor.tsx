"use client";

import React, { useState } from "react";
import { Wrench, Plus, Trash2, Cpu, Terminal, Database, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ToolsEditorProps {
  tools: Array<Record<string, unknown>>;
  onChange: (tools: Array<Record<string, unknown>>) => void;
}

export const ToolsEditor: React.FC<ToolsEditorProps> = ({ tools, onChange }) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("builtin");
  const [description, setDescription] = useState("");

  const handleAdd = () => {
    if (!name.trim()) return;
    const newTool = {
      name: name.trim(),
      type,
      description: description.trim() || undefined,
    };
    onChange([...tools, newTool]);
    setName("");
    setType("builtin");
    setDescription("");
    setShowAddForm(false);
  };

  const handleRemove = (index: number) => {
    onChange(tools.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4 pb-6 border-b border-zinc-200">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 tracking-tight">
            Tools & Capabilities
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Attach action tools, RAG search, SQL database queries, or MCP server integrations.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setShowAddForm(!showAddForm)}
          className="text-xs gap-1.5 border-zinc-200 text-zinc-700 hover:bg-zinc-50 shadow-none"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Tool</span>
        </Button>
      </div>

      {showAddForm && (
        <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3.5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-zinc-700 block mb-1">
                Tool Name <span className="text-zinc-900">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., rag_search, execute_query, weather_lookup"
                className="w-full text-xs px-2.5 py-1.5 border border-zinc-300 rounded-md bg-white focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-700 block mb-1">
                Integration Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 border border-zinc-300 rounded-md bg-white focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 transition-colors"
              >
                <option value="builtin">Builtin (Native Python / Local Function)</option>
                <option value="rag">RAG / Documents (Vector / Semantic Search)</option>
                <option value="database">Database (SQL / Analytical Query)</option>
                <option value="mcp">MCP (Model Context Protocol)</option>
                <option value="api">REST API (HTTP Webhook)</option>
                <option value="custom">Custom Script</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-700 block mb-1">
              Tool Description (LLM Selection Instruction)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Searches internal documentation and returns relevant knowledge snippets"
              className="w-full text-xs px-2.5 py-1.5 border border-zinc-300 rounded-md bg-white focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 transition-colors"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setShowAddForm(false)}
              className="text-xs text-zinc-600 hover:text-zinc-900"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleAdd}
              disabled={!name.trim()}
              className="text-xs bg-zinc-900 text-white hover:bg-zinc-800 shadow-none"
            >
              Save Tool
            </Button>
          </div>
        </div>
      )}

      {tools.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-zinc-200 rounded-lg text-zinc-400 text-xs">
          No tools configured. Click &quot;Add Tool&quot; to attach capabilities to this agent.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {tools.map((tool, idx) => (
            <div
              key={String(tool.name || idx)}
              className="flex items-center justify-between p-3 border border-zinc-200 rounded-lg bg-white hover:bg-zinc-50 transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-1.5 bg-zinc-50 border border-zinc-200 rounded-md shrink-0">
                  {tool.type === "mcp" ? (
                    <Cpu className="w-3.5 h-3.5 text-indigo-600" />
                  ) : tool.type === "api" ? (
                    <Terminal className="w-3.5 h-3.5 text-emerald-600" />
                  ) : tool.type === "rag" ? (
                    <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                  ) : tool.type === "database" ? (
                    <Database className="w-3.5 h-3.5 text-amber-600" />
                  ) : (
                    <Wrench className="w-3.5 h-3.5 text-zinc-600" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-zinc-900 truncate">
                    {String(tool.name)}
                  </div>
                  <div className="text-[11px] text-zinc-500 truncate">
                    {String(tool.description || tool.type || "Tool")}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(idx)}
                title="Remove tool"
                className="text-zinc-400 hover:text-rose-600 p-1 rounded-md transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
