"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Braces,
  Calculator,
  Clock,
  FileSpreadsheet,
  FileText,
  Globe,
  Play,
  RefreshCw,
  Search,
  Wrench,
} from "lucide-react";
import {
  BuiltinToolDescriptor,
  BuiltinToolExecuteResult,
  fetchBuiltinTools,
  testBuiltinTool,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  get_current_datetime: Clock,
  calculator: Calculator,
  fetch_webpage: Globe,
  parse_csv_excel: FileSpreadsheet,
  extract_pdf_text: FileText,
  json_query: Braces,
  web_search: Search,
};

export function BuiltinToolsView() {
  const [tools, setTools] = useState<BuiltinToolDescriptor[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [filterQuery, setFilterQuery] = useState<string>("");
  const [activeTool, setActiveTool] = useState<BuiltinToolDescriptor | null>(null);
  const [argsInput, setArgsInput] = useState<string>("{}");
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<BuiltinToolExecuteResult | null>(null);

  const loadTools = async () => {
    setIsLoading(true);
    try {
      const data = await fetchBuiltinTools();
      setTools(data);
    } catch (err) {
      toast.add({
        title: "Failed to load native tools",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadTools();
  }, []);

  const filteredTools = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q),
    );
  }, [tools, filterQuery]);

  const openTestDialog = (tool: BuiltinToolDescriptor) => {
    setActiveTool(tool);
    setArgsInput(JSON.stringify(tool.sample_args ?? {}, null, 2));
    setTestResult(null);
  };

  const handleRunTest = async () => {
    if (!activeTool) return;
    let parsedArgs: Record<string, unknown>;
    try {
      parsedArgs = JSON.parse(argsInput) as Record<string, unknown>;
    } catch {
      setTestResult({
        ok: false,
        result: null,
        error: "Invalid JSON arguments.",
        latency_ms: 0,
      });
      return;
    }

    setIsTesting(true);
    try {
      const res = await testBuiltinTool(activeTool.name, parsedArgs);
      setTestResult(res);
    } catch (err) {
      toast.add({
        title: "Tool execution error",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-background p-6">
      <div className="max-w-5xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold tracking-tight">Native Built-in Tools</h1>
              <Badge variant="secondary">{tools.length}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Zero-dependency Python tools executed directly inside the backend runtime.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filter tools..."
              className="w-56"
            />
            <Button variant="outline" size="sm" onClick={() => void loadTools()} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTools.map((tool) => {
            const Icon = TOOL_ICONS[tool.name] ?? Wrench;
            return (
              <Card key={tool.name} className="p-4 flex flex-col justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-md bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <h2 className="text-sm font-semibold font-mono">{tool.name}</h2>
                        <Badge variant="outline" className="mt-1 text-xs">
                          {tool.category}
                        </Badge>
                      </div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => openTestDialog(tool)}>
                      <Play className="h-3.5 w-3.5 mr-1.5" />
                      Test
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{tool.description}</p>
                </div>
              </Card>
            );
          })}
        </div>

        {!isLoading && filteredTools.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No built-in tools match your filter.
          </Card>
        )}
      </div>

      <Dialog open={Boolean(activeTool)} onOpenChange={(open) => !open && setActiveTool(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-base">
              Test Tool: {activeTool?.name}
            </DialogTitle>
            <DialogDescription>{activeTool?.description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Arguments (JSON)
              </label>
              <textarea
                value={argsInput}
                onChange={(e) => setArgsInput(e.target.value)}
                rows={6}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            {testResult && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <Badge variant={testResult.ok ? "default" : "destructive"}>
                    {testResult.ok ? "Success" : "Error"}
                  </Badge>
                  <span className="text-muted-foreground font-mono">
                    {testResult.latency_ms.toFixed(1)} ms
                  </span>
                </div>
                <pre className="max-h-64 overflow-auto rounded-md border bg-muted/50 p-3 text-xs font-mono">
                  {JSON.stringify(
                    testResult.ok ? testResult.result : { error: testResult.error },
                    null,
                    2,
                  )}
                </pre>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveTool(null)}>
              Close
            </Button>
            <Button onClick={() => void handleRunTest()} disabled={isTesting}>
              <Play className="h-3.5 w-3.5 mr-1.5" />
              {isTesting ? "Running..." : "Execute"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
