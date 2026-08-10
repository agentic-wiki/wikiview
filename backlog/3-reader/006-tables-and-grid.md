---
type: task
title: "tables become a grid you can aggregate"
status: todo
priority: medium
tags: [feature, reader, datasets]
blockers: [/3-reader/005-markdown-and-checkboxes.md]
---

An entry holding a markdown table is a dataset in the format's terms: uniform records you aggregate, stored as one table rather than one file each. Reading it as prose wastes it.

So a table renders as a table, and gains a grid affordance: sort by column, filter, and a footer per column that can **sum, average, count, min, max** — gently in the direction of a Notion grid, without becoming a spreadsheet.

## Rules

**The stored cells are never rewritten.** Sorting and aggregation are presentation over the rendered values; the file keeps its rows in the order they were written. Formatting is presentation and the raw value is the data — which is also why the format tells authors to store cells machine-readable, so no cleanup pass is needed before summing them.

**An entry may hold several tables**, and each renders independently. The engine's `table` command already extracts them by index, and `parse.Tables` is exported, so the boundaries are not something to re-derive.

**Types are inferred per column, not declared.** A column whose cells all parse as numbers gets numeric aggregations; one that does not gets count only. Inference is a display decision and never written back.

## Open

Whether a `type: dataset` entry — one that is *mostly* a table — should open full-width in grid mode rather than as prose with a grid inside it. Probably yes, decided when there is one to look at.

**Acceptance:** a table in any entry renders as a sortable grid with per-column aggregation; several tables in one entry work independently; nothing about sorting or aggregating changes the file.
