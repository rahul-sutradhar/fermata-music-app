# Fermata

A music streaming backend, built with FastAPI, while learning each part of
the stack along the way.

## What this project is

Fermata is the backend for a music app — something in the spirit of
Spotify. It handles user accounts, songs, albums, artists, playlists,
search, and serving audio for playback. There is no app or website attached
to it yet; this is just the engine underneath one.

The project is also a learning exercise. Each part of the stack — the API,
the database, authentication, deployment, and so on — is being built one at
a time, as it's learned, rather than all at once. The `TODO.md` file in
this repository tracks this progress in small, checkable steps.

## What it can do so far

This section will grow as features are completed. Right now:

- The project scaffold is in place (`app/` layout, config, dependencies).
- The API runs locally with interactive docs at `/docs`.
- `GET /health` — service health check.
- `GET /tracks`, `GET /tracks/{id}`, `POST /tracks`, `PATCH /tracks/{id}`,
  `DELETE /tracks/{id}` — full Track CRUD backed by PostgreSQL.
- `GET /auth/me` — returns the stub authenticated user via `Depends()`.
- Consistent error responses (`{"detail": "..."}`) for 400, 403, 404, 422, and 500.

## Getting it running

These steps assume Python is already installed.

1. Clone the repository and move into it.

   ```
   git clone https://github.com/yourname/fermata.git
   cd fermata
   ```

2. Create a virtual environment and turn it on.

   ```
   python -m venv venv
   source venv/bin/activate
   ```

   (On Windows, use `venv\Scripts\activate` instead.)

3. Install the required packages.

   Preferred (using `uv`):

   ```
   uv sync
   # add individual packages with:
   uv add <package>
   ```

   If you previously used `pip install` to add packages, please uninstall
   them and prefer `uv add` for future installs.

4. Copy the example environment file and fill in your own values.

   ```
   cp .env.example .env
   ```

5. Start PostgreSQL and prepare the database.

   Ensure a native Postgres server is running and `DATABASE_URL` in `.env` points to it.

   Then create the database, run migrations, and seed sample data:

   ```
   python -m app.db.create_db
   alembic upgrade head
   python -m app.db.seed
   ```

6. Start the development server.

   ```
   uvicorn app.main:app --reload
   ```

7. Open your browser to `http://localhost:8000/docs`. This page is
   generated automatically by FastAPI and lets you try out the API
   directly.

## How the project is organised

```
app/
  main.py        the entry point that starts the application
  core/          settings and configuration
  models/        how data is represented in the database
  schemas/       how data is represented in API requests and responses
  routers/       the actual API endpoints, grouped by topic
  services/      the logic behind each action (kept separate from routing)
  db/            database connection, seed script, and migration helpers
alembic/         database migration files
tests/           automated tests
docs/            all written documentation, including this folder's siblings
```

## Where to read more

- `docs/ARCHITECTURE.md` — how the system is put together, and why
- `docs/WORKFLOW.md` — how changes go from an idea to something running
- `docs/CONTRIBUTING.md` — how to write and submit code for this project
- `TODO.md` — the project broken into small, trackable steps
- `CHANGELOG.md` — a running log of what has changed over time

## License

MIT
