"""Model Context Protocol (MCP) client probe and connection verification engine.

This module provides isolated connection testing for stdio, SSE, and Streamable HTTP
MCP servers using the official MCP Python SDK. Local stdio commands are executed inside
a disposable, ephemeral Docker sandbox container with zero access to backend secrets.
"""

import asyncio
import ipaddress
import os
import shutil
import socket
import tempfile
import time
from collections.abc import Awaitable, Callable
from typing import Any, TextIO, TypeVar, cast
from urllib.parse import urlparse

from mcp import ClientSession
from mcp.client.sse import sse_client
from mcp.client.stdio import StdioServerParameters, stdio_client
from mcp.client.streamable_http import streamable_http_client
from mcp.shared._httpx_utils import create_mcp_http_client

from app.models.mcp import McpServerPayload, McpTestResponse, McpToolInfo

DEFAULT_SANDBOX_IMAGE = os.environ.get("MCP_SANDBOX_IMAGE", "mcp-sandbox:latest")
DEFAULT_SANDBOX_CACHE_VOLUME = os.environ.get("MCP_SANDBOX_CACHE_VOLUME", "mcp_sandbox_cache")


def _sanitize_user_env(raw_map: dict[str, str]) -> dict[str, str]:
    """Extracts clean user-provided key-value pairs without exposing backend environment secrets.

    Args:
        raw_map (dict[str, str]): User-configured environment variables or HTTP headers.

    Returns:
        dict[str, str]: Sanitized mapping containing only non-empty keys.
    """
    sanitized: dict[str, str] = {}
    for key, val in raw_map.items():
        clean_key = key.strip()
        if clean_key:
            sanitized[clean_key] = str(val)
    return sanitized


def _validate_remote_url_ssrf(url: str) -> None:
    """Validates a remote MCP URL against SSRF by blocking private, loopback, and link-local IPs.

    Args:
        url (str): Target HTTP or SSE endpoint URL.

    Raises:
        ValueError: If the URL resolves to a restricted internal or private network address.
    """
    parsed = urlparse(url)
    hostname = parsed.hostname
    if not hostname:
        raise ValueError("Invalid URL: missing hostname.")

    lowered = hostname.lower()
    if lowered in ("localhost", "localhost.localdomain"):
        raise ValueError("Connections to localhost are blocked for security.")

    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        addr_infos = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise ValueError(f"DNS resolution failed for host '{hostname}'.") from exc

    for info in addr_infos:
        ip_str = info[4][0]
        ip_obj = ipaddress.ip_address(ip_str)
        # [SSRF Defense] Block loopback, private RFC1918, link-local (169.254.x), and reserved ranges
        if (
            ip_obj.is_private
            or ip_obj.is_loopback
            or ip_obj.is_link_local
            or ip_obj.is_multicast
            or ip_obj.is_reserved
            or ip_obj.is_unspecified
        ):
            raise ValueError(
                f"Connections to private or internal IP address ({ip_str}) are blocked."
            )


def _build_sandbox_docker_args(payload: McpServerPayload) -> list[str]:
    """Builds the `docker run` argument list for an ephemeral, isolated stdio MCP sandbox.

    Args:
        payload (McpServerPayload): Validated stdio MCP server payload.

    Returns:
        list[str]: Argument list passed to the `docker` CLI executable.
    """
    docker_args = [
        "run",
        "--rm",
        "-i",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        # [Browser Support] Chromium spawns dozens of threads/subprocesses; 256 PIDs & 1GB prevent pthread_create failures
        "--pids-limit=256",
        "--memory=1024m",
        "--cpus=1",
        "--user=nobody",
        "-v",
        f"{DEFAULT_SANDBOX_CACHE_VOLUME}:/tmp/mcp-home",
    ]

    # [Isolation] Forward only user-declared MCP server variables, never backend os.environ
    user_env = _sanitize_user_env(payload.env)
    for key, val in user_env.items():
        docker_args.extend(["-e", f"{key}={val}"])

    docker_args.append(DEFAULT_SANDBOX_IMAGE)
    docker_args.append(payload.command)
    docker_args.extend(payload.args)
    return docker_args


def _extract_root_error_message(exc: BaseException) -> str:
    """Unwraps nested ExceptionGroup instances to surface the underlying root cause message.

    Args:
        exc (BaseException): Exception or BaseExceptionGroup raised during MCP transport probing.

    Returns:
        str: Concise, human-readable root error message.
    """
    if isinstance(exc, BaseExceptionGroup) and exc.exceptions:
        return _extract_root_error_message(exc.exceptions[0])
    if isinstance(exc, TimeoutError | asyncio.TimeoutError):
        return "Connection timed out while waiting for MCP server handshake."
    msg = str(exc).strip()
    if "Unable to find image" in msg or "No such image" in msg:
        return (
            f"Sandbox image '{DEFAULT_SANDBOX_IMAGE}' not found. "
            "Build it with: docker build -t mcp-sandbox:latest infra/mcp-sandbox"
        )
    return msg if msg else exc.__class__.__name__


def _format_http_diagnostic(status_code: int, reason: str, body_preview: str) -> str:
    """Formats a clear diagnostic message from a captured HTTP error response.

    Args:
        status_code (int): HTTP status code returned by the remote server.
        reason (str): HTTP reason phrase (e.g., 'Unauthorized', 'Not Found').
        body_preview (str): Short sanitized snippet of the response body.

    Returns:
        str: Human-readable HTTP diagnostic string.
    """
    base = f"HTTP {status_code} {reason}".strip()
    if status_code == 401:
        hint = "Authentication required or invalid token/credentials."
    elif status_code == 403:
        hint = "Access forbidden by the remote server."
    elif status_code == 404:
        hint = "MCP endpoint not found at this URL."
    elif status_code == 405:
        hint = "Method not allowed — check whether the server uses Streamable HTTP or SSE."
    else:
        hint = ""

    parts = [base]
    if hint:
        parts.append(hint)
    if body_preview:
        parts.append(body_preview)
    return " — ".join(parts)


T = TypeVar("T")


async def _run_session_handshake(read_stream: object, write_stream: object) -> list[McpToolInfo]:
    """Executes the MCP initialization handshake and queries available tools on an open transport.

    Args:
        read_stream (object): MCP transport receive stream.
        write_stream (object): MCP transport send stream.

    Returns:
        list[McpToolInfo]: Discovered tools with names and descriptions.
    """
    return await _run_session_with_callback(read_stream, write_stream, _list_tools_from_session)


async def _list_tools_from_session(session: ClientSession) -> list[McpToolInfo]:
    """Queries tool descriptors from an initialized MCP ClientSession.

    Args:
        session (ClientSession): Initialized MCP session.

    Returns:
        list[McpToolInfo]: Discovered tools with names and descriptions.
    """
    try:
        # [Capability Discovery] Fetch tool list if the server exposes the tools capability
        tools_result = await session.list_tools()
        return [
            McpToolInfo(
                name=t.name,
                description=(getattr(t, "description", None) or "").strip(),
            )
            for t in getattr(tools_result, "tools", [])
        ]
    except Exception:
        # [Graceful Fallback] Some MCP servers only expose prompts or resources without tools
        return []


async def _run_session_with_callback(
    read_stream: object,
    write_stream: object,
    callback: Callable[[ClientSession], Awaitable[T]],
) -> T:
    """Initializes an MCP ClientSession and invokes the supplied async callback.

    Args:
        read_stream (object): MCP transport receive stream.
        write_stream (object): MCP transport send stream.
        callback (Callable[[ClientSession], Awaitable[T]]): Operation to execute on the session.

    Returns:
        T: Result returned by the callback.
    """
    async with ClientSession(read_stream, write_stream) as session:  # type: ignore[arg-type]
        await session.initialize()
        return await callback(session)


async def _probe_transport(
    payload: McpServerPayload,
    diagnostics: dict[str, Any],
    callback: Callable[[ClientSession], Awaitable[T]] | None = None,
) -> Any:
    """Opens the configured MCP transport and performs the protocol handshake.

    Args:
        payload (McpServerPayload): Validated MCP server configuration payload.
        diagnostics (dict[str, Any]): Mutable dictionary used to capture HTTP or stderr details.
        callback (Callable[[ClientSession], Awaitable[T]] | None, optional): Optional session callback.
            Defaults to listing tool info.

    Returns:
        Any: Result returned by the session callback.

    Raises:
        FileNotFoundError: If Docker CLI is unavailable on the host for stdio sandboxing.
        ValueError: If a remote URL fails SSRF validation.
        Exception: If transport connection or MCP initialization fails.
    """
    effective_cb: Callable[[ClientSession], Awaitable[Any]] = (
        callback if callback is not None else _list_tools_from_session
    )
    if payload.type == "stdio":
        docker_bin = shutil.which("docker")
        if not docker_bin:
            raise FileNotFoundError(
                "Docker is required to run stdio MCP servers in an isolated disposable sandbox."
            )

        # [Disposable Backend] Launch user command inside an ephemeral container with zero backend env
        params = StdioServerParameters(
            command=docker_bin,
            args=_build_sandbox_docker_args(payload),
            env={"PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin")},
        )
        with tempfile.SpooledTemporaryFile(mode="w+", encoding="utf-8") as err_file:
            try:
                async with stdio_client(params, errlog=cast(TextIO, err_file)) as (
                    read_stream,
                    write_stream,
                ):
                    return await _run_session_with_callback(read_stream, write_stream, effective_cb)
            finally:
                err_file.seek(0)
                stderr_text = err_file.read().strip()
                if stderr_text:
                    # [Diagnostics] Keep last 300 chars of container stderr for troubleshooting
                    diagnostics["stderr"] = stderr_text[-300:]

    # [SSRF Protection] Verify remote URL before opening outbound connection
    _validate_remote_url_ssrf(payload.url)
    resolved_headers = _sanitize_user_env(payload.headers)

    async def _capture_http_error(response: Any) -> None:
        if response.status_code >= 400:
            try:
                await response.aread()
                preview = response.text.strip().replace("\n", " ")[:180]
            except Exception:
                preview = ""
            diagnostics["http_error"] = _format_http_diagnostic(
                response.status_code,
                response.reason_phrase or "",
                preview,
            )

    def _http_client_factory(
        headers: dict[str, str] | None = None,
        timeout: Any = None,
        auth: Any = None,
    ) -> Any:
        client = create_mcp_http_client(
            headers=headers or resolved_headers or None,
            timeout=timeout,
            auth=auth,
        )
        client.event_hooks["response"].append(_capture_http_error)
        return client

    if payload.type == "sse":
        async with sse_client(
            url=payload.url,
            headers=resolved_headers or None,
            timeout=6.0,
            sse_read_timeout=10.0,
            httpx_client_factory=_http_client_factory,
        ) as (read_stream, write_stream):
            return await _run_session_with_callback(read_stream, write_stream, effective_cb)

    # [Streamable HTTP] Use instrumented MCP HTTP client to capture exact HTTP status on failure
    http_client = _http_client_factory(headers=resolved_headers or None)
    async with streamable_http_client(
        payload.url,
        http_client=http_client,
    ) as (read_stream, write_stream):
        return await _run_session_with_callback(read_stream, write_stream, effective_cb)


async def probe_mcp_server(
    payload: McpServerPayload,
    timeout_seconds: float | None = None,
) -> McpTestResponse:
    """Probes an MCP server configuration with a strict timeout and returns diagnostic results.

    Args:
        payload (McpServerPayload): MCP server configuration to test.
        timeout_seconds (float | None, optional): Maximum time allowed for handshake.
            Defaults to 60.0s for stdio (to allow initial package downloads) and 15.0s for remote.

    Returns:
        McpTestResponse: Structured connection test result with discovered tools and latency.
    """
    effective_timeout = (
        timeout_seconds
        if timeout_seconds is not None
        else (60.0 if payload.type == "stdio" else 15.0)
    )
    start_time = time.perf_counter()
    diagnostics: dict[str, Any] = {}
    try:
        discovered_tools = await asyncio.wait_for(
            _probe_transport(payload, diagnostics),
            timeout=effective_timeout,
        )
        elapsed_ms = int((time.perf_counter() - start_time) * 1000)
        count = len(discovered_tools)
        suffix = f"{count} tool{'s' if count != 1 else ''} available"
        return McpTestResponse(
            ok=True,
            status="connected",
            message=f"Connected ({suffix})",
            tools_count=count,
            tools=[t.name for t in discovered_tools],
            tool_details=discovered_tools,
            latency_ms=elapsed_ms,
        )
    except BaseException as exc:
        elapsed_ms = int((time.perf_counter() - start_time) * 1000)
        root_msg = _extract_root_error_message(exc)
        # [Error Enrichment] Replace generic SDK messages with captured HTTP status or stderr
        if diagnostics.get("http_error") and (
            "error response" in root_msg.lower() or "not found" in root_msg.lower()
        ):
            root_msg = diagnostics["http_error"]
        elif diagnostics.get("stderr"):
            stderr_msg = diagnostics["stderr"]
            if "Unable to find image" in stderr_msg or "No such image" in stderr_msg:
                root_msg = (
                    f"Sandbox image '{DEFAULT_SANDBOX_IMAGE}' not found. "
                    "Build it with: docker build -t mcp-sandbox:latest infra/mcp-sandbox"
                )
            else:
                root_msg = f"{root_msg} ({stderr_msg})"

        return McpTestResponse(
            ok=False,
            status="failed",
            message=root_msg,
            tools_count=0,
            tools=[],
            latency_ms=elapsed_ms,
        )


async def list_mcp_tool_schemas(
    payload: McpServerPayload,
    timeout_seconds: float | None = None,
) -> list[dict[str, Any]]:
    """Discovers full MCP tool schemas (name, description, inputSchema) from a server.

    Args:
        payload (McpServerPayload): MCP server configuration payload.
        timeout_seconds (float | None, optional): Maximum time allowed for discovery.

    Returns:
        list[dict[str, Any]]: List of tool schema dicts.
    """
    effective_timeout = (
        timeout_seconds
        if timeout_seconds is not None
        else (60.0 if payload.type == "stdio" else 15.0)
    )

    async def _discover(session: ClientSession) -> list[dict[str, Any]]:
        tools_result = await session.list_tools()
        return [
            {
                "name": t.name,
                "description": (getattr(t, "description", None) or "").strip(),
                "inputSchema": getattr(t, "inputSchema", None)
                or {"type": "object", "properties": {}},
            }
            for t in getattr(tools_result, "tools", [])
        ]

    diagnostics: dict[str, Any] = {}
    return cast(
        list[dict[str, Any]],
        await asyncio.wait_for(
            _probe_transport(payload, diagnostics, _discover),
            timeout=effective_timeout,
        ),
    )


async def call_mcp_tool(
    payload: McpServerPayload,
    tool_name: str,
    arguments: dict[str, Any],
    timeout_seconds: float = 30.0,
) -> str:
    """Executes a single tool call on an MCP server and returns text output.

    Args:
        payload (McpServerPayload): MCP server configuration payload.
        tool_name (str): Exact tool identifier exposed by the MCP server.
        arguments (dict[str, Any]): JSON arguments matching the tool's inputSchema.
        timeout_seconds (float, optional): Execution timeout in seconds. Defaults to 30.0.

    Returns:
        str: Serialized tool execution output text.
    """

    async def _invoke(session: ClientSession) -> str:
        result = await session.call_tool(tool_name, arguments=arguments)
        parts: list[str] = []
        for item in getattr(result, "content", []) or []:
            text = getattr(item, "text", None)
            if text is not None:
                parts.append(str(text))
            else:
                parts.append(str(item))
        output_text = "\n".join(parts) if parts else str(result)
        if getattr(result, "isError", False):
            raise RuntimeError(output_text or f"MCP tool '{tool_name}' returned an error.")
        return output_text

    diagnostics: dict[str, Any] = {}
    return cast(
        str,
        await asyncio.wait_for(
            _probe_transport(payload, diagnostics, _invoke),
            timeout=timeout_seconds,
        ),
    )
