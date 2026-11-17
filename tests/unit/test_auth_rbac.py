"""Unit tests for authentication, refresh rotation, RBAC, anti-IDOR isolation, API keys, and audit logs."""

from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.auth import REFRESH_COOKIE_NAME
from app.core.cache import auth_cache
from app.core.database import Base, get_db
from app.main import app


def _create_auth_test_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """Creates an isolated TestClient backed by an in-memory SQLite DB with real auth enabled."""
    monkeypatch.setenv("CHAT_UPLOADS_DIR", str(tmp_path / "uploads"))
    auth_cache.reset_memory_store()
    app.dependency_overrides.clear()

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db() -> Generator[Session, None, None]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


def test_unauthenticated_requests_are_rejected(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Verifies protected endpoints return 401 when no bearer token is supplied."""
    client = _create_auth_test_client(tmp_path, monkeypatch)
    try:
        assert client.get("/api/v1/agents").status_code == 401
        assert client.get("/api/v1/sessions").status_code == 401
        assert client.get("/api/v1/auth/me").status_code == 401
    finally:
        app.dependency_overrides.clear()


def test_bootstrap_register_login_and_refresh_theft_detection(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Verifies self-hosted first-admin bootstrap, login, and refresh token reuse revocation."""
    client = _create_auth_test_client(tmp_path, monkeypatch)
    try:
        status_before = client.get("/api/v1/auth/bootstrap-status").json()
        assert status_before["needs_setup"] is True

        reg = client.post(
            "/api/v1/auth/register",
            json={
                "email": "admin@acme.com",
                "password": "StrongPassword123!",
                "full_name": "Admin User",
            },
        )
        assert reg.status_code == 201
        reg_data = reg.json()
        assert reg_data["user"]["is_superadmin"] is True
        assert reg_data["workspaces"][0]["role"] == "owner"

        status_after = client.get("/api/v1/auth/bootstrap-status").json()
        assert status_after["needs_setup"] is False

        login = client.post(
            "/api/v1/auth/login",
            json={"email": "admin@acme.com", "password": "StrongPassword123!"},
        )
        assert login.status_code == 200
        old_refresh = login.cookies.get(REFRESH_COOKIE_NAME)
        assert old_refresh

        # Rotate once -> succeeds
        ref1 = client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
        assert ref1.status_code == 200
        new_refresh = ref1.cookies.get(REFRESH_COOKIE_NAME)
        assert new_refresh and new_refresh != old_refresh

        # Reuse old token -> theft detected, whole family revoked
        reuse = client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
        assert reuse.status_code == 401

        # Even the newer token in the same family is now revoked
        ref_after_theft = client.post("/api/v1/auth/refresh", json={"refresh_token": new_refresh})
        assert ref_after_theft.status_code == 401
    finally:
        app.dependency_overrides.clear()


def test_rbac_team_isolation_api_keys_and_audit_logs(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Verifies RBAC roles, anti-IDOR isolation, scoped API keys, and audit logs."""
    client = _create_auth_test_client(tmp_path, monkeypatch)
    try:
        # 1. Owner registers and creates a Team Workspace
        owner_reg = client.post(
            "/api/v1/auth/register",
            json={"email": "owner@acme.com", "password": "Password123!"},
        )
        assert owner_reg.status_code == 201
        owner_token = owner_reg.json()["access_token"]
        owner_headers = {"Authorization": f"Bearer {owner_token}"}

        team_ws = client.post(
            "/api/v1/workspaces",
            json={"name": "Acme Engineering", "plan_tier": "team"},
            headers=owner_headers,
        )
        assert team_ws.status_code == 201
        team_ws_id = team_ws.json()["id"]
        owner_team_headers = {
            "Authorization": f"Bearer {owner_token}",
            "X-Workspace-Id": team_ws_id,
        }

        # 2. Owner invites Bob as `viewer`
        inv = client.post(
            f"/api/v1/workspaces/{team_ws_id}/invitations",
            json={"email": "bob@acme.com", "role": "viewer"},
            headers=owner_team_headers,
        )
        assert inv.status_code == 201
        inv_token = inv.json()["invite_token"]

        bob_reg = client.post(
            "/api/v1/auth/register",
            json={
                "email": "bob@acme.com",
                "password": "Password123!",
                "invitation_token": inv_token,
            },
        )
        assert bob_reg.status_code == 201
        bob_id = bob_reg.json()["user"]["id"]
        bob_token = bob_reg.json()["access_token"]
        bob_team_headers = {
            "Authorization": f"Bearer {bob_token}",
            "X-Workspace-Id": team_ws_id,
        }

        # 3. Viewer can read agents, but cannot create agents or sessions
        assert client.get("/api/v1/agents", headers=bob_team_headers).status_code == 200
        assert (
            client.post(
                "/api/v1/agents",
                json={"name": "Blocked Agent", "instructions": "test"},
                headers=bob_team_headers,
            ).status_code
            == 403
        )
        assert (
            client.post(
                "/api/v1/sessions",
                json={"title": "Blocked Session"},
                headers=bob_team_headers,
            ).status_code
            == 403
        )

        # 4. Owner upgrades Bob to `builder` -> cache invalidated immediately -> Bob can create agents
        patch_role = client.patch(
            f"/api/v1/workspaces/{team_ws_id}/members/{bob_id}",
            json={"role": "builder"},
            headers=owner_team_headers,
        )
        assert patch_role.status_code == 200
        created_agent = client.post(
            "/api/v1/agents",
            json={
                "name": "Shared Team Agent",
                "instructions": "Help the team.",
                "model": {"provider_id": "openai", "model_name": "gpt-4o"},
            },
            headers=bob_team_headers,
        )
        assert created_agent.status_code == 201

        # 5. Anti-IDOR: Owner's session and attachment in Team Workspace are invisible to Bob
        owner_sess = client.post(
            "/api/v1/sessions",
            json={"title": "Owner Private Chat"},
            headers=owner_team_headers,
        )
        assert owner_sess.status_code == 201
        owner_sess_id = owner_sess.json()["id"]

        owner_att = client.post(
            "/api/v1/attachments",
            files={"file": ("secret.png", b"\x89PNG\r\n\x1a\n", "image/png")},
            headers=owner_team_headers,
        )
        assert owner_att.status_code == 201
        owner_att_id = owner_att.json()["id"]

        assert (
            client.get(f"/api/v1/sessions/{owner_sess_id}", headers=bob_team_headers).status_code
            == 404
        )
        assert (
            client.get(
                f"/api/v1/attachments/{owner_att_id}/content", headers=bob_team_headers
            ).status_code
            == 404
        )

        # 6. Scoped API key: `agents:read` allows GET /agents, blocks POST /agents, and revokes cleanly
        key_resp = client.post(
            f"/api/v1/workspaces/{team_ws_id}/api-keys",
            json={"name": "Readonly SDK", "scopes": ["agents:read"]},
            headers=owner_team_headers,
        )
        assert key_resp.status_code == 201
        key_id = key_resp.json()["id"]
        raw_key = key_resp.json()["raw_key"]
        api_key_headers = {"Authorization": f"Bearer {raw_key}"}

        assert client.get("/api/v1/agents", headers=api_key_headers).status_code == 200
        assert (
            client.post(
                "/api/v1/agents",
                json={"name": "Nope", "instructions": "Nope"},
                headers=api_key_headers,
            ).status_code
            == 403
        )

        revoke_resp = client.delete(
            f"/api/v1/workspaces/{team_ws_id}/api-keys/{key_id}",
            headers=owner_team_headers,
        )
        assert revoke_resp.status_code == 204
        assert client.get("/api/v1/agents", headers=api_key_headers).status_code == 401

        # 7. Audit log records governance actions
        audit_resp = client.get(
            f"/api/v1/workspaces/{team_ws_id}/audit-logs",
            headers=owner_team_headers,
        )
        assert audit_resp.status_code == 200
        actions = {entry["action"] for entry in audit_resp.json()}
        assert {
            "workspace.create",
            "member.invite",
            "member.role_update",
            "apikey.create",
            "apikey.revoke",
        } <= actions
    finally:
        app.dependency_overrides.clear()


def test_social_oauth_discovery(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verifies Google/GitHub/Microsoft OAuth2 discovery when unconfigured vs configured."""
    from pydantic import SecretStr

    from app.api.v1 import auth as auth_router_mod
    from app.core.config import Settings

    client = _create_auth_test_client(tmp_path, monkeypatch)
    try:
        monkeypatch.setattr(
            auth_router_mod, "get_settings", lambda: Settings(deployment_mode="saas")
        )
        res_saas = client.post("/api/v1/auth/oidc/discover", json={"provider": "Google"})
        assert res_saas.status_code == 200
        assert res_saas.json()["configured"] is False
        assert "GOOGLE_CLIENT_ID" not in (res_saas.json()["message"] or "")
        assert ".env" not in (res_saas.json()["message"] or "")

        monkeypatch.setattr(
            auth_router_mod, "get_settings", lambda: Settings(deployment_mode="self_hosted")
        )
        res_unconf = client.post("/api/v1/auth/oidc/discover", json={"provider": "Google"})
        assert res_unconf.status_code == 200
        assert res_unconf.json()["configured"] is False
        assert "GOOGLE_CLIENT_ID" in (res_unconf.json()["message"] or "")

        monkeypatch.setattr(
            auth_router_mod,
            "get_settings",
            lambda: Settings(
                google_client_id="test-google-client-id",
                google_client_secret=SecretStr("test-google-secret"),
            ),
        )
        res_conf = client.post("/api/v1/auth/oidc/discover", json={"provider": "Google"})
        assert res_conf.status_code == 200
        assert res_conf.json()["configured"] is True
        assert res_conf.json()["authorize_url"] == "/api/v1/auth/oauth/google/login"
    finally:
        app.dependency_overrides.clear()
