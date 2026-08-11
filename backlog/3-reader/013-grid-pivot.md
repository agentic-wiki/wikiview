---
type: task
title: "a pivot over a grid"
status: archived
priority: low
tags: [feature, reader, datasets]
blockers: [/3-reader/011-grid-aggregates.md]
---

Group rows by one column, spread another across the top, total a third in the middle. Recorded so it stops being an open question rather than because it is next.

## Why it is parked

It is not a feature on top of the grid, it is a second product inside it: fields need roles rather than positions, roles need somewhere to drag them, the aggregation becomes two-dimensional, and every empty intersection needs an answer. The grid's whole shape would be built around it.

And the datasets this reader actually serves are small. Forty rows of tasks pivot into a table you could have read directly. The case for it starts at a size where a markdown table is already the wrong store, which is the same size at which [virtualization](./014-grid-large-tables.md) starts to matter.

## What would change the answer

Someone keeping a genuinely tabular dataset in a bundle — expenses, measurements, a log — reaching for a spreadsheet to answer a question they were one grouping away from. That is a real signal. Wanting it in the abstract is not.

If it is built, it groups what the grid is currently showing, so a filter and a pivot compose rather than arguing.
