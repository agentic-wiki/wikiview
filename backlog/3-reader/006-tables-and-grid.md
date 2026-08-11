---
type: task
title: "a table you can sort and total"
status: todo
priority: medium
tags: [feature, reader, datasets]
blockers: [/3-reader/005-markdown-and-checkboxes.md]
---

Tables already render, with a scrollbar when they are wide. What is missing is sorting a column and totalling one, on a dataset small enough to read.

## In place, not as a view

`table` is a component in the render map like `a` and `img`, so a header can sort and a footer can total exactly where the table already sits. No route, no overlay, no URL state, and the question "which table" never comes up because you never left the entry.

The alternative — opening a table as its own full-width view, addressed by a URL — drags a picker, a route or an overlay, and a decision about which table a URL names, all for a sort handler and a footer row. It answers one real problem, a wide table cramped inside an article column, and horizontal scroll already answers that adequately. If it stops being enough, widening the article beats navigating away from it.

Nothing decides this by `type`, either. A `dataset` entry holds prose as well as its table and a `note` can hold the biggest table in the bundle, so the type predicts nothing. Every table gets the same treatment because every table is a table.

## The cells come from the render, not from the server

The engine has `parse.Tables`, and `wiki table` is right to use it. This does not.

The client already parses the table, because remark has to in order to draw it. Taking the server's parse as well would not remove a parser; it would add a *reconciliation*: two implementations agreeing on what counts as a table and how cells split, then the server's table N matched to the rendered table N. They disagree at the edges — a table inside a blockquote, a `|` inside a code span — and the failure is a grid showing different numbers than the page above it.

The one-implementation rule exists for rules whose disagreement is invisible, like heading ids, where `check` calls an anchor valid and the page silently fails to scroll. A table's cells are on screen. Totalling exactly what is displayed is self-consistent, needs no matching step, and is the only version that can also reflect a sort or a filter the server knows nothing about.

## What it does

- **Sort by column**, ascending and descending, by clicking the header. A numeric column sorts numerically, which needs the same per-column type inference [the totals](./011-grid-aggregates.md) use, so the two are worth building together.
- **Sorting is not remembered.** It is a question you asked of a table while looking at it, not a preference about the entry. Leaving the entry and coming back gives you the file's order, which is the order the author chose.
- **The file is never rewritten.** The rows stay as written. The format already asks authors to store cells machine-readable, so there is nothing to clean up before totalling them.

Not in this task: opening a table full-width, exporting it, and filtering it. Each is worth having only once sorting and totalling prove the table is where you actually work, and each is cheap to add afterwards.

**Acceptance:** clicking a column header sorts that table, and clicking again reverses it; a numeric column orders by value rather than by text; several tables in one entry sort independently; navigating away and back restores the file's order; nothing about sorting changes the file.
