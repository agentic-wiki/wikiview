---
type: task
title: "reorder the read-later list by dragging"
status: done
priority: low
tags: [feature, reader, ui]
blockers: [/3-reader/017-changed-and-queued.md]
---

Read-later is ordered by when things went in, which is the only order the queue itself knows. But what you saved first is not always what you want to read first, and there is no way to say so.

A pair of up/down arrows per row would do it and reads as clutter: two controls on every row, each moving an item one step, so getting something from the bottom to the top is a row of clicks. A drag handle and drop is the direct expression of "put this there," and it is the mechanism boards already use here, so it is not a new interaction to learn or a new one to build.

## Use what boards use

`useDrag` (`ui/src/views/drag.ts`) already does pointer-based drag with a touch hold, an autoscroll near the edges, and a drop target model. Column reordering on a board is a list reorder driven by it (`reorder` in `BoardView.tsx`), which is this same problem in a horizontal list. This should be that, vertically, not a second drag implementation.

If `useDrag` turns out to assume things a vertical list in a scrolling page does not want, the fix is to generalise it, not to fork it: one drag mechanism in this app is worth keeping.

## What reordering writes

The queue is a list of paths in `localStorage` (`useQueue`). Reordering is reassigning that array and persisting it, which `useQueue` already does for add and remove. So the model gains one operation, `move(from, to)` or a reorder that takes the new array, and nothing else changes.

## What to decide

- **The handle, or the whole row.** A dedicated handle keeps the row clickable as a link and the drag unambiguous; making the whole row draggable means a press-and-move competes with a press-to-open, which is the tap-versus-drag ambiguity boards already had to solve with a hold. A handle is the calmer answer for a list whose rows are primarily links.
- **Keyboard.** Drag is pointer-only, and a reorder that only exists for a mouse is a reorder some people cannot do. What the keyboard equivalent is (the arrows this task is avoiding as the *visible* mechanism might be the right *keyboard* one) is worth settling rather than shipping a pointer-only answer and calling it done.
- **The empty and single-item cases.** Nothing to reorder with zero or one row, so the handle should not appear then, or it is an affordance that does nothing.

## Not this task

Ordering read-later by anything computed, recency, folder, whether it changed since you saved it. Those are sorts, and a sort fights a manual order: the moment you can drag a row, an automatic order is the thing undoing your drag. Manual order is the feature; if a sort is ever wanted it replaces this rather than joining it.

**Acceptance:** a row on the read-later page can be dragged to a new position and the list keeps that order across a reload; the reorder uses the app's existing drag mechanism rather than a second one; a row stays openable as a link; and there is an accessible way to reorder that does not require a pointer.

## What building it settled

`useDrag` took the vertical list without a fork. Each row carries `data-drop`, the handle spreads `handlers(path)`, and the drop reorders through `reordered`, which was a local helper in `BoardView` and is now exported from `drag.ts` so the board's columns and this list share one meaning of "drop lands before." A drag ghost follows the pointer, as on the board.

The keyboard turned out to be the same arrows the task rejected as a *visible* mechanism, living on the handle: focus it, press up or down, the row moves one place and focus stays with it because the row's key is its path. So drag and keyboard are one control, not two.

`useQueue` gained `reorder`, which only permutes what is stored: a new order that names a path the queue lacks, or omits one it has, is refused rather than applied. "Set the order" cannot become a back door for adding or losing entries.

Left as a known edge, not fixed: `useDrag`'s autoscroll is horizontal, for the board. A read-later list longer than the viewport cannot be dragged to a position off-screen. The keyboard reaches every position, and the list is rarely that long, so a vertical autoscroll is a later change if it is ever wanted rather than a gap to paper over now.
