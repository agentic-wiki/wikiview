---
type: task
title: "the tree's two marks do not line up"
status: done
priority: low
tags: [bug, reader, ui]
blockers: [/3-reader/008-unseen-changes.md, /3-reader/017-changed-and-queued.md]
---

A tree row can carry two marks: a filled dot for changed-since-you-looked, and a bookmark for saved-to-read-later. Down a column of rows they do not align. A row showing only the dot sits its dot a few pixels further right than a row showing the bookmark, so the marks zigzag instead of forming a clean edge.

## Why

Both marks are pushed right with `ml-auto` and both are `shrink-0`, so their right edges land at the same place, against the row's right padding. But the two glyphs fill their boxes differently: the dot is a 6px circle painted to the edge of its box, and the bookmark is a 12px SVG whose path stops short of its own box on the right. Flush-right by box, their *painted* right edges differ, and the eye aligns paint, not boxes. On a row carrying both, the dot sits after the bookmark and its gap, further right again.

So there is no column for the marks to share: each is laid out against the row edge on its own terms.

## The fix, in shape

Give the marks a shared, fixed geometry rather than each finding the edge itself. A mark region of a known width, right-aligned once, with the dot and the bookmark each occupying a fixed slot inside it, so a dot alone lands where a dot beside a bookmark lands, and a bookmark alone lands where a bookmark beside a dot lands. Two slots, always in the same order and the same place, present or empty.

That also answers the question this raises: an entry that is both changed and saved shows both marks, bookmark then dot, in those two slots. The code already renders both (`Tree.tsx`); what is missing is that the slots are not fixed, so "both" and "one" do not share an edge. Fixing the alignment and settling the both-marks layout are the same change.

## Watch for

- **The folder dot.** A shut folder shows a single dot when something inside changed. It uses the same `ml-auto` placement, so it should sit in the same mark column as an entry's dot, or folders and their children misalign for a different reason than this one.
- **Row height and the baseline.** The marks sit on rows of text; a fixed mark region must not change a row's height or knock the label off its baseline.
- **Not inventing a third mark.** This is alignment and co-occurrence of the two that exist. Any new state (a folder that contains a saved entry, say) is a separate question and not to be smuggled in here.

**Acceptance:** down a tree with a mix of changed rows, saved rows, both-marked rows and folder dots, the marks form a single right-aligned column that does not shift with which marks a row carries; an entry that is both changed and saved shows both, in a stable order; and no row's height or label baseline moves to achieve it.

## What building it settled

One `Marks` component, two fixed-width slots, bookmark then dot, each glyph centred in its slot rather than shoved against the row edge. An empty slot keeps its width, so a dot-only row lands its dot in the same column as a both-marked row, and a folder dot (a folder never carries a bookmark) lands in that same column with an empty bookmark slot beside it. The zigzag was the two glyphs filling their boxes differently while both sat flush-right; centring each in its own slot removed the edge they were fighting over.

The both-marks case was already rendered before this; what was missing was the shared column, so fixing the alignment and settling the co-occurrence were the one change the task said they were.
