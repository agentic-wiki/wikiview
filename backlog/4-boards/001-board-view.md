---
type: task
title: "the board: columns, lanes, cards"
status: todo
priority: medium
tags: [feature, boards]
blockers: [/1-design/002-backlogs-config.md]
---

A kanban over one folder: `/kanban/<folder>`. A view onto the same index as everything else, not a second application.

Read-only. Seeing a backlog as columns is worth having on its own, and [moving a card](./004-moving-a-card.md) is a write with its own staleness rules that should not be entangled with getting the layout right.

## Columns come from the folder, not the bundle

A bundle-wide status vocabulary gives a backlog folder that also holds notes a column per foreign status (`published`, `retired`). Deriving from the board's own filtered entries is more accurate and asks one fewer question.

`[[tool.wikiview.board]]` pins the order and declares columns that are still empty, which inference alone can never do.

**No card may be invisible.** A status present in the entries but absent from `columns` gets a column appended after the declared ones; entries with no status key at all get a column too, shown only when it has something in it. Config orders and adds, never filters — filtering is `where`'s job, where it is explicit and visible.

## Lanes are off unless asked for

One lane by default, which is to say no lanes at all: a board is columns of cards. A `lane` field in the config groups the rows within each column by that field's value, and nothing does so without being told.

The same visibility rule applies. A card whose lane field is missing belongs to a lane of its own rather than disappearing into the first one.

## Where the board comes from

`GET /api/board/{path...}`, returning the columns with their cards.

Not assembled in the client from the tree, which carries a title and a type but no arbitrary frontmatter — the client would have to fetch every entry to learn its status. And not the entry API in a loop: the board is one question ("how does this folder stack up") and deserves one answer.

It also puts the rules where the config is already parsed. `where` is applied with the filters `index.ParseFilter` produced, the status field is whatever `status` names, and the column order is the config's with the leftovers appended. A client re-deriving any of that is a second implementation of a rule with one home.

## Following a link

- To an entry **on the board you are viewing** → open that card, keeping the board's context.
- To **anything else** → leave the board and navigate the reader to it.

That is what makes the "off-board link" problem disappear rather than needing decoration: a link out of the board's slice is reachable, so it is either a normal link or genuinely unwritten.

**Acceptance:** a folder boards by URL whether it is declared in config or not; columns come from that folder's own entries, in the config's order when there is one, with undeclared statuses appended and no card hidden; a declared lane groups rows and no lane means one board of columns; a link off the board navigates the reader.
