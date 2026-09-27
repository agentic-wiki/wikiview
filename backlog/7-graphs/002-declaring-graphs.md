---
type: task
title: "declaring and editing graphs from the UI"
status: done
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

## Done

`POST /api/graph` and `PUT /api/graph/{id}`, through `config.DeclareGraph` and `config.UpdateGraph`.

**One writer, not two.** `declare` appends a table of any kind, and `findTable` and `applySettings` take the kind and the keys it owns, so a board and a graph are written by the same lines of code. A board and a graph can share an id, so finding a table by id means finding it by kind as well — tested with both in one file. `declareRoot` lost its key-by-key switch along the way: each kind of settings renders its own values, and both writers read them.

**Refused, for a graph:** an id that is not a word, one another graph has (a board's does not count), a folder with no entries at all, a filter that does not parse, and a value that would break the file. A graph has no default filter, so "empty" means an empty folder, where for a board it means no tasks.

**One form, one frame.** `NewBoard` became `NewView`, taking a kind: the folder, name and suggested id are the same, and only the prefix, the wording and the request differ. `BoardSettings` gave up its dialog chrome to `SettingsDialog` and its filter editor to `filters.tsx`, which `GraphSettings` uses too. The filter editor says "card" or "node", and it offers the keys the graph's folder holds, which the graph response now carries as `fields` just as a board's does.

**The panel.** Boards and Graphs are one `ViewsPanel`: the form when none is declared, and the list with a "+ New" disclosure otherwise. The snippet the graph panel showed in the meantime is gone.

Neighbours are a checkbox in the settings, not in the view header. The header's Direction toggle is a preference kept in the browser; neighbours changes which entries the graph holds, so it is written to the file.
