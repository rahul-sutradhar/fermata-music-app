from __future__ import annotations

import time
from typing import Callable, Any

from fastapi import status
from starlette.requests import Request
from starlette.responses import JSONResponse

import logging

from app.core.cache import get_redis, get_memory_limiter
from app.core.config import settings


class RateLimitMiddleware:
    """ASGI middleware implementing a simple Redis-backed rate limiter with
    an in-memory fallback.

    Keys are built from client IP + route path so limits are applied per-client
    per-endpoint. Auth endpoints use a stricter limit.
    """

    def __init__(self, app):
        self.app = app
        self.redis = get_redis()
        self.memory = get_memory_limiter()
        self.logger = logging.getLogger("app.middleware.rate_limiter")

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive=receive)

        # Exempt health/docs/metrics/openapi/captcha endpoints from rate limiting
        path = scope.get("path", "")
        if path in ("/health", "/docs", "/openapi.json", "/redoc") or path.startswith("/auth/captcha"):
            await self.app(scope, receive, send)
            return

        # Determine client identity
        client_host = request.client.host if request.client else "unknown"

        # Check CAPTCHA bypass token
        headers = dict(scope.get("headers", []))
        captcha_token = headers.get(b"x-captcha-token", b"").decode()
        
        is_captcha_valid = False
        if captcha_token:
            bypass_key = f"captcha_bypass:{captcha_token}"
            if self._cache_get(bypass_key) == "valid":
                is_captcha_valid = True

        # Lockout check for auth endpoints
        is_auth = path.startswith("/auth")
        lockout_key = f"lockout:ip:{client_host}"
        
        if is_auth and self._cache_get(lockout_key) == "locked":
            if is_captcha_valid:
                # Clear lockout on captcha verification success
                self._cache_delete(lockout_key)
                self._cache_delete(f"failed_attempts:ip:{client_host}")
            else:
                return await self._lockout_response(scope, receive, send)

        # Choose limits
        if is_auth:
            limit = settings.auth_rate_limit_requests
        else:
            limit = settings.rate_limit_requests
        window = settings.rate_limit_window_seconds

        key = f"rl:{client_host}:{path}"

        redis = get_redis()
        if redis is not None:
            try:
                # Use Redis INCR and EXPIRE atomically
                count = redis.incr(key)
                if count == 1:
                    redis.expire(key, window)
                if count > limit:
                    if is_captcha_valid:
                        # Reset limit if captcha is valid
                        redis.delete(key)
                    else:
                        ttl = redis.ttl(key) or window
                        # Log the violation
                        self.logger.warning(
                            "rate_limited redis key=%s path=%s client=%s count=%s limit=%s",
                            key,
                            path,
                            client_host,
                            count,
                            limit,
                        )
                        return await self._rate_limited(scope, receive, send, ttl)
            except Exception:
                # If redis has an issue, fall back to memory limiter
                memory = get_memory_limiter()
                count = memory.incr(key, window)
                if count > limit:
                    if is_captcha_valid:
                        memory.delete(key)
                    else:
                        ttl = memory.ttl(key)
                        self.logger.warning(
                            "rate_limited memory key=%s path=%s client=%s count=%s limit=%s",
                            key,
                            path,
                            client_host,
                            count,
                            limit,
                        )
                        return await self._rate_limited(scope, receive, send, ttl)
        else:
            memory = get_memory_limiter()
            count = memory.incr(key, window)
            if count > limit:
                if is_captcha_valid:
                    memory.delete(key)
                else:
                    ttl = memory.ttl(key)
                    self.logger.warning(
                        "rate_limited memory key=%s path=%s client=%s count=%s limit=%s",
                        key,
                        path,
                        client_host,
                        count,
                        limit,
                    )
                    return await self._rate_limited(scope, receive, send, ttl)

        await self.app(scope, receive, send)

    def _cache_get(self, key: str) -> Any:
        redis = get_redis()
        if redis is not None:
            try:
                val = redis.get(key)
                if val is not None:
                    if isinstance(val, bytes):
                        return val.decode()
                    return val
            except Exception:
                pass
        return self.memory.get(key)

    def _cache_delete(self, key: str) -> None:
        redis = get_redis()
        if redis is not None:
            try:
                redis.delete(key)
                return
            except Exception:
                pass
        self.memory.delete(key)

    async def _lockout_response(self, scope, receive, send: Callable):
        body = {"detail": "Too many failed attempts. Please solve CAPTCHA to continue.", "lockout": True}
        response = JSONResponse(status_code=status.HTTP_429_TOO_MANY_REQUESTS, content=body)
        await response(scope, receive, send)

    async def _rate_limited(self, scope, receive, send: Callable, retry_after: int):
        body = {"detail": "Too Many Requests"}
        headers = {"retry-after": str(int(retry_after))}
        response = JSONResponse(status_code=status.HTTP_429_TOO_MANY_REQUESTS, content=body, headers=headers)
        await response(scope, receive, send)
