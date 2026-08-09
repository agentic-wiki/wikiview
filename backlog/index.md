---
okf_version: "0.1"
---

# wikiview

Backlog for [wikiview](../README.md), kept as an agentic-wiki bundle and operated with `wiki`.

**Goal:** a web UI over a bundle that reads like a wiki, boards like a kanban, and never becomes a markdown editor.

This board carries the things that outlast a task: the goal, the epics, and where we are in them. Individual tasks are entries, and entries are queried:

```sh
wiki list --where type=task --where status!=done      # everything open
wiki list --where type=task --where status=in-progress # what is being worked
wiki list --where type=task --prefix /2-server        # one epic's tasks
wiki property status --counts                         # the shape of the work
```

Nothing here mirrors a task's state. A task owns its `status`, so the board cannot drift out of sync with one, and a task that is never listed here is still found by the queries above.

## Epics

Each step is finished before the next begins. The order is load-bearing rather than tidy: a reader built on top of a board inherits the board's shape, and that is not something you undo later.

**1 — Design** *(settled)*
One index rebuilt on change, no view privileged in the store. Rules stay in the engine and the server answers rather than the browser asking. Config is `[tool.wikiview]` in the bundle's own `wiki.toml`, and all of it is optional.

**2 — Server** *(current)*
A bundle served over HTTP with no UI. The store and a read-only API are done; the watcher, the change digest, and SSE are what remain, so the reader has something live to subscribe to rather than having live updates retrofitted later.

**3 — Reader**
Real routes, the front door at `index.md`, navigation by links, datasets rendered as tables. The reader is the product; the board is a view inside it.

**4 — Boards**
Columns, lanes, drag on pointer events, the card sheet. A view over one folder of the same index, reached from the reader and returning to it.

## Upstream

Built on [`wiki` v0.9.0+](https://github.com/agentic-wiki/wiki), imported directly. Every rule lives there and none is reimplemented here: frontmatter reads and writes, link resolution both ways, checkbox toggling, `--where` parsing. Config is `[tool.wikiview]` inside the bundle's own `wiki.toml`, read through `bundle.DecodeTool`.

Wanted upstream, not blocking: an incremental rebuild (`.wiki` cache), since a long-lived server rebuilds the whole bundle on every change.
