# Admin Panel & Track Upload Enhancements

## Summary

Add a full admin panel with CRUD for Users, Artists, Albums, and Tracks — all in one tabbed page. Enhance the track creation form to include an audio file picker that **auto-detects duration** from the file using the browser's `HTMLAudioElement` API (no manual duration input needed).

## Proposed Changes

### Backend — Admin User Management Endpoints

The backend currently has no user listing, update, or delete endpoints. These need to be added for the admin panel.

#### [MODIFY] [users.py](file:///e:/ML%20Projects/FastAPI%20Projects/Fermata%20–%20A%20production-ready%20music%20streaming%20backend%20powered%20by%20FastAPI/app/routers/users.py)
Add 4 admin-only endpoints:
- `GET /admin/users` — list all users (admin only)
- `POST /admin/users` — create a user with a specific role (admin only)  
- `PATCH /admin/users/{user_id}` — update user role/email/username (admin only)
- `DELETE /admin/users/{user_id}` — delete a user (admin only)

#### [MODIFY] [user.py schema](file:///e:/ML%20Projects/FastAPI%20Projects/Fermata%20–%20A%20production-ready%20music%20streaming%20backend%20powered%20by%20FastAPI/app/schemas/user.py)
Add `AdminUserCreate` and `AdminUserUpdate` schemas (include `role` field).

---

### Frontend — API Layer

#### [MODIFY] [artists.ts](file:///e:/ML%20Projects/FastAPI%20Projects/Fermata%20–%20A%20production-ready%20music%20streaming%20backend%20powered%20by%20FastAPI/frontend/src/api/artists.ts)
Add: `listArtists`, `createArtist`, `updateArtist`, `deleteArtist`

#### [MODIFY] [albums.ts](file:///e:/ML%20Projects/FastAPI%20Projects/Fermata%20–%20A%20production-ready%20music%20streaming%20backend%20powered%20by%20FastAPI/frontend/src/api/albums.ts)
Add: `listAlbums`, `createAlbum`, `updateAlbum`, `deleteAlbum`

> [!NOTE]
> Backend has no `GET /albums` list endpoint. We'll add `listAlbums` via the search API or add a new backend endpoint.

#### [NEW] [admin.ts](file:///e:/ML%20Projects/FastAPI%20Projects/Fermata%20–%20A%20production-ready%20music%20streaming%20backend%20powered%20by%20FastAPI/frontend/src/api/admin.ts)
Admin user management functions: `listUsers`, `createUser`, `updateUser`, `deleteUser`

#### [MODIFY] [types/index.ts](file:///e:/ML%20Projects/FastAPI%20Projects/Fermata%20–%20A%20production-ready%20music%20streaming%20backend%20powered%20by%20FastAPI/frontend/src/types/index.ts)
- Add `user_id` field to `Artist` type
- Make `User.role` required (not optional)

---

### Frontend — Admin Panel Page

#### [MODIFY] [ManageTracksPage.tsx](file:///e:/ML%20Projects/FastAPI%20Projects/Fermata%20–%20A%20production-ready%20music%20streaming%20backend%20powered%20by%20FastAPI/frontend/src/pages/ManageTracksPage.tsx)
Complete rewrite into a **tabbed admin panel** with 4 tabs:
- **Users** — Table with CRUD (create with role selector, edit role/username/email, delete)
- **Artists** — Table with CRUD (name, linked user_id)
- **Albums** — Table with CRUD (title, artist_id)
- **Tracks** — Existing track CRUD (enhanced with inline audio upload + auto-duration)

Each tab has search, add button, and an edit modal.

---

### Frontend — Enhanced Track Form

#### [MODIFY] [TrackFormModal.tsx](file:///e:/ML%20Projects/FastAPI%20Projects/Fermata%20–%20A%20production-ready%20music%20streaming%20backend%20powered%20by%20FastAPI/frontend/src/components/TrackFormModal.tsx)
- Add an **audio file picker** field
- When a file is selected, use `new Audio(URL.createObjectURL(file))` → listen for `loadedmetadata` → auto-populate `duration_seconds` from `audio.duration`
- Duration field becomes **read-only** (auto-filled from the audio file), displayed as formatted time
- The `onSubmit` callback now also returns the `File` so the parent can upload it after track creation

---

### Frontend — Route & Navigation

#### [MODIFY] [App.tsx](file:///e:/ML%20Projects/FastAPI%20Projects/Fermata%20–%20A%20production-ready%20music%20streaming%20backend%20powered%20by%20FastAPI/frontend/src/App.tsx)
Rename route from `manage-tracks` → `admin` (cleaner URL for full admin panel)

#### [MODIFY] [Sidebar.tsx](file:///e:/ML%20Projects/FastAPI%20Projects/Fermata%20–%20A%20production-ready%20music%20streaming%20backend%20powered%20by%20FastAPI/frontend/src/components/Sidebar.tsx)
Update sidebar link label from "Manage Tracks" → "Admin Panel", update href to `/admin`

---

### Backend — Albums List Endpoint

#### [MODIFY] [albums.py router](file:///e:/ML%20Projects/FastAPI%20Projects/Fermata%20–%20A%20production-ready%20music%20streaming%20backend%20powered%20by%20FastAPI/app/routers/albums.py)
Add `GET /albums` — list all albums with pagination (needed by the admin panel)

#### [MODIFY] [albums.py service](file:///e:/ML%20Projects/FastAPI%20Projects/Fermata%20–%20A%20production-ready%20music%20streaming%20backend%20powered%20by%20FastAPI/app/services/albums.py)
Add `list_albums` function

### Backend — Artists List Endpoint

#### [MODIFY] [artists.py router](file:///e:/ML%20Projects/FastAPI%20Projects/Fermata%20–%20A%20production-ready%20music%20streaming%20backend%20powered%20by%20FastAPI/app/routers/artists.py)
Add `GET /artists` — list all artists with pagination

#### [MODIFY] [artists.py service](file:///e:/ML%20Projects/FastAPI%20Projects/Fermata%20–%20A%20production-ready%20music%20streaming%20backend%20powered%20by%20FastAPI/app/services/artists.py)
Add `list_artists` function

---

## Audio Duration Auto-Detection (Frontend-only trick)

```
const audio = new Audio(URL.createObjectURL(file))
audio.addEventListener('loadedmetadata', () => {
  const seconds = Math.round(audio.duration)
  setDuration(seconds)
  URL.revokeObjectURL(audio.src)
})
```

This uses the browser's built-in media decoder — no libraries needed, works for all audio formats the browser supports (MP3, WAV, OGG, AAC, FLAC, etc.).

## Verification Plan

### Automated
- `npm run build` — zero TypeScript errors
- Backend: restart uvicorn and test new endpoints

### Manual
- Navigate to `/admin` as an admin user
- Verify all 4 tabs render with data tables
- Create/edit/delete a user, artist, album, track
- Upload an audio file during track creation → confirm duration is auto-filled
