---
okf_version: "0.1"
---

# wikiview

Backlog for [wikiview](../README.md), kept as an agentic-wiki bundle and operated with `wiki`.

**Goal:** a web UI over a bundle that reads like a wiki, boards like a kanban, and never becomes a markdown editor.

**Read [the retro](./lessons/001-first-attempt.md) before writing anything.** A working UI for this already existed and was thrown away, and the reasons are all structural.

This board carries the things that outlast a task: the goal, the epics, and where we are in them. Individual tasks are entries, and entries are queried:

```sh
wiki list --where type=task --where status!=done      # everything open
wiki list --where type=task --where status=in-progress # what is being worked
wiki list --where type=task --prefix /2-server        # one epic's tasks
wiki property status --counts                         # the shape of the work
```

Nothing here mirrors a task's state. A task owns its `status`, so the board cannot drift out of sync with one, and a task that is never listed here is still found by the queries above.

## Epics

The sequence is deliberate and each step is finished before the next begins. That ordering is the retro's main lesson: a UI shaped around a board over one folder could not be retrofitted into a reader over a whole bundle, because the difference is structural.

**1 — Design** *(settled)*
One index rebuilt on change, no view privileged in the store. Rules stay in the engine and the server answers rather than the browser asking. Config is `[tool.wikiview]` in the bundle's own `wiki.toml`, and all of it is optional.

**2 — Server** *(current)*
A bundle served over HTTP with no UI. The store and a read-only API are done; the watcher, the change digest, and SSE are what remain, so the reader has something live to subscribe to rather than having live updates retrofitted later.

**3 — Reader**
Real routes, the front door at `index.md`, navigation by links, datasets rendered as tables. The reader is the product; the board is a view inside it.

**4 — Boards**
Columns, lanes, pointer-events drag, the card sheet. All of it exists in the previous attempt and none of it is wrong — it simply cannot come first, or the reader ends up shaped around it again.

## Upstream

Both blockers shipped in [`wiki` v0.9.0](https://github.com/agentic-wiki/wiki), which this module now depends on directly.

- **The core packages are importable**, with the four rules this repo would otherwise have reimplemented: frontmatter reads, link resolution both ways, surgical frontmatter writes, and checkbox toggling.
- **`[tool.*]` is reserved in `wiki.toml`**, read through `bundle.DecodeTool` so no tool writes a second parser. This bundle's own `wiki.toml` declares a board with it.

Wanted but not blocking: an incremental rebuild (`.wiki` cache) upstream, since a long-lived server currently rebuilds the whole bundle on every change.
