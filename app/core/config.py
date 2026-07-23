from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "Fermata"
    debug: bool = False
    environment: str = "development"
    database_url: str = "postgresql://postgres:postgres@localhost:5432/fermata"

    # JWT
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    # Redis / caching
    redis_url: str | None = None

    # Backblaze B2 S3-compatible storage
    b2_s3_endpoint_url: str | None = None
    b2_access_key_id: str | None = None
    b2_secret_access_key: str | None = None
    b2_bucket_name: str | None = None
    b2_region_name: str | None = None
    audio_upload_max_bytes: int = 50 * 1024 * 1024
    
    # CDN URL prefix (e.g., Cloudflare Worker URL or Supabase Storage URL)
    cdn_url: str | None = None

    # Rate limiting (requests per window)
    rate_limit_requests: int = 60
    rate_limit_window_seconds: int = 60
    auth_rate_limit_requests: int = 10

    # Health Check Token
    health_check_token: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
