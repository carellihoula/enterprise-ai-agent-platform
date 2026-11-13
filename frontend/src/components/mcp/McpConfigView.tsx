"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { useMcpConfig } from "@/hooks/useMcpConfig";
import { McpHeader } from "./McpHeader";
import { McpToolbar } from "./McpToolbar";
import { McpServerCard } from "./McpServerCard";
import { McpJsonEditor } from "./McpJsonEditor";
import { McpFooterBar } from "./McpFooterBar";
import { validateMcpServer } from "./mcpUtils";
import { Agent } from "@/types/agent";

const COMMAND_SUGGESTIONS = ["npx", "uvx", "node", "python", "docker", "bunx"];

export interface McpConfigViewProps {
  activeAgent?: Agent | null;
}

/**
 * Top-level orchestrator view for configuring Model Context Protocol (MCP) servers
 * with synchronized Form and JSON editing modes.
 */
export const McpConfigView: React.FC<McpConfigViewProps> = ({
  activeAgent,
}) => {
  const {
    servers,
    mode,
    jsonText,
    jsonError,
    confirmDeleteId,
    statusShake,
    isSaving,
    isDirty,
    issueCount,
    testStates,
    switchMode,
    handleJsonChange,
    handleFormatJson,
    handleCopyJson,
    toggleServerOpen,
    toggleCollapseAll,
    addServer,
    duplicateServer,
    requestOrConfirmDelete,
    updateServerField,
    changeTransport,
    testServerConnection,
    handleSave,
    handleRevert,
  } = useMcpConfig({ agentId: activeAgent?.id });

  const handleAddAndFocus = () => {
    const newId = addServer();
    requestAnimationFrame(() => {
      const nameInput = document.getElementById(
        `n-${newId}`
      ) as HTMLInputElement | null;
      if (nameInput) {
        nameInput.scrollIntoView({ block: "center" });
        nameInput.focus({ preventScroll: true });
        nameInput.select();
      }
    });
  };

  return (
    <div className="flex-1 overflow-y-auto bg-white p-4 sm:p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <McpHeader
          mode={mode}
          onModeChange={switchMode}
        />

        <Card className="rounded-[10px] border border-zinc-200 bg-white shadow-2xs hover:shadow-2xs overflow-hidden">
          {mode === "form" ? (
            <div role="tabpanel" aria-labelledby="tab-form">
              <McpToolbar
                servers={servers}
                onToggleCollapseAll={toggleCollapseAll}
                onAddServer={handleAddAndFocus}
              />

              {servers.length > 0 ? (
                <div>
                  {servers.map((server) => (
                    <McpServerCard
                      key={server.id}
                      server={server}
                      errors={validateMcpServer(server, servers)}
                      testState={testStates[server.id] || { status: "idle" }}
                      isConfirmingDelete={confirmDeleteId === server.id}
                      onToggleOpen={() => toggleServerOpen(server.id)}
                      onToggleEnabled={() =>
                        updateServerField(server.id, {
                          disabled: !server.disabled,
                        })
                      }
                      onDuplicate={() => duplicateServer(server.id)}
                      onDelete={() => requestOrConfirmDelete(server.id)}
                      onTestConnection={() => testServerConnection(server.id)}
                      onChangeTransport={(type) =>
                        changeTransport(server.id, type)
                      }
                      onUpdate={(patch) => updateServerField(server.id, patch)}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid place-items-center gap-3 min-h-[360px] p-6 text-center text-zinc-500">
                  <div>
                    <b className="text-sm font-semibold text-zinc-900">
                      No MCP servers
                    </b>
                    <p className="mt-1 text-[13px] text-zinc-500">
                      Add a server to give tools to the agent.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <McpJsonEditor
              jsonText={jsonText}
              jsonError={jsonError}
              serverCount={servers.length}
              statusShake={statusShake}
              onChange={handleJsonChange}
              onFormat={handleFormatJson}
              onCopy={handleCopyJson}
            />
          )}

          <McpFooterBar
            isDirty={isDirty}
            isSaving={isSaving}
            jsonError={jsonError}
            issueCount={issueCount}
            onRevert={handleRevert}
            onSave={handleSave}
          />
        </Card>

        <datalist id="cmds">
          {COMMAND_SUGGESTIONS.map((cmd) => (
            <option key={cmd} value={cmd} />
          ))}
        </datalist>
      </div>
    </div>
  );
};
