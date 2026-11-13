/**
 * Utility helpers for MCP server serialization, JSON parsing, and validation.
 */

import {
  McpJsonError,
  McpKeyValueRow,
  McpServerDto,
  McpServerFormState,
  McpTestState,
  McpTransportType,
  McpValidationErrors,
} from "@/types/mcp";

/**
 * Generates a short random identifier for client-side server cards.
 *
 * Returns:
 *   string: 7-character alphanumeric identifier.
 */
export function generateClientId(): string {
  return Math.random().toString(36).slice(2, 9);
}

/**
 * Creates a new McpServerFormState instance with sensible defaults.
 *
 * Args:
 *   name (string): Initial server name.
 *   type (McpTransportType): Initial transport type.
 *   overrides (Partial<McpServerFormState> | undefined): Optional property overrides.
 *
 * Returns:
 *   McpServerFormState: Initialized server form state object.
 */
export function createMcpServerState(
  name: string,
  type: McpTransportType = "stdio",
  overrides?: Partial<McpServerFormState>
): McpServerFormState {
  return {
    id: generateClientId(),
    open: true,
    name,
    type,
    command: "",
    args: [],
    env: [],
    url: "",
    headers: [],
    disabled: false,
    extra: {},
    ...overrides,
  };
}

/**
 * Converts a backend McpServerDto into a UI McpServerFormState.
 */
export function dtoToFormServer(
  dto: McpServerDto,
  prevOpen = true
): McpServerFormState {
  const toRows = (map: Record<string, string> | undefined): McpKeyValueRow[] =>
    Object.entries(map || {}).map(([k, v]) => ({ k, v: String(v), show: false }));

  return {
    id: dto.id || generateClientId(),
    open: prevOpen,
    name: dto.name,
    type: dto.type || "stdio",
    command: dto.command || "",
    args: Array.isArray(dto.args) ? dto.args.map(String) : [],
    env: toRows(dto.env),
    url: dto.url || "",
    headers: toRows(dto.headers),
    disabled: Boolean(dto.disabled),
    extra: dto.extra || {},
  };
}

/**
 * Converts a backend McpServerDto into a UI McpTestState.
 */
export function dtoToTestState(dto: McpServerDto): McpTestState {
  const status =
    dto.connection_status === "connected" || dto.connection_status === "failed"
      ? dto.connection_status
      : "idle";
  return {
    status,
    message: dto.connection_message ?? undefined,
    toolsCount: dto.tools_count ?? 0,
    tools: dto.discovered_tools ?? [],
    latencyMs: dto.latency_ms ?? undefined,
  };
}

/**
 * Converts a UI McpServerFormState into a backend McpServerDto payload.
 */
export function formServerToDto(
  server: McpServerFormState,
  testState?: McpTestState
): McpServerDto {
  const rowsToMap = (rows: McpKeyValueRow[]): Record<string, string> => {
    const out: Record<string, string> = {};
    rows.forEach((r) => {
      if (r.k.trim()) {
        out[r.k.trim()] = r.v;
      }
    });
    return out;
  };

  const persistedStatus =
    testState?.status === "connected" || testState?.status === "failed"
      ? testState.status
      : "idle";

  return {
    id: server.id,
    name: server.name.trim(),
    type: server.type,
    command: server.command.trim(),
    args: server.args.filter((a) => a !== ""),
    env: rowsToMap(server.env),
    url: server.url.trim(),
    headers: rowsToMap(server.headers),
    disabled: server.disabled,
    extra: server.extra,
    connection_status: persistedStatus,
    connection_message: testState?.message ?? null,
    tools_count: testState?.toolsCount ?? 0,
    discovered_tools: testState?.tools ?? [],
    latency_ms: testState?.latencyMs ?? null,
  };
}

/**
 * Serializes a single McpServerFormState into its canonical mcp.json entry object.
 */
export function serverToMcpJsonObject(
  server: McpServerFormState
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const rowsToMap = (rows: McpKeyValueRow[]): Record<string, string> => {
    const map: Record<string, string> = {};
    rows.forEach((r) => {
      if (r.k.trim()) map[r.k.trim()] = r.v;
    });
    return map;
  };

  if (server.type === "stdio") {
    out.command = server.command.trim();
    const filteredArgs = server.args.filter((x) => x !== "");
    if (filteredArgs.length > 0) out.args = filteredArgs;
    const envMap = rowsToMap(server.env);
    if (Object.keys(envMap).length > 0) out.env = envMap;
  } else {
    out.type = server.type;
    out.url = server.url.trim();
    const headersMap = rowsToMap(server.headers);
    if (Object.keys(headersMap).length > 0) out.headers = headersMap;
  }

  if (server.disabled) {
    out.disabled = true;
  }

  return { ...out, ...server.extra };
}

/**
 * Builds the top-level `{ mcpServers: { ... } }` JSON object from the server list.
 */
export function buildMcpJsonDocument(
  list: McpServerFormState[]
): { mcpServers: Record<string, Record<string, unknown>> } {
  const mcpServers: Record<string, Record<string, unknown>> = {};
  list.forEach((srv, idx) => {
    const key = srv.name.trim() || `server-${idx + 1}`;
    mcpServers[key] = serverToMcpJsonObject(srv);
  });
  return { mcpServers };
}

/**
 * Formats the server list into a 2-space indented mcp.json string.
 */
export function serializeMcpServers(list: McpServerFormState[]): string {
  return JSON.stringify(buildMcpJsonDocument(list), null, 2);
}

/**
 * Computes a deterministic JSON signature for dirty-state comparison.
 */
export function computeConfigSignature(list: McpServerFormState[]): string {
  return JSON.stringify(buildMcpJsonDocument(list));
}

/**
 * Parses a raw mcp.json text string into an array of McpServerFormState items.
 */
export function parseMcpJsonString(
  rawText: string,
  previousServers: McpServerFormState[]
): McpServerFormState[] {
  const parsed = JSON.parse(rawText);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Root value must be a JSON object.");
  }
  const mcpServers = (parsed as Record<string, unknown>).mcpServers;
  if (!mcpServers || typeof mcpServers !== "object" || Array.isArray(mcpServers)) {
    throw new Error('The "mcpServers" key is missing or is not an object.');
  }

  return Object.entries(mcpServers as Record<string, unknown>).map(
    ([name, val]) => {
      if (!val || typeof val !== "object" || Array.isArray(val)) {
        throw new Error(`"${name}" must be an object.`);
      }
      const obj = val as Record<string, unknown>;
      const { command, args, env, type, url, headers, disabled, ...extra } = obj;
      const isRemote =
        typeof url === "string" || type === "http" || type === "sse";
      const toRows = (rawObj: unknown): McpKeyValueRow[] =>
        rawObj && typeof rawObj === "object" && !Array.isArray(rawObj)
          ? Object.entries(rawObj as Record<string, unknown>).map(([k, v]) => ({
              k,
              v: String(v),
              show: false,
            }))
          : [];

      const prev = previousServers.find((s) => s.name === name);
      return {
        id: prev ? prev.id : generateClientId(),
        open: prev ? prev.open : true,
        name,
        type: isRemote ? (type === "sse" ? "sse" : "http") : "stdio",
        command: command == null ? "" : String(command),
        args: Array.isArray(args) ? args.map(String) : [],
        env: toRows(env),
        url: url == null ? "" : String(url),
        headers: toRows(headers),
        disabled: Boolean(disabled),
        extra,
      };
    }
  );
}

/**
 * Extracts line and column numbers from a JSON parsing error.
 */
export function extractJsonErrorInfo(err: unknown, rawText: string): McpJsonError {
  let line: number | null = null;
  let col: number | null = null;
  let msg = err instanceof Error ? err.message : String(err);

  if (err instanceof SyntaxError) {
    const lineColMatch = msg.match(/line (\d+) column (\d+)/i);
    if (lineColMatch) {
      line = Number(lineColMatch[1]);
      col = Number(lineColMatch[2]);
    } else {
      const posMatch = msg.match(/position (\d+)/i);
      if (posMatch) {
        const before = rawText.slice(0, Number(posMatch[1])).split("\n");
        line = before.length;
        col = before[before.length - 1].length + 1;
      }
    }
    msg = msg.replace(/\s*\(line \d+ column \d+\)/i, "");
  }
  return { line, col, msg };
}

/**
 * Validates a single McpServerFormState against naming, uniqueness, and transport rules.
 */
export function validateMcpServer(
  server: McpServerFormState,
  allServers: McpServerFormState[]
): McpValidationErrors {
  const errors: McpValidationErrors = {};
  const trimmedName = server.name.trim();

  if (!trimmedName) {
    errors.name = "Server name is required.";
  } else if (!/^[\w.\-]+$/.test(trimmedName)) {
    errors.name = "Use letters, digits, hyphens, dots, or underscores.";
  } else if (
    allServers.some((other) => other.id !== server.id && other.name.trim() === trimmedName)
  ) {
    errors.name = "This name is already used by another server.";
  }

  if (server.type === "stdio") {
    if (!server.command.trim()) {
      errors.command = "Command is required.";
    }
    if (server.env.some((r) => !r.k.trim() && r.v)) {
      errors.kv = "A variable has a value but no name.";
    }
  } else {
    try {
      const parsedUrl = new URL(server.url.trim());
      if (!/^https?:$/.test(parsedUrl.protocol)) {
        throw new Error("Invalid protocol");
      }
    } catch {
      errors.url = "Enter a full URL, for example https://mcp.example.com/mcp.";
    }
    if (server.headers.some((r) => !r.k.trim() && r.v)) {
      errors.kv = "A header has a value but no name.";
    }
  }

  return errors;
}

/**
 * Counts the total number of validation errors across all configured servers.
 */
export function countTotalValidationIssues(servers: McpServerFormState[]): number {
  return servers.reduce(
    (sum, srv) => sum + Object.keys(validateMcpServer(srv, servers)).length,
    0
  );
}

/**
 * Generates a unique non-conflicting server name based on a prefix.
 */
export function generateNextServerName(
  baseName: string,
  servers: McpServerFormState[]
): string {
  let candidate = baseName;
  let index = 2;
  while (servers.some((s) => s.name === candidate)) {
    candidate = `${baseName}-${index++}`;
  }
  return candidate;
}

/**
 * Formats byte size into human-readable B or KB string.
 */
export function formatByteSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}
