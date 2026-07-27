<div align="center">

<br/>

<h1>🎵 Fermata</h1>

**A production-ready, full-stack music streaming platform**

*FastAPI · PostgreSQL · React · LangGraph · Backblaze B2 · Render*

<br/>

[![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.138-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://postgresql.org)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com)

</div>

---

## 🧭 Overview

**Fermata** is a production-deployed, full-stack music streaming application inspired by Spotify. It integrates a custom **agentic AI pipeline** (powered by LangGraph + MistralAI) for automated, human-in-the-loop music ingestion, a **Cloudflare CDN Worker** for globally-cached audio delivery, and a fully reactive **React/TypeScript frontend** with a Spotify-class UI.

The entire system is containerized, deployed on Render, and built with security-first patterns: JWT + refresh token rotation, Redis-backed rate limiting, OTP email verification, and IP lockout protection.

---

## ✨ Key Features

### 🎧 Core Streaming Platform
- **Audio streaming** via pre-signed Backblaze B2 URLs routed through a Cloudflare CDN Worker for edge-cached, low-latency global delivery
- **Full music catalog** — Tracks, Albums, Artist Profiles with cover art, metadata, and linked discographies
- **Persistent player state** — playback position, shuffle, repeat mode, and recently-played history synced to the database
- **User playlists** — create, reorder, rename, and manage track queues
- **Personal library** — save albums and tracks with one click
- **Full-text search** across the entire catalog

### 🤖 Agentic AI Music Ingestion Pipeline
- **LangGraph-powered multi-agent workflow** that automates song sourcing end-to-end
- Searches the web for song candidates, then pauses at a **human-in-the-loop (HITL) interrupt** for user selection
- Admin-facing approval gate before any audio is downloaded or persisted
- On approval, three parallel branches execute concurrently:
  - **Audio branch** — downloads audio via `yt-dlp`, converts with `ffmpeg`, uploads to Backblaze B2
  - **Cover art branch** — fetches, resizes (Pillow), and uploads album artwork
  - **Artist metadata branch** — resolves/creates the artist profile in the database
- A **sync barrier** (`sync_join`) ensures all branches complete before the track record is written
- Automatic startup repair resets any requests stuck in `"processing"` state due to server crashes
- LangGraph workflow is **lazy-loaded** (singleton + double-checked locking) to avoid ~150MB memory overhead on idle workers

### 🔐 Authentication & Security
- **JWT Access Tokens** (short-lived) + **Refresh Token rotation** (DB-persisted, hashed SHA-256)
- **OTP email verification** on registration — accounts locked until verified
- **Argon2 password hashing** via `pwdlib` for secure credential storage
- **CAPTCHA bypass tokens** for rate-limit exemption on verified clients
- **IP-based lockout** after repeated auth failures
- **Redis-backed rate limiter** (Upstash) with in-memory fallback — per-client, per-endpoint
- Role-based access control: `user`, `artist`, `admin` with protected route guards

### 🛠️ Admin Panel
- Full CRUD for Users, Artist Accounts, Artist Catalog Profiles, Albums, and Tracks
- Ingestion Queue dashboard with live status tracking (pending → processing → completed/failed)
- Inline audio player for previewing tracks directly in the admin console
- Accordion-style album rows with nested track management

### 🎨 Artist Panel
- Dedicated dashboard for artist accounts to manage their own albums and tracks
- Upload tracks with cover art, metadata, and audio files directly
- Manage their catalog independently without admin access

---

## 🗂️ Architecture

```
┌────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                    │
│         React 19 · TypeScript · Vite · Zustand             │
└────────────────────────────┬───────────────────────────────┘
                             │ HTTPS
┌────────────────────────────▼───────────────────────────────┐
│               FastAPI Backend (Render / Docker)            │
│                                                            │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│   │   Auth   │  │  Tracks  │  │  Albums  │  │ Playlist │   │
│   │  Router  │  │  Router  │  │  Router  │  │  Router  │   │
│   └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          Agentic Ingestion Router (/api/v1)          │  │
│  │  LangGraph Workflow → HITL Queue → Admin Gate        │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│   ┌──────────────────┐    ┌────────────────────────────┐   │
│   │  Rate Limiter    │    │  Self-Healing Lifespan     │   │
│   │  (Redis / Mem)   │    │  (Alembic auto-migrate)    │   │
│   └──────────────────┘    └────────────────────────────┘   │
└──────────┬─────────────────────────────┬───────────────────┘
           │                             │
    ┌──────▼─────┐           ┌───────────▼────────┐
    │ PostgreSQL │           │   Backblaze B2     │
    │ (Supabase) │           │  (S3-Compatible    │
    │            │           │   Object Storage)  │
    └────────────┘           └────────┬───────────┘
                                      │
                            ┌─────────▼───────────┐
                            │  Cloudflare Worker  │
                            │  (CDN + Pre-signed  │
                            │   URL Proxy Cache)  │
                            └─────────────────────┘
```

---

## 🤖 Agentic AI Pipeline — Deep Dive

The ingestion pipeline is a **stateful, interruptible LangGraph graph**. Unlike simple background jobs, each ingestion is a live workflow that pauses, waits for human input, and resumes — surviving server restarts via an in-memory checkpointer.

```
START
  │
  ▼
search_candidates    ←    Web search (DuckDuckGo), deduplication
  │
  ├── (no results) ──────► report_missing_song ──► END
  │
  ▼
[INTERRUPT: user selects from candidates]
  │
  ▼
submit_to_hitl_queue    ←    Persists to ingestion_requests DB table
  │
  ├── (report_missing) ──► report_missing_song ──► END
  │
  ▼
[INTERRUPT: admin approval gate]
  │
  ▼
admin_reviews_request
  │
  ├── (rejected) ────────► notify_rejection ──► END
  │
  ▼ (approved — 3 parallel branches)
  ├─── download_and_upload_audio  ──┐
  ├─── process_and_upload_cover   ──┼─► sync_join ──► populate_track ──► notify_user ──► END
  └─── fetch_artist_metadata ► populate_artist ──┘
```

**Key engineering decisions:**
- `interrupt_after=["search_candidates"]` and `interrupt_before=["admin_reviews_request"]` create two HITL pause points
- Parallel branches use LangGraph's fan-out conditional edges
- `sync_join` is a custom barrier — the last branch to arrive triggers `populate_track`
- `yt-dlp` + `ffmpeg` handle audio extraction/conversion (Node.js ≥ 22 bundled in Docker image)

---

## 🏗️ Project Structure

```
fermata/
├── app/                        # FastAPI backend
│   ├── main.py                 # App factory, lifespan, middleware
│   ├── core/
│   │   ├── config.py           # Pydantic-settings configuration
│   │   ├── deps.py             # FastAPI Depends() helpers
│   │   ├── oauth.py            # JWT creation, Argon2 hashing
│   │   ├── cache.py            # Redis / in-memory cache abstraction
│   │   └── exceptions.py       # Global exception handlers
│   ├── middleware/
│   │   └── rate_limiter.py     # ASGI rate limiter (Redis-backed, per-IP per-route)
│   ├── models/                 # SQLAlchemy ORM models (16 tables)
│   ├── schemas/                # Pydantic request/response schemas
│   ├── routers/                # API endpoint handlers (13 routers)
│   │   ├── auth.py             # Register, login, refresh, OTP, forgot-password
│   │   ├── tracks.py           # Track CRUD + audio upload + stream URL generation
│   │   ├── agentic_ingest.py   # LangGraph pipeline API (search, select, approve)
│   │   └── ...
│   ├── services/               # Business logic (decoupled from routing)
│   └── db/                     # Session factory, Base, seed script
│
├── agentic_ai/                 # Standalone AI agent package
│   └── src/
│       ├── graph.py            # LangGraph workflow definition
│       ├── nodes.py            # All agent node implementations
│       └── state.py            # TypedDict state schema
│
├── alembic/                    # Database migration history
├── fermata-cdn-worker/         # Cloudflare Worker (JS) — CDN proxy + cache
├── frontend/                   # React 19 + TypeScript + Vite SPA
│   └── src/
│       ├── pages/              # 16 pages (Home, Search, Library, Admin, Artist, etc.)
│       ├── components/         # Reusable UI (Layout, NowPlayingBar, Sidebar, etc.)
│       ├── store/              # Zustand global state (auth, player)
│       ├── api/                # Typed API client wrappers
│       └── types/              # Shared TypeScript interfaces
├── tests/                      # Pytest test suite
├── Dockerfile                  # Multi-stage Docker build
├── docker-compose.yml          # Local dev orchestration
└── pyproject.toml              # Project metadata + uv dependency management
```

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Backend** | FastAPI 0.138, Python 3.11 | Async REST API, auto OpenAPI docs |
| **Database** | PostgreSQL 16 (Supabase) | Relational data store |
| **ORM / Migrations** | SQLAlchemy 2.0 + Alembic | Models, schema migrations |
| **Auth** | PyJWT, Argon2 (pwdlib) | JWT auth, secure password hashing |
| **Cache / Rate Limiting** | Redis (Upstash) | Token store, sliding-window rate limiter |
| **AI / Agents** | LangGraph, LangChain, MistralAI | Agentic ingestion pipeline |
| **Audio Processing** | yt-dlp, ffmpeg | Download + transcode audio |
| **Object Storage** | Backblaze B2 (S3-compatible, boto3) | Audio files + cover art |
| **CDN** | Cloudflare Worker | Edge caching + pre-signed URL proxy |
| **Frontend** | React 19, TypeScript, Vite | SPA with fast HMR |
| **State Management** | Zustand | Global auth/player state |
| **Containerization** | Docker (multi-stage), Docker Compose | Build + local dev |
| **Deployment** | Render (Web Service) | Production hosting |
| **Package Manager** | uv | Fast Python dependency resolution |
| **Testing** | Pytest | Backend unit + integration tests |

---

## 🚀 Getting Started

### Prerequisites
- Python 3.11+, Node.js 18+, PostgreSQL
- `uv` package manager: `pip install uv`

### Backend

```bash
git clone https://github.com/yourusername/fermata.git
cd fermata

uv sync
cp .env.example .env     # fill in your values

alembic upgrade head
uvicorn app.main:app --reload --port 8001
```

API available at `http://localhost:8001` · Docs at `http://localhost:8001/docs`

### Frontend

```bash
cd frontend
npm install
echo "VITE_API_BASE_URL=http://localhost:8001" > .env
npm run dev
```

Frontend at `http://localhost:5173`

### Docker (Full Stack)

```bash
docker compose up --build
```

---

## ⚙️ Environment Variables

```env
# Application
APP_NAME=Fermata
DEBUG=false
ENVIRONMENT=production

# Database
DATABASE_URL=postgresql://user:password@host:5432/fermata

# JWT
SECRET_KEY=your-256-bit-secret
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Redis (Upstash)
REDIS_URL=rediss://default:token@host.upstash.io:6379
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW_SECONDS=60
AUTH_RATE_LIMIT_REQUESTS=10

# Backblaze B2
B2_S3_ENDPOINT_URL=https://s3.us-west-004.backblazeb2.com
B2_ACCESS_KEY_ID=your-key-id
B2_SECRET_ACCESS_KEY=your-secret-key
B2_BUCKET_NAME=fermata-audio
B2_REGION_NAME=us-west-004

# AI Pipeline
MISTRAL_API_KEY=your-mistral-key
HEALTH_CHECK_TOKEN=your-health-token
```

---

## 📡 API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/auth/register` | — | Register with email + OTP verification |
| `POST` | `/auth/login` | — | Login → access + refresh tokens |
| `POST` | `/auth/refresh` | Refresh Token | Rotate access token |
| `POST` | `/auth/verify-otp` | — | Verify email OTP |
| `GET` | `/auth/me` | ✅ User | Get current user profile |
| `GET` | `/tracks` | ✅ User | List all tracks |
| `GET` | `/tracks/{id}` | ✅ User | Get track with pre-signed stream URL |
| `POST` | `/tracks` | ✅ Artist/Admin | Create track |
| `PATCH` | `/tracks/{id}` | ✅ Artist/Admin | Update track metadata |
| `DELETE` | `/tracks/{id}` | ✅ Artist/Admin | Delete track |
| `GET/POST/PATCH/DELETE` | `/albums` | Mixed | Album CRUD |
| `GET/POST/PATCH/DELETE` | `/artists` | Mixed | Artist profile CRUD |
| `GET` | `/search` | ✅ User | Full-text search (tracks, albums, artists) |
| `GET/POST/DELETE` | `/playlists` | ✅ User | Playlist management |
| `GET/PATCH` | `/me/player` | ✅ User | Player state sync |
| `POST` | `/me/player/recently-played` | ✅ User | Log play event |
| `GET/POST/DELETE` | `/me/library` | ✅ User | Saved tracks/albums |
| `POST` | `/api/v1/agentic-ingest/search` | ✅ User | Start AI song search |
| `POST` | `/api/v1/agentic-ingest/select` | ✅ User | Select candidate → queue |
| `POST` | `/api/v1/agentic-ingest/approve/{id}` | ✅ Admin | Approve/reject ingestion |
| `GET` | `/api/v1/agentic-ingest/queue` | ✅ Admin | View ingestion queue |
| `GET` | `/health` | Token | Service health check |

---

## 🔒 Security Architecture

```
Registration
  └── Argon2 hash password → Store user → Send OTP email → Lock account

Login
  ├── Check IP lockout (Redis)
  ├── CAPTCHA bypass check (X-Captcha-Token header)
  ├── Verify Argon2 hash (constant-time)
  ├── Issue Access Token (JWT, 30min) + Refresh Token (SHA-256 hashed, 30 days)
  └── On failure: increment counter → lock IP after N attempts

Request Auth
  ├── Extract Bearer token from Authorization header
  ├── Validate JWT signature + expiry
  ├── Check access token NOT revoked (DB lookup)
  └── Inject CurrentUser via FastAPI Depends()

Rate Limiting (ASGI Middleware)
  ├── Per-IP, per-route sliding window (Redis INCR + EXPIRE)
  ├── Stricter limits on /auth/* endpoints
  ├── In-memory fallback if Redis is unavailable
  └── Auth endpoints additionally subject to IP lockout
```

---

## 🧪 Running Tests

```bash
pytest           # full suite
pytest -v        # verbose
pytest tests/test_auth.py   # single file
```

---

## 📦 Deployment

Deployed on **Render** as a Docker Web Service using a multi-stage build:

1. **Builder stage** — installs Python deps, wheels them for fast copying
2. **Runtime stage** — installs `ffmpeg`, bundles **Node.js v22** (required by `yt-dlp`), copies pre-built wheels
3. **Entrypoint** — runs `alembic upgrade head` then starts `uvicorn` with `--proxy-headers`

The app auto-migrates the database on every startup. Stuck ingestion jobs are automatically reset to `"failed"`, and admin role assignments are self-healed from the `admins` table.

---

## 🗺️ Roadmap

- [ ] WebSocket real-time notifications for ingestion status
- [ ] pgvector semantic similarity search for "sounds like" recommendations
- [ ] Time-synced lyrics display
- [ ] Mobile-responsive PWA with offline support
- [ ] OAuth2 social login (Google, GitHub)
- [ ] Artist analytics dashboard (plays, listeners, geography)

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">
Built with FastAPI, React, LangGraph, and a lot of coffee.
</div>
