from __future__ import annotations

import time
from typing import Optional, Any

from app.core.config import settings

try:
    import redis
except Exception:  # pragma: no cover - optional dependency
    redis = None


class SimpleMemoryRateLimiter:
    """In-memory rate limiter and cache used when Redis is not configured.

    Not suitable for multi-process/multi-host deployments but useful for
    development and CI where Redis is not available.
    """

    def __init__(self) -> None:
        # key -> (count, expires_at)
        self._store: dict[str, tuple[int, float]] = {}
        # key -> (value, expires_at)
        self._cache: dict[str, tuple[Any, float]] = {}

    def incr(self, key: str, window: int) -> int:
        now = time.time()
        count, expires_at = self._store.get(key, (0, now + window))
        if now > expires_at:
            count = 0
            expires_at = now + window
        count += 1
        self._store[key] = (count, expires_at)
        return count

    def ttl(self, key: str) -> int:
        now = time.time()
        if key not in self._store:
            return 0
        _, expires_at = self._store[key]
        remaining = int(max(0, expires_at - now))
        return remaining

    def set(self, key: str, value: Any, expire: int) -> None:
        self._cache[key] = (value, time.time() + expire)

    def get(self, key: str) -> Any:
        now = time.time()
        if key not in self._cache:
            return None
        val, expires_at = self._cache[key]
        if now > expires_at:
            self._cache.pop(key, None)
            return None
        return val

    def delete(self, key: str) -> None:
        self._cache.pop(key, None)


# Singleton instances
_memory_limiter: Optional[SimpleMemoryRateLimiter] = None
_redis_client = None


def get_redis():
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    if settings.redis_url and redis is not None:
        # Enable connection pooling robustness features for cloud deployments
        _redis_client = redis.from_url(
            settings.redis_url,
            socket_timeout=5,
            socket_connect_timeout=5,
            socket_keepalive=True,
            retry_on_timeout=True,
            health_check_interval=30
        )
        return _redis_client
    return None


def get_memory_limiter() -> SimpleMemoryRateLimiter:
    global _memory_limiter
    if _memory_limiter is None:
        _memory_limiter = SimpleMemoryRateLimiter()
    return _memory_limiter
