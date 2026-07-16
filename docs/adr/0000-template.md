# 0000. Template — Decision Record

Date:
Status: proposed / accepted / replaced by a later decision

## What problem this addresses

A short description of the situation that needed a decision, and any
constraints worth knowing about (time, experience level, what already
exists).

## What was decided

One or two sentences. State the decision plainly.

## What else was considered

For each alternative, a sentence or two on what it would have offered, and
why it wasn't chosen.

- **Option A** —
- **Option B** —

## What this means going forward

What becomes simpler because of this choice, what becomes harder, and
whether it creates any follow-up work.

---

### Example, filled in

# 0001. Storing audio files separately from the database

Date: 2026-06-21
Status: accepted

## What problem this addresses

Songs need to be stored somewhere, and played back on request. The
database is good at storing small, structured information, but not well
suited to storing large files directly.

## What was decided

Audio files are stored in dedicated file storage, not in the database. The
database only keeps a reference to where each file lives.

## What else was considered

- **Storing audio directly in the database** — simpler at first, but would
  make the database slow and expensive to scale as more music is added.
- **Streaming audio through the API itself** — would work, but means every
  play request uses up the API's own resources, rather than letting
  dedicated file storage handle that load.

## What this means going forward

Playback requests involve one extra step — generating a temporary link to
the file — but the database stays small and fast, and the heavy lifting of
actually delivering audio is handled by something built for that purpose.
