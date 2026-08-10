---
type: task
title: "choosing which folders are boards"
status: todo
priority: medium
tags: [feature, boards, config]
blockers: [/4-boards/001-board-view.md]
---

The Boards list in the rail, and how a folder gets onto it.

**Declaration is discovery, not permission.** Any folder is boardable by URL whether listed or not. `[[tool.wikiview.board]]` only decides what the UI *surfaces*: what appears in the rail and which board is offered by default. A bundle with no config still boards any folder you point at.

## Adding one

Two ways in, because they suit different moments:

- **From the folder you are looking at** — a "view as board" action, which is just navigation to `/kanban/<that folder>`. Nothing is configured; you are simply trying it.
- **From a picker** over the same tree the panel already shows, for choosing a folder you are not currently in.

Adding a board to the *list* is a config write: appending a `[[tool.wikiview.board]]` table to the bundle's `wiki.toml`. That is a real edit to a file the user owns and `wiki` also reads, so it is explicit, never implicit in having visited a folder.

**The engine will not help write it.** `bundle.DecodeTool` reads the namespace; nothing writes it, and `wiki`'s frontmatter write API is for entries, not for `wiki.toml`. So this needs a TOML writer here — the one place a second config implementation is unavoidable. Worth checking whether it can be narrow enough to be obviously correct: appending a table, not rewriting the file.

**Candidates can be suggested.** A folder whose entries are mostly `type: task` carrying a status key is probably a backlog, and offering it is cheaper than making the user hunt. A suggestion, never an automatic entry in the config.

## Validation belongs here

`wiki` never parses inside `[tool.*]` — that is the point of reserving it — so it cannot warn about a board path that does not exist or a `where` expression that does not parse. wikiview validates its own section and reports on startup.

**Acceptance:** declared boards appear in the rail; any folder boards by URL; "view as board" needs no config; adding to the list appends to `wiki.toml` without disturbing the rest of the file; a bad path or filter in the config is reported rather than silently ignored.
