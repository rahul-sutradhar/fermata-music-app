from fastapi import FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.routers import albums, artists, auth, content, library, player, playlists, search, tracks, users
from app.routers import uploads
from app.middleware.rate_limiter import RateLimitMiddleware

from contextlib import asynccontextmanager
from alembic import command
from alembic.config import Config


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        alembic_cfg = Config("alembic.ini")
        command.upgrade(alembic_cfg, "head")
    except Exception as exc:
        print(f"Alembic auto-migration startup warning: {exc}")
    yield



app = FastAPI(
    title=settings.app_name,
    debug=settings.debug,
    lifespan=lifespan,
)

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            

# Allow the API to be called from the static test client and local dev origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=86400,
)


# Add rate limiting middleware early in the stack
app.add_middleware(RateLimitMiddleware)

register_exception_handlers(app)

app.include_router(auth.router)
app.include_router(tracks.router)
app.include_router(albums.router)
app.include_router(artists.router)
app.include_router(search.router)
app.include_router(playlists.router)
app.include_router(users.router)
app.include_router(library.router)
app.include_router(player.router)
app.include_router(content.router)
app.include_router(uploads.router)


@app.get("/health", tags=["health"])
def health_check(token: str | None = None) -> dict[str, str]:
    """Return service health status securely."""
    if not settings.health_check_token:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Health check token is not configured on the server."
        )
    if token != settings.health_check_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized"
        )
    return {"status": "ok"}
