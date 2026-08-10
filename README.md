# wikiview

> A web UI for [agentic-wiki](https://github.com/agentic-wiki/wiki) bundles: read your markdown, board your backlogs, render your datasets.

A bundle is a folder of Markdown that an agent maintains and the `wiki` CLI queries like a database. wikiview is the screen for it: a **reader** first, with kanban boards and dataset tables as views onto the same index.

```sh
wikiview --root my-kb    # serves on http://localhost:8080
```

## What it is

**A lens over files it does not own.** An agent edits this bundle while the UI is open. Someone edits it in Obsidian. `wiki move` relocates things. So the UI holds no state the files don't, caches nothing the files don't have, and enforces no policy the files can violate. It follows along within a second of any change.

**A reader by default.** Serving a bundle opens its front door and navigates by links, the way the format intends. A board is one view you switch into, over one folder, not the thing the server is for.

**Read plus structured edits, never prose editing.** Tick a checkbox, change a status, set a field. Not a markdown editor: your real editor is already open on these files and an agent is writing them concurrently, so a browser textarea would be the worst of the three. That line is what keeps this from becoming a worse Obsidian.

## Relationship to `wiki`

`wiki` is the engine and stays one: a single static binary with one dependency, a neutral index over a folder. wikiview imports its packages rather than shelling out to the CLI, so there is one implementation of every rule — one link resolver, one frontmatter writer, one `--where` parser — and it lives in the engine.

That import is load-bearing. This repo previously existed as a separate program that shelled out, and the module boundary quietly excused a second frontmatter writer and a third link resolver, each written where it was needed because the right home was unreachable. See [the retro](backlog/lessons/001-first-attempt.md); it is the shortest description of what this repo is trying not to be.

Configuration lives in the bundle's own `wiki.toml`, under `[tool.wikiview]`, read through `bundle.DecodeTool` — so there is no satellite config file and no second TOML parser. All of it is optional: a stock bundle serves with none.

## Status

**Early.** The server exists with no UI: it holds the bundle's index in memory and answers two read-only endpoints.

```
GET /api/bundle              the bundle itself: dir, spec, entry count, [tool.*] tables, version
GET /api/entry/{path...}     one entry: frontmatter verbatim, unrendered body, checkboxes,
                             and its links and backlinks with every target already resolved
GET /api/events              server-sent events carrying the current version
```

Links arrive resolved to bundle paths because turning a written link into a path is the engine's rule; a browser doing it would be the second implementation this repo exists to avoid.

A watcher follows the files, so an agent or an editor changing the bundle updates the index without anything asking it to. Clients hear a **version**, never a payload, and refetch what they are looking at — so a client that missed ten events pulls once and is correct again. The version moves only when content actually changed: a save that edited nothing, or a `tidy` that found nothing to fix, does not churn every open tab.

No writes and no frontend yet — both are deliberate next steps rather than omissions. The plan, and the reasoning behind it, is in [`backlog/`](backlog/index.md), itself a wiki bundle that wikiview serves.

```sh
just serve      # serves this repo's own backlog
just check      # vet + lint + test
just backlog    # check the backlog with the engine it is built on
```

Requires the engine at `v0.9.0` or later, which is where its packages became importable. Nothing else: `go build ./...` is enough.
