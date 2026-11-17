"""Global Pytest configuration and shared fixture definitions for the test suite.

This module provides reusable fixtures for unit, integration, and evaluation tests,
including mock settings, temporary YAML configuration files, and FastAPI TestClient instances.
"""

from collections.abc import Generator
from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy.orm import Session, sessionmaker

from app.core.auth import AuthContext, get_auth_context
from app.core.config import EnvironmentType, Settings
from app.core.database import SessionLocal
from app.core.permissions import ALL_PERMISSIONS
from app.main import app
from app.models.auth import User, Workspace, WorkspaceMember

TEST_USER_ID = "00000000-0000-0000-0000-000000000001"
TEST_WORKSPACE_ID = "00000000-0000-0000-0000-000000000002"


def ensure_test_tenant_in_db(
    db_session_factory: sessionmaker[Session] = SessionLocal,
) -> AuthContext:
    """Ensures a deterministic test User and Workspace exist in the active DB and returns AuthContext."""
    db = db_session_factory()
    try:
        user = db.query(User).filter(User.id == TEST_USER_ID).first()
        if not user:
            user = User(
                id=TEST_USER_ID,
                email="test-owner@example.com",
                full_name="Test Owner",
                is_superadmin=True,
                auth_provider="local",
            )
            db.add(user)
            db.flush()
        ws = db.query(Workspace).filter(Workspace.id == TEST_WORKSPACE_ID).first()
        if not ws:
            ws = Workspace(
                id=TEST_WORKSPACE_ID,
                name="Test Workspace",
                slug="test-workspace",
                plan_tier="enterprise",
                owner_id=TEST_USER_ID,
            )
            db.add(ws)
            db.flush()
        mem = (
            db.query(WorkspaceMember)
            .filter(
                WorkspaceMember.workspace_id == TEST_WORKSPACE_ID,
                WorkspaceMember.user_id == TEST_USER_ID,
            )
            .first()
        )
        if not mem:
            db.add(
                WorkspaceMember(
                    workspace_id=TEST_WORKSPACE_ID,
                    user_id=TEST_USER_ID,
                    role="owner",
                )
            )
        db.commit()
    finally:
        db.close()

    return AuthContext(
        user_id=TEST_USER_ID,
        email="test-owner@example.com",
        full_name="Test Owner",
        is_superadmin=True,
        workspace_id=TEST_WORKSPACE_ID,
        workspace_name="Test Workspace",
        workspace_plan="enterprise",
        role="owner",
        permissions=ALL_PERMISSIONS,
        auth_method="jwt",
    )


@pytest.fixture
def mock_settings() -> Settings:
    """Fixture providing a deterministic test settings instance.

    Returns:
        Settings: Configured settings object for testing mode.
    """
    return Settings(
        app_name="Test Platform",
        environment=EnvironmentType.TESTING,
        debug=True,
        secret_key=SecretStr("test-secret-key-for-testing-only"),
        database_url=SecretStr("sqlite:///:memory:"),
    )


@pytest.fixture
def temp_yaml_config(tmp_path: Path) -> Generator[Path, None, None]:
    """Fixture creating a temporary YAML configuration file for testing.

    Args:
        tmp_path (Path): Pytest temporary directory path.

    Yields:
        Path: Path to the temporary YAML file.
    """
    config_path = tmp_path / "test_config.yaml"
    data = {
        "app_name": "YAML Test Platform",
        "environment": "testing",
        "debug": True,
    }
    with open(config_path, "w", encoding="utf-8") as f:
        yaml.dump(data, f)

    yield config_path


@pytest.fixture
def api_client() -> Generator[TestClient, None, None]:
    """Fixture providing an authenticated FastAPI TestClient instance.

    Yields:
        TestClient: Configured HTTP test client with owner AuthContext override.
    """
    ctx = ensure_test_tenant_in_db(SessionLocal)
    app.dependency_overrides[get_auth_context] = lambda: ctx
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_auth_context, None)
