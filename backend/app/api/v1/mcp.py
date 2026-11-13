"""API endpoints for managing Model Context Protocol (MCP) server configurations.

This module provides FastAPI routes for listing, synchronizing, creating, updating,
and deleting MCP server configurations in both structured form and raw mcp.json formats.
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.engine.mcp_client import probe_mcp_server
from app.models.entities import Agent, McpServer
from app.models.mcp import (
    McpConfigResponse,
    McpConfigSyncRequest,
    McpConnectionStatus,
    McpServerPayload,
    McpServerResponse,
    McpTestResponse,
    McpToolInfo,
    McpTransport,
    parse_mcp_json_entry,
    server_to_mcp_json_entry,
)

router = APIRouter(prefix="/mcp", tags=["MCP"])


def _to_server_response(record: McpServer) -> McpServerResponse:
    """Converts a McpServer ORM entity into a McpServerResponse schema.

    Args:
        record (McpServer): Database ORM entity.

    Returns:
        McpServerResponse: Validated public response schema.
    """
    transport_val: McpTransport = (
        record.transport if record.transport in ("stdio", "http", "sse") else "stdio"  # type: ignore[assignment]
    )
    conn_status: McpConnectionStatus = (
        record.connection_status
        if record.connection_status in ("idle", "connected", "failed")
        else "idle"  # type: ignore[assignment]
    )
    parsed_tools = [
        McpToolInfo(**t) if isinstance(t, dict) else McpToolInfo(name=str(t))
        for t in (record.discovered_tools or [])
    ]
    return McpServerResponse(
        id=record.id,
        agent_id=record.agent_id,
        name=record.name,
        type=transport_val,
        command=record.command or "",
        args=record.args or [],
        env=record.env or {},
        url=record.url or "",
        headers=record.headers or {},
        disabled=bool(record.disabled),
        extra=record.extra or {},
        connection_status=conn_status,
        connection_message=record.connection_message,
        tools_count=record.tools_count or 0,
        discovered_tools=parsed_tools,
        latency_ms=record.latency_ms,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def _build_config_response(records: list[McpServer]) -> McpConfigResponse:
    """Builds a synchronized McpConfigResponse containing structured servers and mcpServers JSON map.

    Args:
        records (list[McpServer]): Ordered list of ORM server entities.

    Returns:
        McpConfigResponse: Combined structured and mcp.json representation.
    """
    server_responses = [_to_server_response(r) for r in records]
    mcp_map: dict[str, dict[str, Any]] = {}
    for srv in server_responses:
        mcp_map[srv.name] = server_to_mcp_json_entry(srv)

    return McpConfigResponse(servers=server_responses, mcpServers=mcp_map)


def _query_scoped_servers(db: Session, agent_id: str | None) -> list[McpServer]:
    """Queries MCP server records filtered by optional agent_id scope and ordered by sort_order.

    Args:
        db (Session): Active database session.
        agent_id (str | None): Optional agent UUID scope, or None for the global workspace catalog.

    Returns:
        list[McpServer]: Ordered list of matching McpServer entities.
    """
    query = db.query(McpServer)
    if agent_id:
        return (
            query.filter(McpServer.agent_id == agent_id)
            .order_by(McpServer.sort_order.asc(), McpServer.created_at.asc())
            .all()
        )
    # [Global Catalog] Return all workspace servers (including legacy agent-scoped rows)
    return query.order_by(
        McpServer.agent_id.is_(None).desc(),
        McpServer.sort_order.asc(),
        McpServer.created_at.asc(),
    ).all()


def _sync_agent_mcp_tools(db: Session, agent_id: str, records: list[McpServer]) -> None:
    """Synchronizes an Agent's tools JSON column with its bound MCP server configurations.

    Args:
        db (Session): Active database session.
        agent_id (str): Target Agent UUID.
        records (list[McpServer]): Current MCP server records for the agent.
    """
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        return

    # [Tool Preservation] Keep non-MCP tools intact while refreshing MCP server tool bindings
    existing_non_mcp = [
        t for t in (agent.tools or []) if isinstance(t, dict) and t.get("type") != "mcp"
    ]
    mcp_tool_entries = [
        {
            "name": r.name,
            "type": "mcp",
            "description": f"MCP ({r.transport}) server: {r.name}",
            "config": server_to_mcp_json_entry(_to_server_response(r)),
        }
        for r in records
        if not r.disabled
    ]
    agent.tools = existing_non_mcp + mcp_tool_entries


@router.get("", response_model=McpConfigResponse, status_code=status.HTTP_200_OK)
def get_mcp_config(
    db: Annotated[Session, Depends(get_db)],
    agent_id: Annotated[str | None, Query(description="Optional agent ID scope")] = None,
) -> McpConfigResponse:
    """Retrieves the current MCP server configuration in both structured and mcp.json formats.

    Args:
        db (Session): Database session dependency.
        agent_id (str | None): Optional agent UUID to scope configuration.

    Returns:
        McpConfigResponse: Current structured servers list and mcpServers dictionary.
    """
    records = _query_scoped_servers(db, agent_id)
    return _build_config_response(records)


@router.put("", response_model=McpConfigResponse, status_code=status.HTTP_200_OK)
def sync_mcp_config(
    payload: McpConfigSyncRequest,
    db: Annotated[Session, Depends(get_db)],
    agent_id: Annotated[str | None, Query(description="Optional agent ID scope")] = None,
) -> McpConfigResponse:
    """Atomically synchronizes the full MCP server configuration from form items or mcp.json.

    Args:
        payload (McpConfigSyncRequest): Sync payload containing either 'servers' or 'mcpServers'.
        db (Session): Database session dependency.
        agent_id (str | None): Optional agent UUID to scope configuration.

    Returns:
        McpConfigResponse: Updated and persisted MCP configuration.

    Raises:
        HTTPException: If validation fails or duplicate server names are detected.
    """
    normalized_items: list[McpServerPayload] = []

    if payload.servers is not None:
        normalized_items = payload.servers
    elif payload.mcpServers is not None:
        try:
            normalized_items = [
                parse_mcp_json_entry(name, cfg) for name, cfg in payload.mcpServers.items()
            ]
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(exc),
            ) from exc
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Either 'servers' list or 'mcpServers' object must be provided.",
        )

    # [Uniqueness Check] Reject duplicate server identifiers within the same configuration scope
    seen_names: set[str] = set()
    for item in normalized_items:
        if item.name in seen_names:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Duplicate MCP server name '{item.name}'.",
            )
        seen_names.add(item.name)

    existing_records = _query_scoped_servers(db, agent_id)
    existing_by_id = {r.id: r for r in existing_records}
    existing_by_name = {r.name: r for r in existing_records}

    kept_ids: set[str] = set()
    updated_records: list[McpServer] = []

    for index, item in enumerate(normalized_items):
        # [Identity Resolution] Match by explicit ID first, falling back to server name
        target = (
            existing_by_id.get(item.id)
            if item.id and item.id in existing_by_id
            else existing_by_name.get(item.name)
        )
        if target and target.id not in kept_ids:
            config_changed = (
                target.name != item.name
                or target.transport != item.type
                or (target.command or "") != (item.command if item.type == "stdio" else "")
                or (target.args or []) != (item.args if item.type == "stdio" else [])
                or (target.env or {}) != (item.env if item.type == "stdio" else {})
                or (target.url or "") != (item.url if item.type != "stdio" else "")
                or (target.headers or {}) != (item.headers if item.type != "stdio" else {})
            )
            target.name = item.name
            target.transport = item.type
            target.command = item.command if item.type == "stdio" else ""
            target.args = item.args if item.type == "stdio" else []
            target.env = item.env if item.type == "stdio" else {}
            target.url = item.url if item.type != "stdio" else ""
            target.headers = item.headers if item.type != "stdio" else {}
            target.disabled = item.disabled
            target.extra = item.extra
            target.sort_order = index

            # [Status Persistence] Keep tested status unless config changed without a fresh test
            if item.connection_status != "idle":
                target.connection_status = item.connection_status
                target.connection_message = item.connection_message
                target.tools_count = item.tools_count
                target.discovered_tools = [t.model_dump() for t in item.discovered_tools]
                target.latency_ms = item.latency_ms
            elif config_changed:
                target.connection_status = "idle"
                target.connection_message = None
                target.tools_count = 0
                target.discovered_tools = []
                target.latency_ms = None

            kept_ids.add(target.id)
            updated_records.append(target)
        else:
            new_record = McpServer(
                agent_id=agent_id,
                name=item.name,
                transport=item.type,
                command=item.command if item.type == "stdio" else "",
                args=item.args if item.type == "stdio" else [],
                env=item.env if item.type == "stdio" else {},
                url=item.url if item.type != "stdio" else "",
                headers=item.headers if item.type != "stdio" else {},
                disabled=item.disabled,
                extra=item.extra,
                sort_order=index,
                connection_status=item.connection_status,
                connection_message=item.connection_message,
                tools_count=item.tools_count,
                discovered_tools=[t.model_dump() for t in item.discovered_tools],
                latency_ms=item.latency_ms,
            )
            db.add(new_record)
            updated_records.append(new_record)

    # [Cleanup] Remove servers omitted from the synchronized configuration
    for old_record in existing_records:
        if old_record.id not in kept_ids:
            db.delete(old_record)

    db.flush()

    if agent_id:
        _sync_agent_mcp_tools(db, agent_id, updated_records)

    db.commit()
    for rec in updated_records:
        db.refresh(rec)

    return _build_config_response(updated_records)


@router.post("/servers", response_model=McpServerResponse, status_code=status.HTTP_201_CREATED)
def create_mcp_server(
    payload: McpServerPayload,
    db: Annotated[Session, Depends(get_db)],
    agent_id: Annotated[str | None, Query(description="Optional agent ID scope")] = None,
) -> McpServerResponse:
    """Creates a single MCP server configuration entry.

    Args:
        payload (McpServerPayload): New MCP server configuration payload.
        db (Session): Database session dependency.
        agent_id (str | None): Optional agent UUID scope.

    Returns:
        McpServerResponse: Newly persisted MCP server response.

    Raises:
        HTTPException: If a server with the same name already exists in the scope.
    """
    existing = _query_scoped_servers(db, agent_id)
    if any(r.name == payload.name for r in existing):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"MCP server '{payload.name}' already exists.",
        )

    record = McpServer(
        agent_id=agent_id,
        name=payload.name,
        transport=payload.type,
        command=payload.command if payload.type == "stdio" else "",
        args=payload.args if payload.type == "stdio" else [],
        env=payload.env if payload.type == "stdio" else {},
        url=payload.url if payload.type != "stdio" else "",
        headers=payload.headers if payload.type != "stdio" else {},
        disabled=payload.disabled,
        extra=payload.extra,
        sort_order=len(existing),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return _to_server_response(record)


@router.put(
    "/servers/{server_id}", response_model=McpServerResponse, status_code=status.HTTP_200_OK
)
def update_mcp_server(
    server_id: str,
    payload: McpServerPayload,
    db: Annotated[Session, Depends(get_db)],
) -> McpServerResponse:
    """Updates an existing MCP server configuration by ID.

    Args:
        server_id (str): Primary key UUID of the MCP server.
        payload (McpServerPayload): Updated MCP server fields.
        db (Session): Database session dependency.

    Returns:
        McpServerResponse: Updated MCP server response.

    Raises:
        HTTPException: If the server is not found or the new name conflicts with another server.
    """
    record = db.query(McpServer).filter(McpServer.id == server_id).first()
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"MCP server '{server_id}' not found.",
        )

    siblings = _query_scoped_servers(db, record.agent_id)
    if any(s.id != server_id and s.name == payload.name for s in siblings):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"MCP server '{payload.name}' already exists.",
        )

    record.name = payload.name
    record.transport = payload.type
    record.command = payload.command if payload.type == "stdio" else ""
    record.args = payload.args if payload.type == "stdio" else []
    record.env = payload.env if payload.type == "stdio" else {}
    record.url = payload.url if payload.type != "stdio" else ""
    record.headers = payload.headers if payload.type != "stdio" else {}
    record.disabled = payload.disabled
    record.extra = payload.extra

    db.commit()
    db.refresh(record)
    return _to_server_response(record)


@router.delete("/servers/{server_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_mcp_server(
    server_id: str,
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Deletes an MCP server configuration permanently.

    Args:
        server_id (str): Primary key UUID of the MCP server to delete.
        db (Session): Database session dependency.

    Raises:
        HTTPException: If the MCP server is not found.
    """
    record = db.query(McpServer).filter(McpServer.id == server_id).first()
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"MCP server '{server_id}' not found.",
        )

    db.delete(record)
    db.commit()


@router.post("/test", response_model=McpTestResponse, status_code=status.HTTP_200_OK)
async def test_mcp_server_connection(
    payload: McpServerPayload,
    db: Annotated[Session, Depends(get_db)],
) -> McpTestResponse:
    """Tests a live MCP server connection and returns handshake status and discovered tools.

    Args:
        payload (McpServerPayload): MCP server configuration to probe.
        db (Session): Database session dependency.

    Returns:
        McpTestResponse: Diagnostic result indicating whether the server is reachable and active.
    """
    result = await probe_mcp_server(payload)

    # [Status Persistence] Persist live test result if testing an existing saved server
    if payload.id:
        record = db.query(McpServer).filter(McpServer.id == payload.id).first()
        if record and (
            record.name == payload.name
            and record.transport == payload.type
            and (record.command or "") == (payload.command if payload.type == "stdio" else "")
            and (record.args or []) == (payload.args if payload.type == "stdio" else [])
            and (record.env or {}) == (payload.env if payload.type == "stdio" else {})
            and (record.url or "") == (payload.url if payload.type != "stdio" else "")
            and (record.headers or {}) == (payload.headers if payload.type != "stdio" else {})
        ):
            record.connection_status = result.status
            record.connection_message = result.message
            record.tools_count = result.tools_count
            record.discovered_tools = [t.model_dump() for t in result.tool_details]
            record.latency_ms = result.latency_ms
            db.commit()

    return result
