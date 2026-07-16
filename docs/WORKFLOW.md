# Workflow

This document describes how work actually happens day to day — from
writing code to seeing it run. `CONTRIBUTING.md` covers style and review
expectations; this is about the steps in between.

## A typical work session

1. Make sure your local copy is up to date with the main branch.
2. Create a new branch for the thing you're working on.
3. Write the code, and the tests alongside it.
4. Run the app locally to see it actually working.
5. Run the test suite and the formatter before committing.
6. Commit your changes with a clear message.
7. Push the branch and open a pull request.
8. Once it's reviewed and approved, merge it in.

### Running the app

```
uvicorn app.main:app --reload
```

The `--reload` flag restarts the server automatically whenever a file
changes, so there's no need to stop and start it manually while working.

### Running the tests

```
pytest
```

To run just one file, or only tests whose names match a certain word:

```
pytest tests/test_tracks.py
pytest -k "playlist"
```

### Formatting and checking code style

```
black .
ruff check .
```

Running these before pushing avoids back-and-forth review comments about
formatting, and matches what the automated checks will run anyway.

## How branches are organised

The main branch should always be in a working state — nothing broken ever
sits there for long. All new work happens on a separate branch first, and
only joins the main branch once it's reviewed.

Branch names describe what they're for:

- `feature/playlist-reorder` for new functionality
- `fix/track-duration-bug` for bug fixes
- `chore/update-dependencies` for maintenance work that isn't a feature or
  a fix

## Pull requests

A pull request is simply a request to merge one branch into another, with
a chance for review first. A good one is easy to read: it explains what
changed, why, and how someone else could check it works.

A short template to follow:

```
What changed:
Why:
How to test it:
```

Once a pull request is approved, it gets merged in as a single combined
commit, which keeps the project's history easy to read later.

## Automated checks

Every pull request triggers a small pipeline that checks the code before
it's allowed to merge: formatting is verified, tests are run, and the
project is built to make sure nothing is broken. If any step fails, the
pull request can't be merged until it's fixed.

Once changes reach the main branch, this same pipeline can also deploy
them automatically to a staging environment — a copy of the app used for
testing changes safely before they go live.

## Changing the database

Any change to how data is structured — adding a new field, a new table,
and so on — needs an accompanying migration. A migration is a small,
recorded set of instructions that updates the database to match the new
structure. Migrations are written automatically based on the change, then
checked by hand before being applied:

```
alembic revision --autogenerate -m "describe the change here"
alembic upgrade head
```

These migration files are committed together with the code change that
caused them, in the same pull request, so the two never drift apart.

## Releasing a new version

When a meaningful set of changes is ready to go live:

1. Make sure everything intended for the release has been merged.
2. Note what changed in `CHANGELOG.md`.
3. Update the version number.
4. Tag the release in git.

The automated pipeline then takes that tagged version and deploys it to
production.

## If something goes wrong after a release

The safest first step is almost always to roll back to the previous
working version, rather than trying to fix the problem under pressure.
Once things are stable again, write down what happened and why, and add a
test that would have caught it, before attempting the fix properly.
