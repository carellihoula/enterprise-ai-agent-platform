"""HTTP rate limiting powered by SlowAPI with Redis storage and in-memory fallback."""

from __future__ import annotations

import hashlib
from typing import Any

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import EnvironmentType, Settings, get_settings


def get_client_ip(request: Request) -> str:
    """Extracts the client IP address for rate-limiting keys.

    Respects the ``X-Forwarded-For`` header when the backend runs behind a reverse
    proxy, falling back to the direct socket peer address.

    Args:
        request (Request): Incoming FastAPI HTTP request.

    Returns:
        str: Normalized client IP address string.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        # [Proxy] Use the leftmost client IP from the X-Forwarded-For chain
        first_ip = forwarded.split(",")[0].strip()
        if first_ip:
            return first_ip
    return get_remote_address(request)


def get_rate_limit_key(request: Request) -> str:
    """Extracts a per-identity rate-limiting key for authenticated or anonymous callers.

    Prioritizes explicit API keys and Bearer tokens (hashed) so users sharing a NAT IP
    in self-hosted or enterprise environments maintain independent rate-limit buckets,
    falling back to the client IP address.

    Args:
        request (Request): Incoming FastAPI HTTP request.

    Returns:
        str: Scoped rate-limit bucket identifier.
    """
    api_key = request.headers.get("x-api-key")
    if api_key:
        digest = hashlib.sha256(api_key.strip().encode("utf-8")).hexdigest()[:16]
        return f"apikey:{digest}"

    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
        if token:
            digest = hashlib.sha256(token.encode("utf-8")).hexdigest()[:16]
            return f"bearer:{digest}"

    return f"ip:{get_client_ip(request)}"


def _resolve_storage_uri(settings: Settings) -> str:
    """Builds the SlowAPI/limits storage URI from application settings.

    Args:
        settings (Settings): Loaded application configuration.

    Returns:
        str: Redis connection URI or ``memory://`` when running in testing mode.
    """
    if settings.environment == EnvironmentType.TESTING:
        # [Testing] Avoid external Redis socket timeouts during isolated unit tests
        return "memory://"
    if settings.redis_url:
        return settings.redis_url.get_secret_value()
    return f"redis://{settings.redis_host}:{settings.redis_port}"


def _build_limiter() -> Limiter:
    """Instantiates the shared SlowAPI Limiter with Redis and in-memory fallback.

    Returns:
        Limiter: Configured SlowAPI limiter instance.
    """
    settings = get_settings()
    storage_uri = _resolve_storage_uri(settings)
    storage_options: dict[str, Any] = (
        {"socket_connect_timeout": 0.5, "socket_timeout": 0.5}
        if storage_uri.startswith(("redis://", "rediss://"))
        else {}
    )

    return Limiter(
        key_func=get_client_ip,
        storage_uri=storage_uri,
        storage_options=storage_options,
        in_memory_fallback_enabled=True,
        headers_enabled=True,
        enabled=settings.rate_limit_enabled,
    )


# [Singleton] Shared SlowAPI limiter attached to FastAPI app.state and route decorators
limiter = _build_limiter()
