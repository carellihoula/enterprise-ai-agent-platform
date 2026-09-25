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

from app.core.config import EnvironmentType, Settings
from app.main import app


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
def api_client() -> TestClient:
    """Fixture providing a FastAPI TestClient instance.

    Returns:
        TestClient: Configured HTTP test client for testing API endpoints.
    """
    return TestClient(app)
