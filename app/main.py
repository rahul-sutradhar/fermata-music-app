from fastapi import FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.routers import albums, artists, auth, content, library, player, playlists, search, tracks, users
from app.routers import uploads, agentic_ingest
from app.middleware.rate_limiter import RateLimitMiddleware

from contextlib import asynccontextmanager
from alembic import command
from alembic.config import Config


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        from app.db.session import engine
        from app.db.base import Base
        import app.models
        Base.metadata.create_all(bind=engine)
        
        alembic_cfg = Config("alembic.ini")
        command.upgrade(alembic_cfg, "head")
        
        # Self-healing: ensure any admin in 'users' table has a corresponding record in 'admins' table
        try:
            from sqlalchemy.orm import Session
            from sqlalchemy import text
            with Session(engine) as session:
                admin_users = session.execute(text("SELECT id, username FROM users WHERE role = 'admin'")).fetchall()
                for uid, uname in admin_users:
                    exists = session.execute(text("SELECT id FROM admins WHERE id = :id"), {"id": uid}).first()
                    if not exists:
                        print(f"[Startup Repair] Inserting missing admin record for ID {uid} ({uname})", flush=True)
                        session.execute(
                            text("INSERT INTO admins (id, name) VALUES (:id, :name)"),
                            {"id": uid, "name": uname or "Admin"}
                        )
                session.commit()
        except Exception as repair_exc:
            print(f"[Startup Repair Warning] Admin self-healing warning: {repair_exc}", flush=True)
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
app.include_router(agentic_ingest.router, prefix="/api/v1")


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
