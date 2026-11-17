"""Application configuration module for the Enterprise AI Agent Platform.

This module defines the central configuration settings using Pydantic Settings,
supporting environment variables, YAML/JSON configuration files, environment-specific
profiles (development, staging, production, testing), and secret management.
"""

from enum import StrEnum
from pathlib import Path
from typing import Any, Literal, Self

import yaml
from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class EnvironmentType(StrEnum):
    """Enumeration of supported execution environments."""

    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"
    TESTING = "testing"


class Settings(BaseSettings):
    """Central configuration class loading settings from environment and config files.

    Attributes:
        app_name (str): Name of the application platform.
        environment (EnvironmentType): Current deployment environment mode.
        debug (bool): Flag indicating whether debug mode is enabled.
        api_v1_prefix (str): URL path prefix for API version 1.
        secret_key (SecretStr): Master secret key for encryption and session signing.
        database_url (SecretStr): Connection string for the primary relational database.
        config_file_path (Path | None): Optional path to a YAML configuration file.
    """

    app_name: str = Field(
        default="Enterprise AI Agent Platform",
        description="Name of the platform application",
    )
    environment: EnvironmentType = Field(
        default=EnvironmentType.DEVELOPMENT,
        description="Current deployment environment profile",
    )
    debug: bool = Field(
        default=False,
        description="Enable verbose debugging mode",
    )
    api_v1_prefix: str = Field(
        default="/api/v1",
        description="URL prefix for version 1 API endpoints",
    )
    secret_key: SecretStr = Field(
        default=SecretStr("insecure-default-change-in-production"),
        description="Secret key for security operations",
    )
    openai_api_key: SecretStr | None = Field(
        default=None,
        description="API key secret for OpenAI provider",
    )
    gemini_api_key: SecretStr | None = Field(
        default=None,
        description="API key secret for Google Gemini provider",
    )
    anthropic_api_key: SecretStr | None = Field(
        default=None,
        description="API key secret for Anthropic Claude provider",
    )
    mistral_api_key: SecretStr | None = Field(
        default=None,
        description="API key secret for Mistral AI provider",
    )
    groq_api_key: SecretStr | None = Field(
        default=None,
        description="API key secret for Groq provider",
    )
    openrouter_api_key: SecretStr | None = Field(
        default=None,
        description="API key secret for OpenRouter provider",
    )
    database_url: SecretStr = Field(
        default=SecretStr("sqlite:///./platform.db"),
        description="Database connection URI",
    )
    storage_backend: str = Field(
        default="local",
        description="Attachment storage backend ('local' for disk, 's3' for MinIO/AWS S3)",
    )
    s3_endpoint_url: str | None = Field(
        default=None,
        description="Custom S3-compatible endpoint URL (e.g., http://localhost:9000 for MinIO)",
    )
    s3_access_key_id: SecretStr | None = Field(
        default=None,
        description="Access key ID for S3 / MinIO object storage",
    )
    s3_secret_access_key: SecretStr | None = Field(
        default=None,
        description="Secret access key for S3 / MinIO object storage",
    )
    s3_bucket_name: str = Field(
        default="ai-platform-uploads",
        description="Target bucket name for S3 / MinIO object storage",
    )
    s3_region: str = Field(
        default="us-east-1",
        description="Region name for S3 / MinIO object storage",
    )
    s3_use_ssl: bool = Field(
        default=False,
        description="Whether to use TLS/SSL when connecting to the S3 endpoint",
    )
    auth_mode: Literal["local", "oidc", "hybrid"] = Field(
        default="local",
        description="Authentication mode ('local' email/password, 'oidc' SSO only, or 'hybrid')",
    )
    allow_public_signup: bool = Field(
        default=True,
        description="Allow self-service registration after initial admin bootstrap",
    )
    jwt_algorithm: str = Field(
        default="HS256",
        description="Signing algorithm for JWT access tokens",
    )
    access_token_expire_minutes: int = Field(
        default=15,
        description="Lifetime of short-lived JWT access tokens in minutes",
    )
    refresh_token_expire_days: int = Field(
        default=14,
        description="Lifetime of rotating refresh tokens in days",
    )
    cookie_secure: bool = Field(
        default=False,
        description="Set Secure flag on HttpOnly auth cookies (enable in HTTPS production)",
    )
    redis_host: str = Field(
        default="localhost",
        description="Redis host for auth caching and rate limiting",
    )
    redis_port: int = Field(
        default=6379,
        description="Redis TCP port",
    )
    redis_url: SecretStr | None = Field(
        default=None,
        description="Optional full Redis connection URL overriding host and port",
    )
    oidc_issuer_url: str | None = Field(
        default=None,
        description="Optional OIDC discovery issuer URL for enterprise SSO",
    )
    oidc_client_id: str | None = Field(
        default=None,
        description="Optional OIDC client ID",
    )
    oidc_client_secret: SecretStr | None = Field(
        default=None,
        description="Optional OIDC client secret",
    )
    oidc_redirect_uri: str | None = Field(
        default=None,
        description="Optional OIDC callback redirect URI",
    )
    config_file_path: Path | None = Field(
        default=None,
        description="Path to external YAML/JSON configuration file",
    )

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @classmethod
    def load_from_yaml(cls, yaml_path: Path) -> Self:
        """Loads configuration from a YAML file and overrides default settings.

        Args:
            yaml_path (Path): Path to the target YAML configuration file.

        Returns:
            Self: Instantiated settings object populated with YAML parameters.

        Raises:
            FileNotFoundError: If the specified YAML file path does not exist.
            ValueError: If the YAML content cannot be parsed into valid settings.
        """
        # [Validation] Ensure target configuration file exists before attempting to read
        if not yaml_path.exists():
            raise FileNotFoundError(f"Configuration file not found at: {yaml_path}")

        try:
            with open(yaml_path, encoding="utf-8") as file:
                yaml_data: dict[str, Any] = yaml.safe_load(file) or {}

            # [Parsing] Inject configuration file path into settings payload
            yaml_data["config_file_path"] = yaml_path
            return cls(**yaml_data)
        except yaml.YAMLError as exc:
            # [Resilience] Wrap YAML parsing errors into domain-friendly ValueError
            raise ValueError(f"Failed to parse YAML configuration file: {exc}") from exc


# [Singleton] Instantiate global settings instance for import across application modules
get_settings = Settings
