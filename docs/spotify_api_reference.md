# Spotify Web API — Complete Endpoint Reference

> **Last updated:** June 2026 (reflects February 2026 changelog)
> **Base URL:** `https://api.spotify.com/v1`
> **Auth Base URL:** `https://accounts.spotify.com`

All endpoints require an `Authorization: Bearer <access_token>` header.
Endpoints marked 🔒 require a user-scoped OAuth token (Authorization Code Flow).
Endpoints marked 🔑 work with the Client Credentials Flow (no user needed).

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Albums](#2-albums)
3. [Artists](#3-artists)
4. [Tracks](#4-tracks)
5. [Search](#5-search)
6. [Playlists](#6-playlists)
7. [Library (User's Saved Content)](#7-library-users-saved-content)
8. [Player](#8-player)
9. [Users & Personalisation](#9-users--personalisation)
10. [Shows (Podcasts)](#10-shows-podcasts)
11. [Episodes](#11-episodes)
12. [Audiobooks](#12-audiobooks)
13. [Chapters](#13-chapters)
14. [Genres](#14-genres)
15. [Removed / Deprecated Endpoints](#15-removed--deprecated-endpoints)
16. [Design Notes for Fermata](#16-design-notes-for-fermata)

---

## 1. Authentication

All tokens are issued at `https://accounts.spotify.com`.

| Method | URL | Description |
|--------|-----|-------------|
| `POST` | `/api/token` | Exchange credentials for an access token (Client Credentials, Auth Code, or Refresh Token grant) |
| `GET`  | `/authorize` | Redirect user to Spotify login + consent screen (Authorization Code Flow) |

### Grant types

| `grant_type` value | Flow |
|--------------------|------|
| `client_credentials` | App-only access (no user data) |
| `authorization_code` | User login — exchange code for tokens |
| `refresh_token` | Refresh an expired access token |

---

## 2. Albums

🔑 All album endpoints work with Client Credentials.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/albums/{id}` | Get a single album by Spotify ID |
| `GET` | `/albums/{id}/tracks` | Get all tracks in an album (paginated) |

### Query parameters — `/albums/{id}/tracks`

| Param | Type | Description |
|-------|------|-------------|
| `market` | string | ISO 3166-1 alpha-2 country code |
| `limit` | int | Max items per page (1–50, default 20) |
| `offset` | int | Pagination offset |

---

## 3. Artists

🔑 All artist endpoints work with Client Credentials.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/artists/{id}` | Get a single artist by Spotify ID |
| `GET` | `/artists/{id}/albums` | Get albums by an artist (paginated) |

### Query parameters — `/artists/{id}/albums`

| Param | Type | Description |
|-------|------|-------------|
| `include_groups` | string | Comma-separated: `album`, `single`, `appears_on`, `compilation` |
| `market` | string | ISO 3166-1 alpha-2 country code |
| `limit` | int | Max items per page (1–50, default 20) |
| `offset` | int | Pagination offset |

> ⚠️ **Removed (Feb 2026):** `GET /artists/{id}/top-tracks` and `GET /artists` (batch fetch) are no longer available to new apps.

---

## 4. Tracks

🔑 All track metadata endpoints work with Client Credentials.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/tracks/{id}` | Get a single track by Spotify ID |

> ⚠️ **Removed (Feb 2026):** `GET /tracks` (batch fetch for several tracks) is no longer available.

> ⚠️ **Removed (Nov 2024, extended mode only):** `GET /audio-features/{id}`, `GET /audio-analysis/{id}` — restricted to apps with existing extended mode access.

---

## 5. Search

🔑 Works with Client Credentials.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/search` | Search across the Spotify catalog |

### Query parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `q` | string | ✅ | Search query string. Supports field filters: `artist:`, `album:`, `track:`, `year:`, `genre:`, `isrc:`, `upc:` |
| `type` | string | ✅ | Comma-separated: `album`, `artist`, `playlist`, `track`, `show`, `episode`, `audiobook` |
| `market` | string | | ISO 3166-1 alpha-2 country code |
| `limit` | int | | Max results per type (1–10 as of Feb 2026; was 1–50) |
| `offset` | int | | Pagination offset |
| `include_external` | string | | Pass `audio` to include externally hosted audio |

> ℹ️ **Feb 2026 change:** `limit` max was reduced from 50 → 10; default changed from 20 → 5.

---

## 6. Playlists

Mix of 🔑 (read public) and 🔒 (modify / read private).

| Method | Endpoint | Description | Scope |
|--------|----------|-------------|-------|
| `GET` | `/playlists/{id}` | Get full details of a playlist | — (public) or 🔒 (private) |
| `PUT` | `/playlists/{id}` | Update playlist name, description, visibility | 🔒 `playlist-modify-public` / `playlist-modify-private` |
| `GET` | `/playlists/{id}/images` | Get playlist cover image(s) | — |
| `PUT` | `/playlists/{id}/images` | Upload a custom playlist cover image (JPEG, base64, ≤256 KB) | 🔒 `ugc-image-upload` |
| `GET` | `/playlists/{id}/items` | Get full details of all items in a playlist | 🔒 (private playlists) |
| `POST` | `/playlists/{id}/items` | Add one or more items to a playlist | 🔒 `playlist-modify-public` / `playlist-modify-private` |
| `PUT` | `/playlists/{id}/items` | Reorder or replace items in a playlist | 🔒 `playlist-modify-public` / `playlist-modify-private` |
| `DELETE` | `/playlists/{id}/items` | Remove one or more items from a playlist | 🔒 `playlist-modify-public` / `playlist-modify-private` |
| `GET` | `/me/playlists` | Get the current user's playlists | 🔒 `playlist-read-private` |
| `POST` | `/me/playlists` | Create a new playlist for the current user | 🔒 `playlist-modify-public` / `playlist-modify-private` |

### Query parameters — `GET /playlists/{id}/items`

| Param | Type | Description |
|-------|------|-------------|
| `market` | string | ISO 3166-1 alpha-2 country code |
| `fields` | string | Comma-separated list of fields to include in response |
| `limit` | int | Max items per page (1–100, default 20) |
| `offset` | int | Pagination offset |
| `additional_types` | string | `track` or `episode` (default: `track`) |

> ℹ️ **Feb 2026:** The `/playlists/{id}/tracks` family of endpoints was replaced by `/playlists/{id}/items`. Playlist responses now use `items` instead of `tracks`.

> ⚠️ **Removed (Feb 2026):** `GET /users/{id}/playlists`, `POST /users/{user_id}/playlists`, `PUT /playlists/{id}/followers`, `DELETE /playlists/{id}/followers`, `GET /playlists/{id}/followers/contains`.

---

## 7. Library (User's Saved Content)

All require 🔒 user token.

| Method | Endpoint | Description | Scope |
|--------|----------|-------------|-------|
| `GET` | `/me/tracks` | Get user's saved tracks | `user-library-read` |
| `GET` | `/me/albums` | Get user's saved albums | `user-library-read` |
| `GET` | `/me/episodes` | Get user's saved podcast episodes | `user-library-read` |
| `GET` | `/me/shows` | Get user's saved podcast shows | `user-library-read` |
| `GET` | `/me/audiobooks` | Get user's saved audiobooks | `user-library-read` |
| `PUT` | `/me/library` | Save items to the user's library (by URI list) | `user-library-modify` |
| `DELETE` | `/me/library` | Remove items from the user's library (by URI list) | `user-library-modify` |
| `GET` | `/me/library/contains` | Check if items are saved in the user's library | `user-library-read` |
| `GET` | `/me/following` | Get artists followed by the current user | `user-follow-read` |

### Request body — `PUT /me/library` and `DELETE /me/library`

```json
{
  "uris": ["spotify:track:4iV5W9uYEdYUVa79Axb7Rh", "spotify:album:..."]
}
```

> ℹ️ **Feb 2026 consolidation:** The previous type-specific save/remove/check endpoints (`/me/albums`, `/me/tracks`, etc.) were all replaced by the unified `/me/library` endpoints.

---

## 8. Player

All require 🔒 user token with Spotify Premium (for most write operations).

| Method | Endpoint | Description | Scope |
|--------|----------|-------------|-------|
| `GET` | `/me/player` | Get current playback state | `user-read-playback-state` |
| `PUT` | `/me/player` | Transfer playback to a new device | `user-modify-playback-state` |
| `GET` | `/me/player/devices` | Get available playback devices | `user-read-playback-state` |
| `GET` | `/me/player/currently-playing` | Get the currently playing track or episode | `user-read-currently-playing` |
| `PUT` | `/me/player/play` | Start or resume playback | `user-modify-playback-state` |
| `PUT` | `/me/player/pause` | Pause playback | `user-modify-playback-state` |
| `POST` | `/me/player/next` | Skip to next track in queue | `user-modify-playback-state` |
| `POST` | `/me/player/previous` | Skip to previous track | `user-modify-playback-state` |
| `PUT` | `/me/player/seek` | Seek to a position (ms) in current item | `user-modify-playback-state` |
| `PUT` | `/me/player/repeat` | Set repeat mode (`track`, `context`, `off`) | `user-modify-playback-state` |
| `PUT` | `/me/player/shuffle` | Toggle shuffle on/off | `user-modify-playback-state` |
| `PUT` | `/me/player/volume` | Set playback volume (0–100) | `user-modify-playback-state` |
| `GET` | `/me/player/recently-played` | Get recently played tracks | `user-read-recently-played` |
| `GET` | `/me/player/queue` | Get the current playback queue | `user-read-playback-state` |
| `POST` | `/me/player/queue` | Add an item to the playback queue | `user-modify-playback-state` |

### Query parameters — `PUT /me/player/play`

Request body (JSON):
```json
{
  "context_uri": "spotify:album:1DFixLWuPkv3KT3TnV35m3",
  "uris": ["spotify:track:4iV5W9uYEdYUVa79Axb7Rh"],
  "offset": { "position": 0 },
  "position_ms": 0
}
```

### Query parameters — `GET /me/player/recently-played`

| Param | Type | Description |
|-------|------|-------------|
| `limit` | int | Max items (1–50, default 20) |
| `after` | long | Unix timestamp (ms) — return items after this cursor |
| `before` | long | Unix timestamp (ms) — return items before this cursor |

---

## 9. Users & Personalisation

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/me` | Get current user's profile | 🔒 `user-read-private` |
| `GET` | `/me/top/{type}` | Get user's top artists or tracks | 🔒 `user-top-read` |

### Path parameter — `/me/top/{type}`

| `type` value | Description |
|--------------|-------------|
| `artists` | Top artists |
| `tracks` | Top tracks |

### Query parameters — `/me/top/{type}`

| Param | Type | Description |
|-------|------|-------------|
| `time_range` | string | `short_term` (4 weeks), `medium_term` (6 months, default), `long_term` (all time) |
| `limit` | int | Max items (1–50, default 20) |
| `offset` | int | Pagination offset |

> ⚠️ **Removed (Feb 2026):** `GET /users/{id}` (public user profile) is no longer available. Also removed: `country`, `email`, `explicit_content`, `followers`, `product` fields from user objects.

---

## 10. Shows (Podcasts)

🔑 Public metadata works with Client Credentials.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/shows/{id}` | Get metadata for a single show |
| `GET` | `/shows/{id}/episodes` | Get episodes of a show (paginated) |

### Query parameters — `/shows/{id}/episodes`

| Param | Type | Description |
|-------|------|-------------|
| `market` | string | ISO 3166-1 alpha-2 country code |
| `limit` | int | Max items (1–50, default 20) |
| `offset` | int | Pagination offset |

> ⚠️ **Removed (Feb 2026):** `GET /shows` (batch), `available_markets` and `publisher` fields from show objects.

---

## 11. Episodes

🔑 Public metadata works with Client Credentials.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/episodes/{id}` | Get metadata for a single episode |

> ⚠️ **Removed (Feb 2026):** `GET /episodes` (batch fetch).

---

## 12. Audiobooks

🔑 Public metadata works with Client Credentials.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/audiobooks/{id}` | Get metadata for a single audiobook |
| `GET` | `/audiobooks/{id}/chapters` | Get chapters of an audiobook (paginated) |

> ⚠️ **Removed (Feb 2026):** `GET /audiobooks` (batch), `available_markets` and `publisher` fields from audiobook objects.

---

## 13. Chapters

🔑 Works with Client Credentials.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/chapters/{id}` | Get metadata for a single audiobook chapter |

> ⚠️ **Removed (Feb 2026):** `GET /chapters` (batch fetch), `available_markets` field from chapter objects.

---

## 14. Genres

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/recommendations/available-genre-seeds` | Get list of available genre seeds | 🔑 |

> ⚠️ **Note:** The `/recommendations` endpoint itself (for track recommendations) is restricted to apps with existing extended mode access (removed for new apps Nov 2024).

---

## 15. Removed / Deprecated Endpoints

The following endpoints are **no longer available** to new applications. Apps with existing extended mode access may still use some of these.

### Removed in February 2026

| Endpoint | What it did |
|----------|-------------|
| `POST /users/{user_id}/playlists` | Create playlist for a specific user (use `POST /me/playlists`) |
| `GET /artists/{id}/top-tracks` | Artist's top tracks |
| `GET /markets` | List of available markets |
| `GET /browse/new-releases` | New album releases |
| `GET /albums` | Batch-fetch several albums |
| `GET /artists` | Batch-fetch several artists |
| `GET /audiobooks` | Batch-fetch several audiobooks |
| `GET /browse/categories` | Browse categories |
| `GET /browse/categories/{id}` | Single browse category |
| `GET /chapters` | Batch-fetch several chapters |
| `GET /episodes` | Batch-fetch several episodes |
| `GET /shows` | Batch-fetch several shows |
| `GET /tracks` | Batch-fetch several tracks |
| `GET /users/{id}/playlists` | Public user playlists |
| `GET /users/{id}` | Public user profile |
| `DELETE /me/albums` | Remove saved albums (use `DELETE /me/library`) |
| `DELETE /me/audiobooks` | Remove saved audiobooks (use `DELETE /me/library`) |
| `DELETE /me/episodes` | Remove saved episodes (use `DELETE /me/library`) |
| `DELETE /me/shows` | Remove saved shows (use `DELETE /me/library`) |
| `DELETE /me/tracks` | Remove saved tracks (use `DELETE /me/library`) |
| `PUT /me/albums` | Save albums (use `PUT /me/library`) |
| `PUT /me/audiobooks` | Save audiobooks (use `PUT /me/library`) |
| `PUT /me/episodes` | Save episodes (use `PUT /me/library`) |
| `PUT /me/shows` | Save shows (use `PUT /me/library`) |
| `PUT /me/tracks` | Save tracks (use `PUT /me/library`) |
| `GET /me/following/contains` | Check if following artists/users (use `GET /me/library/contains`) |
| `GET /playlists/{id}/followers/contains` | Check if following playlist (use `GET /me/library/contains`) |
| `GET /me/albums/contains` | Check saved albums (use `GET /me/library/contains`) |
| `GET /me/audiobooks/contains` | Check saved audiobooks (use `GET /me/library/contains`) |
| `GET /me/episodes/contains` | Check saved episodes (use `GET /me/library/contains`) |
| `GET /me/shows/contains` | Check saved shows (use `GET /me/library/contains`) |
| `GET /me/tracks/contains` | Check saved tracks (use `GET /me/library/contains`) |
| `PUT /me/following` | Follow artists or users (use `PUT /me/library`) |
| `PUT /playlists/{id}/followers` | Follow a playlist (use `PUT /me/library`) |
| `DELETE /me/following` | Unfollow artists or users (use `DELETE /me/library`) |
| `DELETE /playlists/{id}/followers` | Unfollow a playlist (use `DELETE /me/library`) |
| `GET /playlists/{id}/tracks` | Playlist tracks (use `GET /playlists/{id}/items`) |
| `POST /playlists/{id}/tracks` | Add to playlist (use `POST /playlists/{id}/items`) |
| `DELETE /playlists/{id}/tracks` | Remove from playlist (use `DELETE /playlists/{id}/items`) |
| `PUT /playlists/{playlist_id}/tracks` | Reorder playlist (use `PUT /playlists/{id}/items`) |

### Restricted in November 2024 (extended mode only)

| Endpoint | What it did |
|----------|-------------|
| `GET /artists/{id}/related-artists` | Related artists |
| `GET /recommendations` | Track recommendations |
| `GET /audio-features/{id}` | Audio features (tempo, key, energy, etc.) |
| `GET /audio-analysis/{id}` | Full audio analysis |
| `GET /browse/featured-playlists` | Featured playlists |

---

## 16. Design Notes for Fermata

These notes map Spotify's API surface to what Fermata will need to implement as an equivalent backend.

### Core data models (mirrors Spotify objects)

| Spotify Object | Fermata Model |
|----------------|---------------|
| Track | `models/track.py` |
| Album | `models/album.py` |
| Artist | `models/artist.py` |
| User | `models/user.py` |
| Playlist | `models/playlist.py` |
| PlaylistTrack | `models/playlist_track.py` (join table with `position`) |

### Endpoint parity to target for v1

Fermata doesn't need to mirror Spotify 1:1 — but here's a mapping of useful endpoints to build:

| Spotify | Fermata equivalent |
|---------|--------------------|
| `GET /tracks/{id}` | `GET /tracks/{id}` |
| `GET /albums/{id}` | `GET /albums/{id}` |
| `GET /albums/{id}/tracks` | `GET /albums/{id}/tracks` |
| `GET /artists/{id}` | `GET /artists/{id}` |
| `GET /artists/{id}/albums` | `GET /artists/{id}/albums` |
| `GET /search` | `GET /search` |
| `GET /playlists/{id}` | `GET /playlists/{id}` |
| `GET /playlists/{id}/items` | `GET /playlists/{id}/tracks` |
| `POST /me/playlists` | `POST /playlists` |
| `PUT /playlists/{id}` | `PUT /playlists/{id}` |
| `POST /playlists/{id}/items` | `POST /playlists/{id}/tracks` |
| `DELETE /playlists/{id}/items` | `DELETE /playlists/{id}/tracks/{track_id}` |
| `PUT /playlists/{id}/items` | `PUT /playlists/{id}/tracks` (reorder) |
| `GET /me` | `GET /users/me` |
| `GET /me/playlists` | `GET /users/me/playlists` |
| `GET /me/tracks` | `GET /users/me/tracks` |
| `PUT /me/library` (save) | `POST /users/me/library` |
| `DELETE /me/library` (remove) | `DELETE /users/me/library` |
| `GET /me/player` | Stretch goal — playback state |
| `GET /me/player/recently-played` | Stretch goal — history table |

### Auth scopes → Fermata permissions model

Spotify's scopes map to ownership/role checks in Fermata:

| Spotify scope | Fermata equivalent |
|---------------|--------------------|
| `playlist-modify-public` | Playlist owner check (public playlists) |
| `playlist-modify-private` | Playlist owner check (private playlists) |
| `user-library-read` | Authenticated user reading own library |
| `user-library-modify` | Authenticated user modifying own library |
| `user-read-private` | Authenticated user reading own profile |
| `user-top-read` | Authenticated user reading listening history |

### Key differences from Spotify

- Fermata stores actual audio files (S3/object storage) — Spotify returns signed preview URLs.
- Fermata will own user accounts — Spotify delegates to OAuth.
- No `available_markets` complexity needed in v1.
- `popularity` can be computed from play counts in the `recently_played` history table later.
