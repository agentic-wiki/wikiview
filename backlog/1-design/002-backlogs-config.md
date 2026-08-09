---
type: task
title: "where the config lives, and which folders are backlogs"
status: todo
priority: high
tags: [feature, config]
---

Config is **entirely optional**. A stock bundle serves with no configuration at all: the reader needs none, table and grid views need none (the structure is the markdown table), and a board infers its columns from the entries in the folder. Config exists for what inference gets wrong, not for what it gets right.

## Where it lives

`[tool.wikiview]` inside `wiki.toml`, depending on the upstream `[tool.*]` namespace (`wiki` backlog, *reserve a per-tool config namespace in wiki.toml*). Named rather than linked: a relative link out of this bundle would assume a sibling checkout, and `check` is right to flag it.

The alternative is a `wikiview.toml` beside the bundle, and the retro lists satellite configs as a failure. The argument that settles it is that the alternative is not *one* extra file, it is one per tool, forever. `pyproject.toml` is the precedent and it works.

**Never a second parser.** `bundle.Bundle` hands the tables over; a TOML reader here would be another rule with two homes.

## Shape

```toml
[[tool.wikiview.board]]
path    = "/backlog"
where   = ["type=task"]                              # default
status  = "status"                                   # default
columns = ["backlog", "todo", "in-progress", "done"] # default: inferred
lane    = "priority"                                 # default: no lanes
```

An **array of tables**, because every setting here is per board: two backlogs in one bundle can legitimately use different status vocabularies, and a flat `backlogs = [...]` cannot carry that. `path` is the only required key; it is the board's identity.

**`where` reuses the `--where` spelling**, parsed by `index.ParseFilter`. This is the reason that parser was extracted from the CLI: the query syntax belongs to the query contract, so a board filter, a CLI flag, and a URL query are one language with one implementation. A bare `type` key would have been a second, weaker filter syntax that grows into the first one anyway.

## The rule that governs the defaults

**No entry in scope may be invisible.** Config pins order and adds empty columns; it never hides cards. Two consequences, and they are not negotiable:

- A status present in the entries but absent from `columns` gets a column appended after the declared ones. Silently dropping it would make a card vanish from the board while still sitting in the folder, which reads as data loss.
- Entries with no status key at all get a column, shown only when non-empty.

This is what keeps `columns` an ordering aid rather than a filter. Filtering is `where`'s job, where it is explicit.

## Declaration is discovery, not permission

Any folder is boardable by URL whether listed or not. `board` entries decide what the UI *surfaces*: what appears in navigation and what is offered by default. A bundle with no config still boards any folder you point at, and the UI can still identify candidate folders itself (a folder whose entries are mostly `type: task` carrying a status key).

## Validation belongs here, not upstream

Resolved from the earlier open question, which asked whether `wiki check` should warn when a declared board path does not exist. It cannot, and should not: the whole point of `[tool.*]` is that `wiki` never parses or validates what is inside it. The moment it validated one tool's keys it would hold an opinion about that tool.

So **wikiview validates its own section** and reports on startup: an unknown key under `[tool.wikiview]`, a `board.path` that does not exist, a `where` expression that does not parse. Same footgun class as an unknown `wiki.toml` key, handled by the tool that understands the keys.

**Unblocked.** The upstream `[tool.*]` namespace shipped in `wiki` v0.9.0, read through `bundle.DecodeTool`. This bundle's own `wiki.toml` already declares a board with it and `wiki check` stays silent, so the shape above is exercised rather than only proposed. What remains here is code that reads it: the API reports which tool tables exist, but nothing decodes the board yet.

**Acceptance:** a bundle with no `[tool.wikiview]` serves every view correctly; a declared board pins its column order and surfaces in navigation; an entry whose status is undeclared still appears; wikiview reports its own config errors and `wiki check` stays silent about the namespace.
