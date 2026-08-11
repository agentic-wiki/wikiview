---
type: task
title: "a grid that stays smooth on a large table"
status: archived
priority: low
tags: [feature, reader, datasets]
blockers: [/3-reader/006-tables-and-grid.md]
---

Rendering only the rows on screen, so a table of thousands scrolls rather than stutters. Recorded against the day it is needed, and not built before then.

## Why it waits

Virtualization is not a layer you add afterwards; it decides how rows are measured, how the header stays put, how sorting reflows, and what "select this row" means. Building it now would shape the whole grid around a size no bundle here has.

It also argues with the browser: find-in-page stops working, because the text is not in the document. That is a real loss in a reader, and worth paying only against a real problem.

## What would change the answer

A grid that visibly stutters on a table someone actually keeps. Measure before deciding — the first suspect in a slow grid is re-sorting or re-totalling on every keystroke, which is a cheaper fix in a smaller place.

Worth saying out loud when it happens: a markdown table large enough to need this may be a dataset that wants to be many entries, or a file the bundle should link to rather than contain.
