---
type: task
title: "drag a card into another column"
status: todo
priority: medium
tags: [feature, boards, write]
blockers: [/4-boards/001-board-view.md]
---

Dropping a card in another column sets its `status` through the engine's `SetField`. The second thing in this reader that writes, after a checkbox, and it follows the same rules for the same reasons.

## The write

Same staleness guard as a checkbox: the version the board was read at travels with the request, and a version that has moved refuses the write rather than applying it to an entry that changed underneath. A refused move puts the card back where it came from and refetches, rather than leaving the screen claiming something the file does not say.

The field written is whatever the board's `status` names, which is already decoded, so a board over a folder that calls it `stage` writes `stage`.

Optimistic on screen, confirmed by the refetch the version bump triggers. A card that snaps back is telling you the truth arrived.

## Two details worth taking from `wikanban`

Solved properly there, and not worth rediscovering:

- **Drag on Pointer Events**, not HTML5 drag-and-drop. Touch works at all, and the drag state is not tied to an element React may unmount mid-move.
- **Suppress the synthesized click after a drag**, or finishing a drag also opens the card.

## What it must not do

**Reorder within a column.** Position in a column would have to be stored somewhere, and the only honest places are a frontmatter field nobody asked for or a file rename. Cards sit in the order the folder gives them, which is the order the filenames already encode.

**Move a card into a column it invented.** Dropping onto the column for entries with no status would mean *removing* the field, which is a different operation wearing the same gesture.

**Acceptance:** dragging a card to another column writes that field and the card stays put; a stale board refuses the move and restores the card; the write works by touch; finishing a drag does not also open the card; nothing reorders within a column.
