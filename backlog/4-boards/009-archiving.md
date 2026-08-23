---
type: task
title: "archiving done cards"
status: todo
priority: low
tags: [feature, boards, write]
blockers: []
---

The last column of a board is usually `done`, and a done column only grows — every finished task stays, and the column becomes a graveyard the board has to keep rendering. This task is to give a done column a way to clear itself: an affordance to move finished cards out of the board's way, and a question of whether that clearing is one act on the whole column or a per-card choice.

## The two shapes

**A column-level archive.** A button on the last column that moves every card in it to `archived` — the status that sits alongside `todo`, `in-progress` and `done` for work that was thought through and deliberately not queued. One act, the whole column clears, and the board gets its end back. The risk is breadth: one click moves every card, and a column that is mostly done but has one live card in it loses them all.

**A per-card archive.** The same move, but offered on hover for each individual card in the column — a tick, a small button, something that says "send this one away" without touching its neighbours. Slower, but precise: the user decides card by card, and a done column thins out at the pace of its contents rather than all at once.

The instinct is not sure which, and that is the point of the task: pick the shape, or find the one where the column offers the bulk act and each card offers the single one.