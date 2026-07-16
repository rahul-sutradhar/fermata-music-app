# Architecture

This document explains how Fermata is put together, and the reasoning
behind the major decisions. It assumes you've already read the README.

## The big picture

A user's device — a phone or a browser — talks to the Fermata API over the
internet. The API is responsible for handling requests, checking who's
allowed to do what, and reading or writing data. It relies on two other
pieces to do its job:

- A **database**, which stores everything except the actual audio —
  things like song titles, playlists, and user accounts.
- **Storage for the audio files themselves**, kept separate from the
  database because audio files are large and the database isn't built to
  handle that efficiently.

When someone wants to play a song, the API doesn't send the audio itself.
Instead, it gives the device a temporary link that points directly to
where the audio is stored, and the device downloads or streams the song
from there. This keeps the API fast and simple — its job is to answer
questions and hand out permissions, not to move large files around.

A caching layer sits alongside the database. Its job is to remember the
answers to common, repeated questions — like "what are the most played
songs this week" — so the database doesn't have to recalculate that answer
every single time someone asks.

## How the code itself is organised

The application code is split into a few clear jobs, each living in its
own folder:

- **Routers** define what URLs exist and what they accept. Their only job
  is to receive a request and pass it along — they shouldn't contain real
  logic themselves.
- **Services** hold the actual logic — the rules about what's allowed,
  what happens when something is created or changed. This is where most of
  the thinking happens.
- **Models** describe how data is stored in the database.
- **Schemas** describe what data looks like when it enters or leaves the
  API. These are kept separate from models on purpose: what's stored
  internally doesn't always match what should be shown to the outside
  world (a password, for example, is stored but never returned).

Keeping these responsibilities separate makes it much easier to test each
part on its own, and to change one without accidentally breaking another.

## Track CRUD — the reference pattern

`Track` is the first entity built end-to-end. Every other resource (albums,
playlists, users, and so on) should follow the same shape.

### Request flow

```
HTTP request
    → router        validates input, injects db + current user
    → service       business rules, raises HTTPException on failure
    → schema out    Pydantic model returned to the client
```

Routers stay thin: they never contain business logic. Services never know
about HTTP — they receive a database session and plain Python/Pydantic
types, and raise `HTTPException` only for expected client-facing errors.

### Endpoints
______________________________________________________________________________________________________
| Action |  Method  |        Path          |          Request body           |       Response        |
|--------|----------|----------------------|---------------------------------|-----------------------|
| List   | `GET`    | `/tracks`            | (query: `skip`, `limit`, `q`)   | `list[TrackResponse]` |
| Create | `POST`   | `/tracks`            | `TrackCreate`                   | `TrackResponse` (201) |
| Read   | `GET`    | `/tracks/{track_id}` |                                 | `TrackResponse`       |
| Update | `PATCH`  | `/tracks/{track_id}` | `TrackUpdate` | `TrackResponse` |                       |
| Delete | `DELETE` | `/tracks/{track_id}` |                                 | 204 No Content        |
------------------------------------------------------------------------------------------------------

Writes (`POST`, `PATCH`, `DELETE`) require an authenticated user via
`CurrentUser`. Reads are open for now.

### Schemas per operation

- **`TrackCreate`** — fields required to create a track.
- **`TrackUpdate`** — all fields optional, but at least one must be sent.
- **`TrackResponse`** — what the API returns; never includes internal-only data.

Create and update schemas are kept separate from the response schema on
purpose: clients shouldn't send an `id` on create, and update allows
partial changes.

### Files for one entity

```
app/routers/tracks.py    ← HTTP layer
app/services/tracks.py   ← business logic
app/schemas/track.py     ← request/response shapes
app/models/track.py      ← database table (added in section 2)
```

Right now the track service reads and writes through SQLAlchemy. Routers
and schemas stay the same.

## The main pieces of data

The project is built around a small set of core ideas:

- A **user** can create and own playlists.
- An **artist** can have multiple albums.
- An **album** belongs to one artist and contains multiple tracks.
- A **track** is a single song, and belongs to one album.
- A **playlist** belongs to one user and contains an ordered list of
  tracks — ordered, because the position of a song in a playlist matters.

## Logging in and staying logged in

When someone logs in, they're given two things: a short-lived pass that
proves who they are for the next short while, and a longer-lived one that
can be used to quietly get a new short-lived pass without logging in
again. The short one expires quickly on purpose — if it's ever stolen, the
damage it can do is limited. The longer-lived one is stored in a way that
allows it to be cancelled immediately if needed, for example if an account
is compromised.

Decisions about who's allowed to do what — like "only the owner of a
playlist can edit it" — live in the services layer, not scattered across
individual routes. This keeps that logic in one place and easy to reason
about.

## Playing audio

Audio files live in dedicated file storage, not in the database. The
database only keeps a reference to where each file is. When playback is
requested, the API creates a temporary, expiring link to the file and
sends that back. The device then streams the audio directly from storage.
This split — small structured data in the database, large files in
storage — is a common and deliberate pattern, not an accident.

## Handling things going wrong

Expected problems — like asking for a song that doesn't exist, or trying
to edit someone else's playlist — are met with a clear, specific error
message. Unexpected problems are caught in one central place, logged for
later review, and shown to the user as a generic message, so internal
details are never accidentally exposed.

## Why these choices were made

The reasoning behind larger decisions — like the choice of database, or
why audio is served the way it is — is kept separately in the `adr/`
folder, one short document per decision. This keeps this file focused on
*how things work now*, while the decision records explain *why they ended
up this way*, which becomes valuable once those reasons are no longer
fresh in memory.

## What's intentionally left out for now

Some features are deliberately not part of the early version, to keep the
core simple while it's still being learned and built:

- Recommending music based on listening habits
- Following other users or artists
- Downloading music for offline listening

These may be added later, but only once the foundation is solid.
