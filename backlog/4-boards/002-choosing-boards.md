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

## `id`, and what it unlocks

Today `path` is the board's identity, which means one board per folder. That forbids the thing people will reach for first: **two views of the same backlog**, one showing everything and one filtered to bugs, or a board grouped by `priority` beside the same folder grouped by `area`. The config can express the settings; it cannot express two of them over one path.

So a board gets an `id`:

```toml
[[tool.wikiview.board]]
id    = "bugs"
path  = "/backlog"
where = ["type=task", "kind=bug"]
```

**Optional when there is one board over a folder, required when there are several.** A bundle with a single backlog writes `path` and nothing else, and the id is `default`. The moment a second board names the same path, both need an id, and the validation already reporting duplicate paths says so instead. Requiring it from everyone would tax the common case to serve the rare one.

**An id is a word, not a path.** No slashes, so it cannot be confused with a folder, and it is what the URL carries:

```
/kanban/bugs                       the board
/kanban/bugs?card=/backlog/x.md    a card on it
```

**Ad-hoc boarding keeps the path form.** A folder nobody declared has no id, so `/kanban/<folder path>` still boards it, resolved after ids and before giving up.

**Which is why the card stays a query.** Putting it back in the path — `/kanban/<id>/<bundle path>` — is unambiguous only if every board has an id, and an undeclared folder does not. `/kanban/a/b` would mean either the board `a` showing card `/b` or the folder `/a/b`, and nothing in the URL says which. Deriving ids for undeclared folders does not save it: two folders named `notes` under different parents would collide, and "any folder boards by URL" is the rule that would have to give way.

So an id says *which board*, and the query says *which card*, and neither has to guess what the other meant.

**The default id comes from the path.** A board over `/backlog` is `backlog`; the root is `root`. A constant like `default` cannot be the default, because two boards over different folders would both claim it. Two boards whose paths end in the same segment collide too, and that is reported the same way a duplicate id is: name them.

**Nothing else changes.** `path` still says which folder; `id` only says which of the boards over it. A bundle that never declares two boards over one folder never sees the difference.

## Adding one

Two ways in, because they suit different moments:

- **From the folder you are looking at** — a "view as board" action, which is just navigation to `/kanban/<that folder>`. Nothing is configured; you are simply trying it.
- **From a picker** over the same tree the panel already shows, for choosing a folder you are not currently in.

**With no boards declared, the panel is where this starts.** Rather than a note explaining that folders board by URL, it offers to make the first one: pick a folder, and that is the whole interaction. The empty state of a feature is the one moment somebody is definitely willing to be told how it works.

Adding a board to the *list* is a config write: appending a `[[tool.wikiview.board]]` table to the bundle's `wiki.toml`. That is a real edit to a file the user owns and `wiki` also reads, so it is explicit, never implicit in having visited a folder.

**The engine will not help write it.** `bundle.DecodeTool` reads the namespace; nothing writes it, and `wiki`'s frontmatter write API is for entries, not for `wiki.toml`. So this needs a TOML writer here — the one place a second config implementation is unavoidable. Worth checking whether it can be narrow enough to be obviously correct: appending a table, not rewriting the file.

**Candidates can be suggested.** A folder whose entries are mostly `type: task` carrying a status key is probably a backlog, and offering it is cheaper than making the user hunt. A suggestion, never an automatic entry in the config.

## The board you were last on

Remembered locally, under this bundle's own key ([UI state scoped per bundle](../3-reader/002-per-bundle-ui-state.md)), because it is one person's view preference rather than something everyone opening the folder shares. The list of boards is never remembered: it comes from `wiki.toml` on every load, where it is versioned with the files.

A stored board that no longer resolves is a small problem. The reader is the default view — `/` opens `index.md`, never a board — so the stored value is never a startup route, only what the rail preselects. When it does not resolve:

- **Drop it and preselect nothing.** Silently: the folder was renamed or deleted by whoever did it, and a dialog about a view preference is noise.
- **Do not fall through to another board.** Picking "the next one" lands someone on a board they did not ask for, which is worse than landing nowhere.
- **Do not follow a rename.** `wiki move` could have relocated the folder, and matching it up would be a heuristic that is wrong exactly when it matters.

Nothing is lost by forgetting: an undeclared folder is still boardable by URL, so the address bar and the tree both still reach it.

## Validation belongs here

`wiki` never parses inside `[tool.*]` — that is the point of reserving it — so it cannot warn about a board path that does not exist or a `where` expression that does not parse. wikiview validates its own section and reports on startup.

**Acceptance:** declared boards appear in the rail; any folder boards by URL; "view as board" needs no config; adding to the list appends to `wiki.toml` without disturbing the rest of the file; a bad path or filter in the config is reported rather than silently ignored.
