---
type: task
title: "declaring and editing graphs from the UI"
status: todo
priority: medium
tags: [feature, graphs, config]
blockers: [/7-graphs/001-graph-view.md]
---

What boards already have, for graphs: a form to declare one and a sheet to change its settings, both writing `wiki.toml` line by line through the writer boards use.

- **Declaring.** `POST /api/graph` appends a `[[tool.wikiview.graph]]` table with `id`, `path` and `name`, by the same rules as a board: the name proposes an id, a taken id is refused, and a folder with nothing in it is refused rather than becoming an empty page.
- **The empty state is the form.** The Graphs panel with none declared shows the folder picker in place of the snippet [the graph view](./001-graph-view.md) ships with.
- **Settings.** `PUT /api/graph/{id}` takes `name`, `where` and `neighbours` and rewrites those lines. `id` and `path` are not settings, as for a board.

Reuse, not a copy: the board form and the TOML writer are generalised over the kind of table they write, rather than duplicated for a second one.

**Acceptance:** a graph can be declared and edited without opening `wiki.toml`, and the file's comments and other tables survive both.
