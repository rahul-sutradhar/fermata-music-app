# Fermata — TODO

This tracks the project as a sum of small modules. Each stack gets its own
section, and each section is broken into small, checkable tasks — the idea
is that the whole app emerges from checking off many small boxes, not from
big vague milestones.

**How to use this file:**
- One stack is "active" at a time (the one you're currently learning).
- Within a stack, tasks are ordered roughly in the order you'd build them.
- `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked (note why)
- When a stack is "done enough to move on," leave it — don't aim for
  perfection before starting the next stack. Circle back later as a
  separate small task if needed.
- Update the **Status Overview** table whenever a stack's state changes.

---

## Status Overview
_____________________________________________________________________
| #  |    Stack / Module      |      Status     |        Notes       |
|----|------------------------|-----------------|--------------------|
| 1  | FastAPI backend (core) | `x` Done        | sections 1.1–1.6   |
| 2  | Database & migrations  | `x` Done        |PostgreSQL + Alembic|
| 3  | Auth                   | `x` Done        |refresh + revocation|
| 4  | Testing                | `x` Done        |basic infrastructure|
| 5  | Frontend (testing UI)  | `x` Done        | vanilla JS test client |
| 6  | Caching / Redis        | `x` Done        | rate limiting + Upstash configured |
| 7  | File/audio storage     | `x` Done        | Backblaze B2 upload + signed-url flow complete |
| 8  | Search                 | `x` Done        | combined search implemented; tests passing |
| 9  | DevOps / Deployment    | `x` Done        | Dockerfile + CI scaffolded |
| 10 | CI/CD                  | ` ` Not started |                    |
| 11 | Mobile (maybe)         | ` ` Not started | optional, later    |
| 12 | Monitoring / Logging   | ` ` Not started |                    |
----------------------------------------------------------------------

---

## 1. FastAPI Backend (core) — ACTIVE

### 1.1 Project scaffold
- [x] Repo initialized
- [x] `app/` folder structure (`routers/`, `models/`, `schemas/`, `services/`, `core/`, `db/`)
- [x] `requirements.txt` / `pyproject.toml` set up
- [x] `.env.example` created
- [x] `app/core/config.py` — settings loaded via Pydantic `BaseSettings`
- [x] Base FastAPI app runs (`uvicorn app.main:app --reload`)
- [x] Health check endpoint (`GET /health`)

### 1.2 Routing basics
- [x] First router (`routers/tracks.py`) registered in `main.py`
- [x] Path params + query params understood and used
- [x] Pydantic request schema for one endpoint
- [x] Pydantic response schema (`response_model`) for one endpoint
- [x] `tags=[...]` used to group endpoints in Swagger UI
- [x] Docstrings on every route function

### 1.3 Dependency Injection
- [x] Understand `Depends()`
- [x] DB session dependency (`get_db`)
- [x] Reusable auth dependency (`get_current_user`) — stub for now

### 1.4 Error handling
- [x] `HTTPException` used for expected errors (404/400/403)
- [x] Global exception handler for unexpected errors
- [x] Consistent error response shape decided

### 1.5 CRUD pattern (apply per entity later)
- [x] One full CRUD set built end-to-end for a single entity (pick `Track`) as a learning reference
- [x] Pattern documented in `ARCHITECTURE.md` once it feels solid

### 1.6 Active endpoints (June 2026)
- Albums
  - [x] `GET /albums/{id}`
  - [x] `GET /albums/{id}/tracks`
- Artists
  - [x] `GET /artists/{id}`
  - [x] `GET /artists/{id}/albums`
- Tracks
  - [x] `GET /tracks/{id}`
  - [x] confirm track details response model and error handling
- Search
  - [x] `GET /search` (limit max is now 10, not 50)
  - [x] query and pagination semantics
- Playlists
  - [x] full CRUD via `/playlists/{id}/items`
  - [x] `GET /me/playlists`
  - [x] `POST /me/playlists`
  - [x] `DELETE /playlists/{id}` (Playlist deletion flow)
  - [x] cover image upload

- Library
  - [x] `PUT /me/library`
  - [x] `DELETE /me/library`
  - [x] `GET /me/library/contains`
- Player
  - [x] playback state
  - [x] queue management
  - [x] seek
  - [x] shuffle
  - [x] repeat
  - [x] volume
  - [x] recently played
- Users
  - [x] `GET /me` (currently `GET /auth/me` exists as an auth stub)
  - [x] `GET /me/top/{type}` (artists or tracks)
- Shows / Episodes / Audiobooks / Chapters
  - [x] single-resource GETs

---

## 2. Database & Migrations

- [x] PostgreSQL running locally (native install)
- [x] SQLAlchemy connected, `db/session.py` working
- [x] First model defined (`models/track.py`)
- [x] Alembic initialized
- [x] First migration generated + applied
- [x] `User` model
- [x] `Artist` model
- [x] `Album` model
- [x] `Track` model
- [x] `Playlist` model
- [x] `PlaylistTrack` join table (with `position` for ordering)
- [x] Relationships (foreign keys, `relationship()`) wired between models
- [x] Seed script for local dev data

---

## 3. Auth

- [x] Password hashing — implemented in `app/core/oauth.py` (Argon2)
- [x] User registration endpoint — implemented at `app/routers/auth.py::register`
- [x] Login endpoint (OAuth2 password flow)
- [x] JWT access token issuance
- [x] JWT validation dependency
- [x] Refresh token issuance
- [x] Refresh token storage (database) — stores refresh tokens with expiry + revocation flag
- [x] Token revocation / logout
- [x] Route protection applied to relevant endpoints
- [x] Basic role/ownership checks (e.g. "only playlist owner can edit")
- [x] **Strict Role Hierarchy & Master Admin Lock**: Enforced role authorization hierarchy (Master Admin has full control; Standard Admins can toggle User ↔ Artist but cannot create/demote Admins; Master Admin role/username permanently locked against demotion; No user can change their own role).


---

## 4. Testing

- [x] Pytest installed and configured
- [x] Test DB setup (separate from dev DB)
- [x] First test written (health check)
- [x] Test fixtures for DB session / test client
- [x] Tests for one full CRUD flow
- [x] Tests for auth (register/login/protected route)
- [x] Tests for storage and audio playback endpoints (upload + signed URL)
- [x] Tests for rate limiting middleware and Redis/Upstash fallback
- [ ] CI runs tests automatically — depends on Module 10

---

## 5. Frontend – Testing Client (Vanilla JS)

- [x] Decide on minimal stack (vanilla HTML/CSS/JS, no build step)
- [x] Single-page app scaffold at `frontend/index.html`
- [x] Auth endpoints (register, login, get current user)
- [x] Search UI
- [x] Browse (tracks, albums, artists by ID)
- [x] Playlists UI (create, add tracks)
- [x] Config persistence (API base URL and auth token to localStorage)
- [x] Dark theme UI optimized for testing

See `frontend/README.md` for usage.

---

## 6. Caching / Redis & Rate Limiting

### Caching — Status: Done
- [x] Upstash Redis configured (serverless, free tier available; app supports `REDIS_URL`)
- [x] Connection wired into `app/core` (`app/core/cache.py`) with optional Upstash client
- [x] Used for refresh token storage (design-ready; can be switched to Redis/Upstash)
- [x] Used for caching one expensive query (pattern in place; integrate on demand)
- [x] Cache invalidation strategy decided (TTL-based; implement per-key as needed)

### Rate Limiting — Status: Done
- [x] Rate limiter strategy chosen: Upstash Redis when available, in-memory fallback for dev (`SimpleMemoryRateLimiter`)
- [x] Rate limit auth endpoints (stricter limits for `/auth`)
- [x] Rate limit API endpoints globally (per-IP, per-path)
- [x] Rate limit search endpoint (covered by per-path policy)
- [x] Rate limit upload endpoints (covered by per-path policy; recommend stricter limits)
- [x] Return 429 (Too Many Requests) with `Retry-After` header
- [x] Log rate limit violations for monitoring (hook into existing logging/monitoring as needed)

Implemented summary (files):
- `app/core/config.py` — new settings: `redis_url`, rate limit params
- `app/core/cache.py` — optional Redis client + `SimpleMemoryRateLimiter` fallback
- `app/middleware/rate_limiter.py` — ASGI middleware enforcing limits (Redis or in-memory)
- `app/main.py` — middleware registered

Notes / Next steps:
- Install `redis` (or `redis-py`) in production and set `REDIS_URL` in `.env`.
- Add per-route configurable limits (decorator) if finer control is required.
- Add automated tests for rate-limiting behavior and metrics logging.
- Consider exempting health probes and internal IPs from limits.


---

## 7. File / Audio Storage (Backblaze B2)

- [x] Backblaze B2 account and bucket created (dev and prod)
- [x] B2 credentials configured in `app/core` and `.env` (avoid committing secrets)
- [x] Upload flow: server-side upload and presigned URLs (B2 S3-compatible or B2 Upload API)
- [x] `audio_file_key` stored on `Track` model
- [x] `cover_image_key` stored on `Album` model and `POST /albums/{id}/cover` endpoint
- [x] `cover_image_key` stored on `Track` model with album fallback and `POST /tracks/{id}/cover` endpoint
- [x] Single-flow cover photo attachment in Track & Album creation/edit forms

- [x] Signed URL generation for playback with short expiry
- [x] Upload content-type validation (audio/*)
- [x] Upload size limits and content-type validation
- [x] Lifecycle policy / cleanup for old files
- [x] End-to-end upload/download tests

- [x] CDN integration for Backblaze B2 (e.g. Cloudflare / BunnyCDN) for fast global edge delivery of audio and cover photos with zero egress costs.
- [ ] (Future) Encrypted HLS (HTTP Live Streaming) conversion using client-side WebAssembly (FFmpeg.wasm) to protect raw audio files from direct browser download/access without overloading Render Free Tier CPU.


---

## 8. Search

- [x] Basic search via Postgres `ILIKE` (good enough for v1)
- [x] Search endpoint (`GET /search?q=`)
- [ ] (Later) Evaluate full-text search or dedicated search engine if needed

---

## 9. DevOps / Deployment

- [x] Dockerfile for the app
- [x] CI workflow (GitHub Actions) to run tests and build image
- [x] Choose hosting (Railway/Render/Fly.io for early stage)
- [x] Environment variables configured in hosting platform
- [x] First manual deploy successful

---

## 10. CI/CD

- [x] GitHub Actions: lint step
- [x] GitHub Actions: test step
- [x] GitHub Actions: build step
- [x] Auto-deploy to staging on merge to `main`
- [x] Tagged releases deploy to production

---

## 11. Mobile (optional, later)

- [ ] Decide if/when this is in scope
- [ ] (Leave blank until prioritized)

---

## 12. Monitoring / Logging

- [x] Structured logging set up
- [ ] Basic error tracking (e.g. Sentry)
- [x] Uptime/health monitoring on deployed instance -> Cron Job using Upstash

---

## Backlog (ideas, not yet scheduled)

- [x] Liked tracks & albums -> Add to Liked songs / Liked albums
- [ ] Follow artists/users
- [ ] Recently played history analytics
- [x] **Standalone Single Tracks**: Allow artists to publish single tracks directly without requiring an album (similar to Spotify Single releases) with option to attach/detach to/from albums dynamically.
- [x] **Strict Role Hierarchy & Master Admin Lock**: Master Admin immutability lock, self-role modification prevention, and multi-tier admin permission constraints in backend and frontend.


- [ ] **Dynamic App Theming System**:
  - [ ] Multi-palette themes (Spotify Green, Cyberpunk Neon, Midnight Velvet, Sunset Gold, Emerald, etc.).
  - [ ] Global Dark / Light mode toggle common to all color themes.
  - [ ] Admin feature to set the platform-wide "Daily Default Theme" for all users.

- [ ] **Spotify-like Recommendation System**: Collaborative filtering and content-based recommendation engine based on user listening history, top genres, and track feature vectors.

- [ ] **AI Music Splitter & Vocal Recording Studio** (Unique Feature):
  - [ ] **Stem Separation Panel**: Interactive UI for selected songs allowing independent volume controls for isolated Vocals and Background Music (BGM/Instrumental).
  - [ ] **Voice Karaoke Recorder**: In-browser audio recording (MediaRecorder API) enabling users to record their own voice live along with the playing BGM track.
  - [ ] **Draft Track Management**: Save recorded vocal performances as private draft tracks with audio preview and mix adjustments.
  - [ ] **Publish Flow**: Option for creators/artists to publish drafted recordings as official tracks/covers in their albums.

- [x] **Agentic AI Automated Music Sourcing Workflow (HITL + Auto-Ingestion)** (Unique Feature):
  - [x] **Missing Song Query Report**: When a user searches for a missing song, they can submit a "Report Missing Song" query request.
  - [x] **LLM Metadata Fetcher Agent**: LLM agent searches and fetches candidate songs with rich metadata (Artist name, track title, cover photo URL, duration).
  - [x] **Candidate Selection & Admin HITL Queue**: User selects their target song from candidates, submitting a request to the Admin Panel Human-in-the-Loop (HITL) approval queue.
  - [x] **Automated Ingestion Pipeline**: On Admin Approval, trigger background execution workflow to:
    - [x] Download audio via third-party download services (ssyoutube / spotdown APIs / yt-dlp).
    - [x] Fetch, crop, and optimize track cover photo & artist metadata.
    - [x] Upload audio file and cover image to Backblaze B2 / CDN.
    - [x] Automatically populate database tables (`Track`, `Album`, `Artist`) and notify the requesting user.



---

## Log

Use this to note when you pick a stack back up, so "transparency" includes
*when*, not just *what*.

- `2026-06-21` — Started FastAPI backend, project scaffold underway.
- `2026-07-23` — Implemented Cloudflare CDN caching Worker for private Backblaze B2 bucket access using secure S3 signature signing, with verified edge caching support for range requests.
