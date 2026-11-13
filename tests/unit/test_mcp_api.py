"""Unit tests for the Model Context Protocol (MCP) configuration API.

This module verifies bulk synchronization (both structured servers list and raw mcpServers JSON),
single server CRUD lifecycle, and transport-specific validation rules.
"""

from fastapi.testclient import TestClient

from app.core.database import SessionLocal, init_db
from app.engine.mcp_client import _build_sandbox_docker_args
from app.main import app
from app.models.entities import McpServer
from app.models.mcp import McpServerPayload


def setup_module() -> None:
    """Initializes the database schema before executing the MCP API test suite."""
    init_db()


def test_mcp_bulk_sync_and_crud_lifecycle() -> None:
    """Validates bulk synchronization via structured servers and raw mcpServers JSON, plus CRUD endpoints."""
    client = TestClient(app)
    db = SessionLocal()

    try:
        # [Cleanup] Ensure clean initial state for workspace-scoped MCP servers
        db.query(McpServer).filter(McpServer.agent_id.is_(None)).delete()
        db.commit()

        # 1. Initial GET should return empty configuration
        initial_resp = client.get("/api/v1/mcp")
        assert initial_resp.status_code == 200
        assert initial_resp.json() == {"servers": [], "mcpServers": {}}

        # 2. Bulk PUT using structured servers list
        sync_payload = {
            "servers": [
                {
                    "name": "github",
                    "type": "stdio",
                    "command": "npx",
                    "args": ["-y", "@modelcontextprotocol/server-github"],
                    "env": {"GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"},
                    "disabled": False,
                },
                {
                    "name": "sentry",
                    "type": "http",
                    "url": "https://mcp.sentry.dev/mcp",
                    "headers": {"Authorization": "Bearer ${SENTRY_TOKEN}"},
                    "disabled": True,
                },
            ]
        }
        put_resp = client.put("/api/v1/mcp", json=sync_payload)
        assert put_resp.status_code == 200
        put_data = put_resp.json()
        assert len(put_data["servers"]) == 2
        assert "github" in put_data["mcpServers"]
        assert put_data["mcpServers"]["github"]["command"] == "npx"
        assert put_data["mcpServers"]["sentry"]["disabled"] is True

        # 3. Bulk PUT using raw mcpServers JSON format
        raw_json_payload = {
            "mcpServers": {
                "linear": {
                    "type": "sse",
                    "url": "https://mcp.linear.app/sse",
                }
            }
        }
        raw_put_resp = client.put("/api/v1/mcp", json=raw_json_payload)
        assert raw_put_resp.status_code == 200
        raw_data = raw_put_resp.json()
        assert len(raw_data["servers"]) == 1
        assert raw_data["servers"][0]["name"] == "linear"
        assert raw_data["servers"][0]["type"] == "sse"

        # 4. Create single server via POST /api/v1/mcp/servers
        post_resp = client.post(
            "/api/v1/mcp/servers",
            json={
                "name": "postgres",
                "type": "stdio",
                "command": "uvx",
                "args": ["mcp-server-postgres", "--readonly"],
                "env": {"DATABASE_URL": "postgresql://readonly@localhost:5432/db"},
            },
        )
        assert post_resp.status_code == 201
        created_srv = post_resp.json()
        srv_id = created_srv["id"]

        # 5. Update single server via PUT /api/v1/mcp/servers/{id}
        upd_resp = client.put(
            f"/api/v1/mcp/servers/{srv_id}",
            json={
                "name": "postgres",
                "type": "stdio",
                "command": "uvx",
                "args": ["mcp-server-postgres"],
                "env": {},
                "disabled": True,
            },
        )
        assert upd_resp.status_code == 200
        assert upd_resp.json()["disabled"] is True

        # 6. Delete single server via DELETE /api/v1/mcp/servers/{id}
        del_resp = client.delete(f"/api/v1/mcp/servers/{srv_id}")
        assert del_resp.status_code == 204
    finally:
        db.query(McpServer).filter(McpServer.agent_id.is_(None)).delete()
        db.commit()
        db.close()


def test_mcp_sandbox_isolation_and_ssrf_protection() -> None:
    """Validates disposable Docker sandbox args and SSRF blocking on /api/v1/mcp/test."""
    payload = McpServerPayload(
        name="github",
        type="stdio",
        command="npx",
        args=["-y", "@modelcontextprotocol/server-github"],
        env={"GITHUB_TOKEN": "ghp_test123"},
    )
    docker_args = _build_sandbox_docker_args(payload)
    assert "--rm" in docker_args
    assert "-i" in docker_args
    assert "--cap-drop=ALL" in docker_args
    assert "--security-opt=no-new-privileges" in docker_args
    assert "--user=nobody" in docker_args
    assert "mcp_sandbox_cache:/tmp/mcp-home" in docker_args
    assert "GITHUB_TOKEN=ghp_test123" in docker_args
    assert all("DATABASE_URL" not in arg and "SECRET_KEY" not in arg for arg in docker_args)

    client = TestClient(app)
    ssrf_resp = client.post(
        "/api/v1/mcp/test",
        json={
            "name": "internal-db",
            "type": "http",
            "url": "http://127.0.0.1:5433/mcp",
        },
    )
    assert ssrf_resp.status_code == 200
    body = ssrf_resp.json()
    assert body["ok"] is False
    assert body["status"] == "failed"
    assert "blocked" in body["message"].lower()
