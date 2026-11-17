"use client";

import React, { useCallback, useEffect, useState } from "react";
import { KeyRound, Trash2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createWorkspaceApiKey, listWorkspaceApiKeys, revokeWorkspaceApiKey } from "@/lib/api";
import { ApiKeyDto } from "@/types/auth";

interface WorkspaceApiKeysTabProps {
  workspaceId: string;
}

export const WorkspaceApiKeysTab: React.FC<WorkspaceApiKeysTabProps> = ({ workspaceId }) => {
  const [keys, setKeys] = useState<ApiKeyDto[]>([]);
  const [keyName, setKeyName] = useState("");
  const [rawSecret, setRawSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    try {
      setKeys(await listWorkspaceApiKeys(workspaceId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load API keys");
    }
  }, [workspaceId]);

  useEffect(() => {
    let active = true;
    listWorkspaceApiKeys(workspaceId)
      .then((data) => {
        if (active) setKeys(data);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load API keys");
      });
    return () => {
      active = false;
    };
  }, [workspaceId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setRawSecret(null);
    try {
      const created = await createWorkspaceApiKey(workspaceId, keyName, []);
      setRawSecret(created.raw_key);
      setKeyName("");
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create API key");
    }
  };

  const handleRevoke = async (keyId: string) => {
    setError(null);
    try {
      await revokeWorkspaceApiKey(workspaceId, keyId);
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke API key");
    }
  };

  const copySecret = () => {
    if (!rawSecret) return;
    navigator.clipboard.writeText(rawSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-5">
      {error && (
        <div className="p-2.5 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}

      <form
        onSubmit={handleCreate}
        className="p-4 rounded-lg border border-zinc-200 bg-zinc-50/70 space-y-3"
      >
        <div className="text-xs font-medium text-zinc-700 flex items-center gap-1.5">
          <KeyRound className="w-3.5 h-3.5" />
          <span>Create Programmatic API Key</span>
        </div>
        <div className="flex gap-2">
          <Input
            type="text"
            required
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            placeholder="CI Pipeline / Platform SDK"
            className="flex-1 h-8 text-xs bg-white"
          />
          <Button type="submit" size="sm" className="h-8 text-xs bg-zinc-900 text-white cursor-pointer">
            Create Key
          </Button>
        </div>
        {rawSecret && (
          <div className="p-2.5 rounded bg-amber-50 border border-amber-200 space-y-1.5">
            <div className="text-[11px] font-medium text-amber-800">
              Copy this API key now — it will never be shown again.
            </div>
            <div className="flex items-center justify-between gap-2 bg-white p-2 rounded border border-amber-200 text-xs">
              <span className="font-mono truncate text-zinc-800">{rawSecret}</span>
              <Button type="button" variant="outline" size="sm" onClick={copySecret} className="h-7 px-2">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
        )}
      </form>

      <div className="border border-zinc-200 rounded-lg divide-y divide-zinc-200 bg-white">
        {keys.length === 0 ? (
          <div className="p-4 text-xs text-zinc-500 text-center">No API keys created yet.</div>
        ) : (
          keys.map((k) => (
            <div key={k.id} className="p-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-zinc-900 flex items-center gap-2">
                  <span>{k.name}</span>
                  {k.revoked_at ? (
                    <Badge variant="destructive" className="text-[10px]">
                      Revoked
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">
                      Active
                    </Badge>
                  )}
                </div>
                <div className="text-xs font-mono text-zinc-500">{k.key_prefix}...</div>
              </div>
              {!k.revoked_at && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRevoke(k.id)}
                  className="h-8 w-8 p-0 text-zinc-400 hover:text-red-600 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
