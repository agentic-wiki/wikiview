---
type: task
title: "customizing a board: columns, lanes, filters"
status: todo
priority: medium
tags: [feature, boards, config]
blockers: [/4-boards/002-choosing-boards.md]
---

Editing a board's settings from the board itself, rather than by hand-editing `wiki.toml`.

Everything a board reads is already configurable — `where`, `status`, `columns`, `lane` — and all of it is optional. What is missing is a way to change it without leaving the UI, and a way to see what is currently inferred versus what is pinned.

## What is editable

- **Column order**, by dragging column headers. Inference gives the columns that exist; only config gives them an order.
- **Empty columns**, added explicitly. A board with nothing `in-progress` still wants that column, and no amount of inference can produce it.
- **The status field**, when a bundle spells it something other than `status`.
- **The lane field**, or none.
- **The filter**, in `--where` syntax — the same expression the CLI takes, parsed by `index.ParseFilter` rather than by anything written here.

## The distinction the UI has to show

A board is inference plus config, and which is which matters. A column that appeared because an entry has that status behaves differently from one someone pinned: renaming a status in the entries makes the first vanish and leaves the second empty. Showing them identically makes the config feel haunted.

So: inferred columns render as present-but-unpinned, with pinning as an explicit act.

**Config orders and adds; it never filters.** A status present in the entries but absent from `columns` still gets a column. Hiding cards through the column list would make config a filter by accident, and filtering is `where`'s job where it is visible.

## Writing it

Shares the narrow TOML appender from [choosing boards](./002-choosing-boards.md) — the one place a second config implementation is unavoidable, since the engine reads `[tool.*]` and deliberately never writes it. Updating an existing `[[tool.wikiview.board]]` table is harder than appending one, and the same rule applies: change the keys in question and leave every other byte of `wiki.toml` alone, the way the engine's own frontmatter writer does.

That constraint is worth taking seriously here. `wiki.toml` may hold comments, other tools' tables, and formatting the user chose. A parse-and-reserialize would quietly discard all of it.

## Open

Whether per-user preferences (a collapsed column, a temporary filter) belong in the same place as bundle config. They probably do not: config travels with the repo and is shared, while "I collapsed this column" is mine and belongs with the [per-bundle UI state](../3-reader/002-per-bundle-ui-state.md). Deciding that before the first setting is written matters, because moving it later means migrating someone's stored state.

**Acceptance:** a board's columns can be reordered and pinned, its lane and filter set, from the board; changes land in `wiki.toml` without disturbing comments, other tables, or formatting; inferred and pinned columns are visibly different; an invalid filter is reported rather than silently dropped.
