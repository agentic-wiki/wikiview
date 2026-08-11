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

**2 — Server** *(done)*
A bundle served over HTTP with no UI: the index in memory, a read-only API, and a watcher that follows the files so the index never needs asking. Clients hear a version over SSE and refetch; the version moves only when content actually did.

**3 — Reader** *(current)*
Real routes, the front door at `index.md`, navigation by links, datasets rendered as tables. The reader is the product; the board is a view inside it. The engine's rules travel as data, so the client resolves links by lookup and never learns what a bundle root is.

The shell is settled: an icon rail, a collapsible panel, ellipsizing breadcrumbs, and a ⌘K overlay. One layout rather than a preference — the three are affordances that compose, and two selectable layouts would mean every future view built twice.

**4 — Boards**
Columns, lanes, drag on pointer events, the card sheet. A view over one folder of the same index, reached from the reader and returning to it. Any folder boards by URL; `[[tool.wikiview.board]]` only decides what the UI surfaces.

**5 — Actions**
Refresh, pull, sync. The first things that reach outside the machine, so each previews before acting, and a failed pull restores the previous state and offers the work as a named branch rather than stranding anyone in a conflicted tree.

## Upstream

Built on [`wiki` v0.9.0+](https://github.com/agentic-wiki/wiki), imported directly. Every rule lives there and none is reimplemented here: frontmatter reads and writes, link resolution both ways, checkbox toggling, `--where` parsing. Config is `[tool.wikiview]` inside the bundle's own `wiki.toml`, read through `bundle.DecodeTool`.

Wanted upstream, not blocking: an incremental rebuild (`.wiki` cache), since a long-lived server rebuilds the whole bundle on every change.

## Releases

Tagged releases build the frontend into the binary, publish archives for macOS, Linux and Windows, and push a Homebrew formula to `agentic-wiki/homebrew-tap`. See [CHANGELOG.md](../CHANGELOG.md).

