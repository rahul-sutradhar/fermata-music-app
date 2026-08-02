import os
import socket

# Force IPv4 DNS resolution globally to prevent "Network is unreachable" (Errno 101)
# and "Address family for hostname not supported" (Errno -9) connection issues on Render/Docker.
orig_getaddrinfo = socket.getaddrinfo
def forced_ipv4_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    return orig_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)
socket.getaddrinfo = forced_ipv4_getaddrinfo

from fastapi import FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.routers import albums, artists, auth, content, library, player, playlists, search, tracks, users
from app.routers import uploads, agentic_ingest
try:
    from app.routers import studio
except ImportError:
    studio = None
from app.middleware.rate_limiter import RateLimitMiddleware

from contextlib import asynccontextmanager
from alembic import command
from alembic.config import Config


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.environment == "testing":
        yield
        return

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
                # 1. Restore 'admin' role to any user present in the 'admins' table
                #    (but don't overwrite master_admin — they are not in the admins table)
                session.execute(text(
                    "UPDATE users SET role = 'admin' "
                    "WHERE id IN (SELECT id FROM admins) AND role NOT IN ('admin', 'master_admin')"
                ))
                session.commit()
                
                # 2. Delete conflicting artist profiles for non-artists
                session.execute(text("DELETE FROM artists WHERE id IN (SELECT id FROM users WHERE role != 'artist')"))
                # 3. Delete conflicting admin profiles for users whose role is no longer 'admin'
                #    (master_admin users are never in the admins table, so this is safe)
                session.execute(text("DELETE FROM admins WHERE id IN (SELECT id FROM users WHERE role NOT IN ('admin'))"))
                session.commit()
                
                admin_users = session.execute(text("SELECT id, username FROM users WHERE role = 'admin'")).fetchall()
                for uid, uname in admin_users:
                    exists = session.execute(text("SELECT id FROM admins WHERE id = :id"), {"id": uid}).first()
                    if not exists:
                        print(f"[Startup Repair] Inserting missing admin record for ID {uid} ({uname})", flush=True)
                        session.execute(
                            text("INSERT INTO admins (id, name) VALUES (:id, :name)"),
                            {"id": uid, "name": uname or "Admin"}
                        )
                
                # Auto-recovery: Reset any orphaned "processing" requests to "failed" on startup
                stuck_requests = session.execute(
                    text("UPDATE ingestion_requests SET status = 'failed', lock_token = NULL WHERE status = 'processing'")
                )
                if stuck_requests.rowcount > 0:
                    print(f"[Startup Repair] Reset {stuck_requests.rowcount} stuck 'processing' ingestion requests to 'failed'.", flush=True)
                
                session.commit()
        except Exception as repair_exc:
            print(f"[Startup Repair Warning] Admin self-healing warning: {repair_exc}", flush=True)
    except Exception as exc:
        print(f"Alembic auto-migration startup warning: {exc}")

    # Start the sequential background ingestion queue worker thread
    try:
        from app.routers.agentic_ingest import start_ingestion_worker
        start_ingestion_worker()
    except Exception as worker_exc:
        print(f"[Lifespan Startup Error] Failed to start Ingestion Queue Worker: {worker_exc}", flush=True)

    yield

    # Stop the worker thread on shutdown
    try:
        from app.routers.agentic_ingest import stop_ingestion_worker
        stop_ingestion_worker()
    except Exception as worker_stop_exc:
        print(f"[Lifespan Shutdown Error] Failed to stop Ingestion Queue Worker: {worker_stop_exc}", flush=True)



app = FastAPI(
    title=settings.app_name,
    debug=settings.debug,
    lifespan=lifespan,
)

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            

# Parse allowed origins from settings
origins = [origin.strip() for origin in settings.allowed_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True if "*" not in origins else False,
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
if studio is not None:
    app.include_router(studio.router)
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
