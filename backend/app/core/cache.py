"""Redis-backed auth caching and rate limiting with graceful in-memory fallback."""

from __future__ import annotations

import json
import logging
import threading
import time
from typing import Any

import redis

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class AuthCache:
    """Cache and rate-limiter backed by Redis with an automatic in-process fallback.

    Using Redis keeps JWT/API-key authorization checks sub-millisecond while still allowing
    instantaneous revocation when roles, memberships, or API keys change. When Redis is
    unavailable (e.g., isolated unit tests), operations transparently fall back to a
    thread-safe in-memory store.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._mem_kv: dict[str, tuple[str, float]] = {}
        self._redis_client: redis.Redis | None = None
        self._redis_checked = False

    def _get_redis(self) -> redis.Redis | None:
        """Lazily initializes and pings a Redis client once.

        Returns:
            redis.Redis | None: Connected Redis client, or ``None`` if unreachable.
        """
        if self._redis_checked:
            return self._redis_client

        self._redis_checked = True
        settings = get_settings()
        try:
            if settings.redis_url:
                client = redis.from_url(
                    settings.redis_url.get_secret_value(),
                    decode_responses=True,
                    socket_connect_timeout=1.0,
                    socket_timeout=1.0,
                )
            else:
                client = redis.Redis(
                    host=settings.redis_host,
                    port=settings.redis_port,
                    decode_responses=True,
                    socket_connect_timeout=1.0,
                    socket_timeout=1.0,
                )
            client.ping()
            self._redis_client = client
        except Exception as exc:
            logger.info(f"[AuthCache] Redis unavailable ({exc}); using in-memory fallback.")
            self._redis_client = None
        return self._redis_client

    def get_json(self, key: str) -> dict[str, Any] | None:
        """Retrieves a JSON dictionary from cache if present and unexpired.

        Args:
            key (str): Cache key.

        Returns:
            dict[str, Any] | None: Cached dictionary, or ``None`` on miss.
        """
        client = self._get_redis()
        if client is not None:
            try:
                raw = client.get(key)
                if isinstance(raw, str):
                    loaded = json.loads(raw)
                    return loaded if isinstance(loaded, dict) else None
                return None
            except Exception:
                pass

        now = time.monotonic()
        with self._lock:
            entry = self._mem_kv.get(key)
            if not entry:
                return None
            raw_val, expires_at = entry
            if now >= expires_at:
                self._mem_kv.pop(key, None)
                return None
            loaded = json.loads(raw_val)
            return loaded if isinstance(loaded, dict) else None

    def set_json(self, key: str, value: dict[str, Any], ttl_seconds: int = 60) -> None:
        """Stores a JSON-serializable dictionary in cache with a TTL.

        Args:
            key (str): Cache key.
            value (dict[str, Any]): Payload dictionary.
            ttl_seconds (int, optional): Expiration in seconds. Defaults to 60.
        """
        serialized = json.dumps(value)
        client = self._get_redis()
        if client is not None:
            try:
                client.set(key, serialized, ex=ttl_seconds)
                return
            except Exception:
                pass

        with self._lock:
            self._mem_kv[key] = (serialized, time.monotonic() + ttl_seconds)

    def delete(self, key: str) -> None:
        """Deletes a single cache entry if it exists.

        Args:
            key (str): Cache key to invalidate.
        """
        client = self._get_redis()
        if client is not None:
            try:
                client.delete(key)
            except Exception:
                pass

        with self._lock:
            self._mem_kv.pop(key, None)

    def invalidate_auth_context(self, user_id: str, workspace_id: str) -> None:
        """Invalidates cached authorization context for a user/workspace pair.

        Args:
            user_id (str): User UUID.
            workspace_id (str): Workspace UUID.
        """
        self.delete(f"auth_ctx:{user_id}:{workspace_id}")

    def invalidate_api_key(self, key_hash: str) -> None:
        """Invalidates cached API key metadata immediately upon revocation.

        Args:
            key_hash (str): SHA-256 hash of the revoked API key.
        """
        self.delete(f"api_key:{key_hash}")

    def reset_memory_store(self) -> None:
        """Clears in-memory cache entries (intended for unit tests)."""
        with self._lock:
            self._mem_kv.clear()


# [Singleton] Shared auth cache instance used across security dependencies and endpoints
auth_cache = AuthCache()
