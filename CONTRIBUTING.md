# Contributing

This document covers how code should be written and submitted. For the
practical steps of running things locally, see `docs/WORKFLOW.md`.

## Before you start

Pull the latest version of the main branch, and create a new branch for
whatever you're about to work on. Avoid working directly on the main
branch — it should always stay in a state that runs correctly.

## Package installation policy

Use the project's `uv` wrapper for managing dependencies instead of
calling `pip` directly. Recommended commands:

- `uv add <package>` — add a package to the environment/project
- `uv sync` — sync the environment from the project's lockfile/manifest

If you or CI previously installed packages with `pip install`, please
prefer `uv add` and uninstall those `pip`-installed packages to avoid
environment drift.

## Writing commit messages

Each commit message should briefly say what kind of change it is and what
it does. A simple, consistent format makes the project's history much
easier to read later:

```
feat: add the ability to reorder tracks in a playlist
fix: correct how track duration is calculated
docs: explain the caching layer in the architecture doc
```

`feat` is for new functionality, `fix` is for correcting something broken,
and `docs` is for documentation changes. A few others exist (`chore`,
`refactor`, `test`) for maintenance, restructuring, and test-only changes.

## Opening a pull request

Keep each pull request focused on one thing. A pull request that fixes a
bug and also restructures unrelated code is harder to review and harder to
undo if something goes wrong.

Before asking for review, make sure:

- the tests pass
- the code is formatted and passes the linter
- the change is described clearly — what it does and how to test it
- `CHANGELOG.md` is updated if the change affects how the app behaves

## How code should be written

A few habits make the project easier to work with as it grows:

- Each function that defines an API endpoint should have a short
  description of what it does. FastAPI uses these descriptions to build
  the interactive documentation automatically, so writing them well pays
  off twice.
- Each piece of data sent or received by the API should have a brief
  description of what it represents, for the same reason.
- Logic that decides *what happens* belongs in the services layer, not
  inside the routing code. Routing code should stay simple — receive a
  request, hand it off, return a result.

## Adding something new

A reasonable checklist when adding a new piece of functionality:

- Define how the data involved is represented, both in the database and
  in the API.
- Write the logic for what should happen, separately from the routing.
- Add the route itself, keeping it short.
- Write a test that checks the new behaviour works as expected.
- Update the documentation if the change affects how the system works or
  how someone would use it.
- If the change involves a meaningful decision — choosing one approach
  over another — consider writing a short decision record explaining why,
  in the `docs/adr/` folder.

## Writing a decision record

Not every change needs one of these, but it's worth writing one whenever
future contributors (including a future version of yourself) might
reasonably ask "why was it done this way?" A template is provided in
`docs/adr/0000-template.md` — copy it, fill it in, and give it the next
available number.
