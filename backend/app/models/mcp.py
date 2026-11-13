"""Pydantic v2 schemas and validation contracts for Model Context Protocol (MCP) servers.

This module defines the request and response schemas for configuring MCP servers
via both structured form payloads and raw mcp.json documents.
"""

import re
from datetime import datetime
from typing import Any, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, model_validator

McpTransport = Literal["stdio", "http", "sse"]
McpConnectionStatus = Literal["idle", "connected", "failed"]

_NAME_PATTERN = re.compile(r"^[\w.\-]+$")


class McpToolInfo(BaseModel):
    """Metadata describing a single tool exposed by an MCP server.

    Attributes:
        name (str): Unique tool identifier exposed by the MCP server.
        description (str): Human-readable description of the tool's purpose.
    """

    name: str = Field(description="MCP tool identifier")
    description: str = Field(default="", description="Tool description")


class McpServerPayload(BaseModel):
    """Payload schema representing a single MCP server configuration.

    Attributes:
        id (str | None): Optional UUID identifier when updating an existing server.
        name (str): Unique server identifier within mcpServers.
        type (McpTransport): Transport type ('stdio', 'http', or 'sse').
        command (str): Executable command for local stdio servers.
        args (list[str]): Command-line arguments for local stdio servers.
        env (dict[str, str]): Environment variables map for local stdio servers.
        url (str): Remote endpoint URL for http or sse servers.
        headers (dict[str, str]): HTTP headers map for remote servers.
        disabled (bool): Flag indicating whether the server is disabled.
        extra (dict[str, Any]): Additional unmapped properties preserved from mcp.json.
    """

    model_config = ConfigDict(extra="ignore")

    id: str | None = Field(default=None, description="Optional server UUID")
    name: str = Field(..., min_length=1, max_length=100, description="Identifier in mcpServers")
    type: McpTransport = Field(default="stdio", description="Transport protocol type")
    command: str = Field(default="", max_length=255, description="Command for stdio transport")
    args: list[str] = Field(default_factory=list, description="Arguments for stdio command")
    env: dict[str, str] = Field(default_factory=dict, description="Environment variables map")
    url: str = Field(default="", max_length=500, description="Remote endpoint URL")
    headers: dict[str, str] = Field(default_factory=dict, description="HTTP request headers map")
    disabled: bool = Field(default=False, description="Whether this server is disabled")
    extra: dict[str, Any] = Field(default_factory=dict, description="Preserved extra JSON fields")
    connection_status: McpConnectionStatus = Field(
        default="idle", description="Last known connection test status"
    )
    connection_message: str | None = Field(
        default=None, description="Diagnostic message from last connection test"
    )
    tools_count: int = Field(default=0, description="Number of discovered tools")
    discovered_tools: list[McpToolInfo] = Field(
        default_factory=list, description="Discovered tools from last connection test"
    )
    latency_ms: int | None = Field(default=None, description="Handshake latency in milliseconds")

    @model_validator(mode="after")
    def validate_transport_fields(self) -> "McpServerPayload":
        """Validates server name syntax and transport-specific required fields.

        Returns:
            McpServerPayload: Validated server payload instance.

        Raises:
            ValueError: If name format or transport parameters are invalid.
        """
        cleaned_name = self.name.strip()
        if not cleaned_name:
            raise ValueError("Server name is required.")
        if not _NAME_PATTERN.match(cleaned_name):
            raise ValueError(
                f"Invalid server name '{cleaned_name}'. Use letters, digits, hyphens, dots, or underscores."
            )
        self.name = cleaned_name

        # [Transport Validation] Enforce required fields based on selected transport protocol
        if self.type == "stdio":
            if not self.command.strip():
                raise ValueError(f"Command is required for stdio server '{self.name}'.")
            self.command = self.command.strip()
            self.args = [str(a) for a in self.args if str(a) != ""]
        else:
            cleaned_url = self.url.strip()
            parsed = urlparse(cleaned_url)
            if parsed.scheme not in ("http", "https") or not parsed.netloc:
                raise ValueError(
                    f"Valid HTTP/HTTPS URL is required for {self.type} server '{self.name}'."
                )
            self.url = cleaned_url

        return self


class McpServerResponse(BaseModel):
    """Public response schema representing a persisted MCP server record.

    Attributes:
        id (str): Primary key UUID string identifier.
        agent_id (str | None): Optional associated Agent UUID.
        name (str): Server key identifier in mcpServers.
        type (McpTransport): Transport protocol ('stdio', 'http', or 'sse').
        command (str): Executable command for stdio transport.
        args (list[str]): Command arguments list.
        env (dict[str, str]): Environment variables dictionary.
        url (str): Remote endpoint URL.
        headers (dict[str, str]): HTTP headers dictionary.
        disabled (bool): Disabled flag.
        extra (dict[str, Any]): Additional raw mcp.json fields.
        created_at (datetime): Creation timestamp.
        updated_at (datetime): Last update timestamp.
    """

    model_config = ConfigDict(from_attributes=True)

    id: str
    agent_id: str | None = None
    name: str
    type: McpTransport
    command: str
    args: list[str] = Field(default_factory=list)
    env: dict[str, str] = Field(default_factory=dict)
    url: str
    headers: dict[str, str] = Field(default_factory=dict)
    disabled: bool
    extra: dict[str, Any] = Field(default_factory=dict)
    connection_status: McpConnectionStatus = "idle"
    connection_message: str | None = None
    tools_count: int = 0
    discovered_tools: list[McpToolInfo] = Field(default_factory=list)
    latency_ms: int | None = None
    created_at: datetime
    updated_at: datetime


class McpConfigSyncRequest(BaseModel):
    """Request schema for synchronizing a full MCP configuration via form list or mcpServers JSON.

    Attributes:
        servers (list[McpServerPayload] | None): Ordered list of structured MCP server payloads.
        mcpServers (dict[str, dict[str, Any]] | None): Raw mcp.json mcpServers mapping.
    """

    model_config = ConfigDict(extra="ignore")

    servers: list[McpServerPayload] | None = Field(
        default=None, description="Structured list of MCP server configurations"
    )
    mcpServers: dict[str, dict[str, Any]] | None = Field(
        default=None, description="Raw mcpServers dictionary from mcp.json"
    )


class McpConfigResponse(BaseModel):
    """Combined MCP configuration response providing both structured items and canonical mcp.json map.

    Attributes:
        servers (list[McpServerResponse]): Persisted MCP server entities in display order.
        mcpServers (dict[str, dict[str, Any]]): Canonical mcpServers dictionary for JSON mode.
    """

    servers: list[McpServerResponse] = Field(default_factory=list)
    mcpServers: dict[str, dict[str, Any]] = Field(default_factory=dict)


class McpTestResponse(BaseModel):
    """Response schema reporting the outcome of a live MCP server connection test.

    Attributes:
        ok (bool): True if handshake and initialization succeeded.
        status (Literal["connected", "failed"]): Connection state indicator.
        message (str): Diagnostic status or error description.
        tools_count (int): Number of tools discovered on the MCP server.
        tools (list[str]): List of discovered tool identifiers.
        tool_details (list[McpToolInfo]): Detailed list of discovered tools with descriptions.
        latency_ms (int): Connection handshake duration in milliseconds.
    """

    ok: bool = Field(description="Whether the connection handshake succeeded")
    status: Literal["connected", "failed"] = Field(description="Resulting connection state")
    message: str = Field(description="Human-readable diagnostic message")
    tools_count: int = Field(default=0, description="Number of discovered MCP tools")
    tools: list[str] = Field(default_factory=list, description="Discovered MCP tool names")
    tool_details: list[McpToolInfo] = Field(
        default_factory=list, description="Discovered MCP tools with descriptions"
    )
    latency_ms: int = Field(default=0, description="Handshake round-trip time in milliseconds")


def server_to_mcp_json_entry(server: McpServerResponse | McpServerPayload) -> dict[str, Any]:
    """Serializes a structured MCP server into its canonical mcp.json object representation.

    Args:
        server (McpServerResponse | McpServerPayload): Structured server instance.

    Returns:
        dict[str, Any]: Dictionary entry suitable for the mcpServers map in mcp.json.
    """
    entry: dict[str, Any] = {}
    if server.type == "stdio":
        entry["command"] = server.command.strip()
        filtered_args = [a for a in server.args if a != ""]
        if filtered_args:
            entry["args"] = filtered_args
        clean_env = {k.strip(): v for k, v in server.env.items() if k.strip()}
        if clean_env:
            entry["env"] = clean_env
    else:
        entry["type"] = server.type
        entry["url"] = server.url.strip()
        clean_headers = {k.strip(): v for k, v in server.headers.items() if k.strip()}
        if clean_headers:
            entry["headers"] = clean_headers

    if server.disabled:
        entry["disabled"] = True

    # [Extensibility] Merge preserved extra JSON properties without clobbering core fields
    if server.extra:
        for k, v in server.extra.items():
            if k not in entry:
                entry[k] = v

    return entry


def parse_mcp_json_entry(name: str, raw: dict[str, Any]) -> McpServerPayload:
    """Parses a raw mcpServers dictionary entry from mcp.json into a validated McpServerPayload.

    Args:
        name (str): Server key in mcpServers.
        raw (dict[str, Any]): Raw JSON configuration dictionary for the server.

    Returns:
        McpServerPayload: Validated MCP server payload.

    Raises:
        ValueError: If the raw entry is not a valid dictionary or fails validation.
    """
    if not isinstance(raw, dict):
        raise ValueError(f"Server '{name}' configuration must be a JSON object.")

    known_keys = {"command", "args", "env", "type", "url", "headers", "disabled"}
    extra = {k: v for k, v in raw.items() if k not in known_keys}

    raw_url = raw.get("url")
    raw_type = raw.get("type")
    is_remote = isinstance(raw_url, str) or raw_type in ("http", "sse")
    transport: McpTransport = ("sse" if raw_type == "sse" else "http") if is_remote else "stdio"

    raw_args = raw.get("args")
    args_list = [str(item) for item in raw_args] if isinstance(raw_args, list) else []

    raw_env = raw.get("env")
    env_dict = {str(k): str(v) for k, v in raw_env.items()} if isinstance(raw_env, dict) else {}

    raw_headers = raw.get("headers")
    headers_dict = (
        {str(k): str(v) for k, v in raw_headers.items()} if isinstance(raw_headers, dict) else {}
    )

    return McpServerPayload(
        name=name,
        type=transport,
        command="" if raw.get("command") is None else str(raw.get("command")),
        args=args_list,
        env=env_dict,
        url="" if raw_url is None else str(raw_url),
        headers=headers_dict,
        disabled=bool(raw.get("disabled", False)),
        extra=extra,
    )
