---
type: task
title: "the board: columns, lanes, cards, drag"
status: todo
priority: medium
tags: [feature, boards]
blockers: [/3-reader/005-markdown-and-checkboxes.md]
---

A kanban over one folder: `/kanban/<folder>`. A view onto the same index as everything else, not a second application.

## Shape

Columns come from the entries in that folder, not from the bundle's whole vocabulary. Inferring the status vocabulary bundle-wide was a real bug in the first attempt: a backlog folder that also held notes showed a column per foreign status (`published`, `retired`). `--where` on the vocabulary commands exists upstream now, but deriving from the board's own filtered entries is both more accurate and one fewer question to ask.

`[[tool.wikiview.board]]` config pins order and declares columns that are empty — which inference alone can never do — and names a `lane` field. All of it optional.

**No card may be invisible.** A status present in the entries but absent from `columns` gets a column appended; entries with no status key get one too, shown only when non-empty. Config orders and adds; it never filters. Filtering is `where`'s job, where it is explicit.

## Taken from the first attempt, deliberately

Two details that were solved properly there and should not be rediscovered:

- **Drag on Pointer Events**, not HTML5 drag-and-drop. Touch works at all, and drag state is not tied to an element React unmounts mid-move.
- **Suppress the synthesized click after a drag**, or finishing a drag also opens the card.

## Moving a card

Dropping a card in another column sets its `status` through the engine's `SetField`. Same staleness rule as checkboxes: the client's version goes with the request and a moved version refuses the write rather than applying it to an entry that has changed underneath.

## Following a link

- To an entry **on the board you are viewing** → open that card, keeping the board's context.
- To **anything else** → leave the board and navigate the reader to it.

That is what makes the "off-board link" problem disappear rather than needing decoration: a link out of the board's slice is reachable, so it is either a normal link or genuinely unwritten.

**Acceptance:** a folder boards by URL whether declared or not; columns come from its own entries with config pinning order and empties; dragging a card writes its status; a stale drag is refused; touch drag works; a link off the board navigates the reader.
