from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.routers import albums, artists, auth, content, library, player, playlists, search, tracks, users
from app.routers import uploads
from app.middleware.rate_limiter import RateLimitMiddleware

app = FastAPI(
    title=settings.app_name,
    debug=settings.debug,
)

# Allow the API to be called from the static test client and local dev origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
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
def health_check() -> dict[str, str]:
    """Return service health status."""
    return {"status": "ok"}
