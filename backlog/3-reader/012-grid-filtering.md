---
type: task
title: "narrow a grid to the rows you mean"
status: archived
priority: low
tags: [feature, reader, datasets]
blockers: [/3-reader/011-grid-aggregates.md]
---

One box above the grid. Type, and rows whose cells do not contain what you typed go away. Case-insensitive, matching any cell in the row.

## Deliberately one box

Per-column criteria is where this stops being a reader and starts being a query builder: an operator per type, a way to combine them, a way to see what is currently applied, and a way to clear one of five. That is a lot of surface for something the engine already does better from a terminal, where `wiki list --where` is the real query language and the palette can hand you the command.

So: one box, and widen it only if the absence is actually felt rather than merely imaginable.

## The two decisions that make it useful

**Totals follow the filter.** Filtering to one region and reading last quarter's total for the whole table would be wrong in the most expensive possible way. The [aggregates](./011-grid-aggregates.md) recompute over the visible rows.

**Say how much is hidden.** "38 of 412 rows" beside the box, so a filter you forgot you typed cannot masquerade as a small dataset.

CSV export follows the same rule for the same reason: it is what you are looking at.

**Acceptance:** typing narrows the rows; totals and the row count reflect what is left; the export matches the screen; clearing the box restores everything; the file is unchanged.
