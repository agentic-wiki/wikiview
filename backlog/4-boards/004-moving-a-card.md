---
type: task
title: "drag a card into another column"
status: done
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

## Done

`PUT /api/card/{id}/{path...}` takes a column *value*, never a field name. Which frontmatter key a column stands for is the board's `status`, and the board is decoded on the server, so a client naming the key would be a second copy of that rule — and an API that writes any key on any entry, which is a frontmatter editor rather than a reader. For the same reason the write only touches entries the board actually holds: outside its slice, the board's field was never the right one to write.

Refusals are all on the server, and each says which rule it is: `409` for a version that has moved, `422` for a drop on the column of entries with no status, `404` for a card the board does not hold.

`useDrag` in the UI is the gesture and nothing else. A drop target is any element carrying `data-drop`, found under the pointer with `elementFromPoint` rather than by measuring, so a column registers nothing and a scrolled board needs no recomputing. The column with no status carries no `data-drop`, which is how "it takes no drops" is expressed rather than as a check somewhere.

Two things a drag has to get right, both of them from `wikanban`:

- **Pointer events**, so touch works and the gesture survives React unmounting the card mid-move. Cards are `touch-none`, or the browser scrolls the column instead and there is no way to move a card by touch at all.
- **The click is suppressed after a drag.** The browser synthesizes one from the press and the release however far the pointer travelled between them, so without this, finishing a drag also opens the card. A 5px threshold keeps the opposite true: a press that barely moves is still a click, because a card that needs a steady hand to open is broken.

Whether the drag has started lives in a ref beside the state. The handler that ends a drag would otherwise ask a render that has not happened: a move and the release right after it are one batch, and the release would read the drag as never having begun.

**Not here:** moving a card without a pointer. Drag is the only way to change a status from the board, so there is nothing for a keyboard. The card sheet is where that belongs — it already shows the frontmatter — and it is a field editor rather than a gesture, so it is [customizing a board](./003-customizing-a-board.md)'s neighbour rather than this.
