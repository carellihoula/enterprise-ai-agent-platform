"""Unit tests for system configuration management.

This module tests default settings initialization, YAML loading capabilities,
and environment profile configurations.
"""

from pathlib import Path

import pytest

from app.core.config import EnvironmentType, Settings


@pytest.mark.unit
def test_default_settings_initialization() -> None:
    """Tests default settings values upon instantiation."""
    settings = Settings()
    assert settings.app_name == "Enterprise AI Agent Platform"
    assert settings.environment == EnvironmentType.DEVELOPMENT
    assert settings.api_v1_prefix == "/api/v1"


@pytest.mark.unit
def test_load_settings_from_yaml(temp_yaml_config: Path) -> None:
    """Tests loading settings from a valid YAML configuration file.

    Args:
        temp_yaml_config (Path): Fixture path to temporary YAML configuration file.
    """
    settings = Settings.load_from_yaml(temp_yaml_config)
    assert settings.app_name == "YAML Test Platform"
    assert settings.environment == EnvironmentType.TESTING
    assert settings.debug is True
    assert settings.config_file_path == temp_yaml_config


@pytest.mark.unit
def test_yaml_config_not_found() -> None:
    """Tests error handling when specifying a non-existent YAML file path."""
    non_existent_path = Path("/invalid/path/to/non_existent_config.yaml")
    with pytest.raises(FileNotFoundError):
        Settings.load_from_yaml(non_existent_path)
