---
type: task
title: "totals under the columns"
status: todo
priority: medium
tags: [feature, reader, datasets]
blockers: [/3-reader/006-tables-and-grid.md]
---

A column of numbers you cannot total is a column of numbers you have to copy somewhere else. A footer cell per column, showing one of **sum, average, median, min, max, count**, is most of why a grid beats a table.

## Types are inferred, never declared

A column whose cells all parse as numbers offers the numeric functions. One that does not offers count. Nothing is written back to the file, and no frontmatter declares a schema: inference is a display decision, and a column that stops being numeric because somebody typed "n/a" in one cell should quietly stop offering to average itself.

Worth deciding when there is a real dataset to look at: whether a blank cell is zero or is skipped. Skipped is almost certainly right for average and median, and the difference is invisible until it is wrong, so the footer should say which columns it ignored rather than leaving you to wonder.

## The choice is remembered, per bundle

Which function a column shows is a view preference, so it lives in [per-bundle UI state](./002-per-bundle-ui-state.md) keyed by the entry and the column. Reopening a dataset you total every week should not mean choosing "sum" every week.

Nothing about it belongs in the file. A total is derived, and writing one into the markdown would make it a number that goes stale silently.

**Acceptance:** a numeric column offers the numeric functions and a text column offers count; the choice survives a reload and does not leak to another bundle; the footer says when cells were skipped; the file is unchanged.
