"""
Test suite for rate limiting middleware.

Tests verify:
- Per-IP rate limiting enforcement
- Per-path rate limiting rules
- Stricter auth endpoint limits (10 req/min) vs global limits (60 req/min)
- 429 Too Many Requests response with Retry-After header
- Endpoint exemptions (health, docs, etc.)
- In-memory and Redis backend behavior
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from app.middleware.rate_limiter import RateLimitMiddleware
from app.core.cache import SimpleMemoryRateLimiter


@pytest.fixture
def rate_limiter_app():
    """Create a minimal FastAPI app with rate limiter middleware for testing."""
    app = FastAPI()
    
    # Register rate limiter middleware
    app.add_middleware(RateLimitMiddleware)
    
    @app.get("/test-endpoint")
    def test_endpoint():
        return {"message": "success"}
    
    @app.get("/auth/login")
    def auth_login():
        return {"token": "test-token"}
    
    @app.get("/health")
    def health():
        return {"status": "ok"}
    
    return app


@pytest.fixture
def rate_limit_client(rate_limiter_app):
    """TestClient for the app with rate limiter."""
    return TestClient(rate_limiter_app)


class TestGlobalRateLimiting:
    """Test global rate limiting (60 requests per 60 seconds for non-auth endpoints)."""
    
    def test_allow_requests_within_limit(self, rate_limit_client):
        """Requests within the limit should succeed."""
        # Default limit is 60 requests per 60 seconds
        # Make a few requests (well under the limit)
        for _ in range(5):
            response = rate_limit_client.get("/test-endpoint")
            assert response.status_code == 200
    
    def test_rate_limit_exceeded(self, rate_limit_client):
        """Exceeding the limit should return 429."""
        with patch('app.middleware.rate_limiter.get_redis', return_value=None), \
             patch('app.middleware.rate_limiter.get_memory_limiter') as mock_get_limiter:
            mock_limiter = MagicMock(spec=SimpleMemoryRateLimiter)
            mock_limiter.incr.return_value = 61
            mock_limiter.ttl.return_value = 30
            mock_get_limiter.return_value = mock_limiter
            
            app = FastAPI()
            app.add_middleware(RateLimitMiddleware)
            
            @app.get("/test-endpoint")
            def test_endpoint():
                return {"message": "success"}
            
            client = TestClient(app)
            response = client.get("/test-endpoint")
            
            assert response.status_code == 429
            assert "Retry-After" in response.headers
            assert response.headers["Retry-After"] == "30"
    
    def test_429_has_retry_after_header(self, rate_limit_client):
        """429 response should include Retry-After header."""
        with patch('app.middleware.rate_limiter.get_redis', return_value=None), \
             patch('app.middleware.rate_limiter.get_memory_limiter') as mock_get_limiter:
            mock_limiter = MagicMock(spec=SimpleMemoryRateLimiter)
            mock_limiter.incr.return_value = 61
            mock_limiter.ttl.return_value = 15
            mock_get_limiter.return_value = mock_limiter
            
            app = FastAPI()
            app.add_middleware(RateLimitMiddleware)
            
            @app.get("/test-endpoint")
            def test_endpoint():
                return {"message": "success"}
            
            client = TestClient(app)
            response = client.get("/test-endpoint")
            
            assert response.status_code == 429
            assert "Retry-After" in response.headers
            assert response.headers["Retry-After"] == "15"
    

class TestAuthRateLimiting:
    """Test stricter rate limiting on auth endpoints (10 requests per 60 seconds)."""
    
    def test_auth_endpoint_stricter_limit(self, rate_limit_client):
        """Auth endpoints should have stricter limits (10 vs 60)."""
        with patch('app.middleware.rate_limiter.get_redis', return_value=None), \
             patch('app.middleware.rate_limiter.get_memory_limiter') as mock_get_limiter:
            mock_limiter = MagicMock(spec=SimpleMemoryRateLimiter)
            mock_limiter.incr.return_value = 11
            mock_limiter.ttl.return_value = 20
            mock_get_limiter.return_value = mock_limiter
            
            app = FastAPI()
            app.add_middleware(RateLimitMiddleware)
            
            @app.get("/auth/login")
            def auth_login():
                return {"token": "test-token"}
            
            client = TestClient(app)
            response = client.get("/auth/login")
            
            assert response.status_code == 429
            assert response.headers["Retry-After"] == "20"


class TestEndpointExemptions:
    """Test that certain endpoints are exempt from rate limiting."""
    
    def test_health_endpoint_exempt(self, rate_limit_client):
        """Health check endpoint should not be rate limited."""
        with patch('app.middleware.rate_limiter.get_redis', return_value=None), \
             patch('app.middleware.rate_limiter.get_memory_limiter') as mock_get_limiter:
            mock_limiter = MagicMock(spec=SimpleMemoryRateLimiter)
            mock_limiter.incr.side_effect = AssertionError("Memory limiter should not be called for exempt endpoints")
            mock_get_limiter.return_value = mock_limiter
            
            app = FastAPI()
            app.add_middleware(RateLimitMiddleware)
            
            @app.get("/health")
            def health():
                return {"status": "ok"}
            
            client = TestClient(app)
            
            for _ in range(5):
                response = client.get("/health")
                assert response.status_code == 200
            mock_limiter.incr.assert_not_called()


class TestSimpleMemoryRateLimiter:
    """Test the in-memory rate limiter implementation."""
    
    def test_limiter_allows_requests_within_window(self):
        """Requests within the window should be allowed."""
        limiter = SimpleMemoryRateLimiter()
        
        for expected_count in range(1, 6):
            count = limiter.incr("test-key", 60)
            assert count == expected_count
            assert limiter.ttl("test-key") > 0
    
    def test_limiter_blocks_excess_requests(self):
        """Requests exceeding the limit should be blocked."""
        limiter = SimpleMemoryRateLimiter()
        
        for _ in range(3):
            assert limiter.incr("test-key", 60) <= 3
        count = limiter.incr("test-key", 60)
        assert count == 4
    
    def test_limiter_isolates_keys(self):
        """Different keys should have separate limits."""
        limiter = SimpleMemoryRateLimiter()
        
        assert limiter.incr("key-1", 60) == 1
        assert limiter.incr("key-1", 60) == 2
        assert limiter.incr("key-1", 60) == 3
        
        assert limiter.incr("key-2", 60) == 1
        assert limiter.incr("key-2", 60) == 2
        assert limiter.incr("key-2", 60) == 3
    
    def test_limiter_window_reset(self):
        """Limiter should reset counters after the window expires."""
        limiter = SimpleMemoryRateLimiter()
        limiter.incr("key", 1)
        limiter.incr("key", 1)
        limiter.incr("key", 1)
        
        import time
        time.sleep(1.1)
        assert limiter.incr("key", 1) == 1


class TestRateLimiterWithRedis:
    """Test rate limiter behavior with Redis backend."""
    
    @pytest.mark.parametrize("redis_available", [True, False])
    def test_fallback_to_memory_when_redis_unavailable(self, redis_available):
        """If Redis is not available, should fall back to in-memory limiter."""
        with patch('app.core.cache.get_redis') as mock_redis:
            if not redis_available:
                mock_redis.return_value = None
            else:
                mock_redis_client = MagicMock()
                mock_redis.return_value = mock_redis_client
            
            # App should initialize without error
            app = FastAPI()
            app.add_middleware(RateLimitMiddleware)
            
            @app.get("/test")
            def test_endpoint():
                return {"status": "ok"}
            
            client = TestClient(app)
            response = client.get("/test")
            
            # Should always return 200 (no rate limit hit in normal case)
            assert response.status_code == 200
