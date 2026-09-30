---
type: task
title: "Recently changed and Read later, redrawn"
status: done
priority: medium
tags: [design, ui, reader]
blockers: [/8-design/008-folder.md]
---

Mock lines 438–473. The behaviour stays as it is: Changed rows leave when opened or dismissed, Read later reorders by pointer and by arrow keys.

Both pages use a 760px column with the entry padding, a 32px `-0.03em` title, and a `muted` sentence under it (the existing wording is kept).

## Recently changed

Styled as the mock's *Recent*:

- Rows are 10px-radius with a `fg/5` hover. Each row has the group dot, the title (500), the path in mono `faint` under it, and the entry's age on the right, taken from `updated` ([007](./007-entry.md)).
- The per-row **mark seen** tick stays, as an icon button that only appears on hover and focus.
- **Mark all N as seen** sits at the top right, as a quiet button.
- The empty state is a dashed box: "Nothing has changed since you were last here."

## Read later

- Rows become cards: `panel`, `line` border, 12px radius. Each has the grip (the existing `Handle`, now with the mock's six-dot glyph), the group dot, the title with its folder under it in `muted`, and a **Done** button (check glyph and word) that turns `ok` on hover.
- The drop position shows as the mock's 3px `accent` line above the target row. The ghost uses the new shadow.
- An entry that has gone away keeps its row and keeps saying "Entry not found in this bundle".
- The empty state is a dashed box: "Nothing saved. Use the bookmark on any entry."

**Tests:** the existing list tests keep passing against the new markup. New tests cover age shown per row, the hover-revealed action still reachable by keyboard, and both empty states.

## What building it settled

- **A changed row names its folder, not its path.** The reference shows a raw mono path under the title, but this list already decided, and pins by test, that a row names where an entry lives "the way the tree names it". There was no reason to undo that, so the second line is the readable folder in `faint`.
- **The per-row "mark seen" tick is hidden by opacity, never removed**, and shown on hover and on keyboard focus, so it stays reachable without a mouse.
- **No empty state says the same thing twice.** The sentence under the heading says what the page is for, and the dashed box says there is nothing in it.
- **`listing.tsx` is gone.** `Row`, `FileIcon` and `FolderIcon` have no users left. `count` moved to `ui/src/count.ts`, and `GraphView`'s private copy of it went with the move.
- **The drop line** is the reference's `0 -3px 0 -1px accent` shadow on the row a drop would land before, and the dragged row stays in place, dimmed.
- **The handle** keeps its arrow-key reordering. Only its glyph and size follow the reference.

## Revised after use (2026-09-30)

- **The whole row drags**, as in the reference and as a board card does. A press that does not move is still a click, so the title link and "Done" keep working, and the link is `draggable={false}` so the browser's own link-drag cannot start instead. The ghost is the full row at its own width. The grip stays, easier to see (`muted`, not `faint`), as the cue and as the keyboard's arrow-key reordering. With one saved entry there is still nothing to reorder, so no grip, which is why the user found no handle at all.
