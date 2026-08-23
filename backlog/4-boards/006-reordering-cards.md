---
type: task
title: "reordering cards within a column"
status: todo
priority: medium
tags: [feature, boards, write]
blockers: []
---

A column is a queue, and a queue has an order that matters — the top card is the next one to be picked up. Today the order is whatever the index hands back, and there is no way to say "this one goes before that one". This task is to let a card be reordered within its column by drag, and to figure out how that order is stored without the renumbering tearing the bundle apart under the agents that also write it.

## The hard part: where the order lives

**The filename is the identity, and the number in it is the order.** A task is `004-moving-a-card.md`, and the leading number is what sorts it. Reordering means changing a number, and changing a number means renaming the file. That is the whole difficulty: the thing that is easy to display (a file) is the thing that is expensive to reorder (its name), because the name is load-bearing — links, the index, and any agent mid-edit all point at it.

**Renumbering is a rename, and a rename is a conflict.** Two writers reordering the same column at once will both try to rename the same files in different orders, and the second one's rename lands on a path the first one already moved. This is not a corner case; it is what happens the moment two agents work the same backlog.

## The direction to think in

**Maybe the number does not have to be the whole story.** The instinct here is that a card can carry its number *and* its context — the title, the folder, the lane — so that an agent resolving a collision can tell which task is which even if the number it expected is gone. If identity is "number plus context" rather than "number alone", a renumbered card is still recognizable, and a conflict becomes "these two disagree about order" rather than "this file vanished".

**Order as data, not as names, is the alternative.** Store the order in a field (a `sort` key, a position) rather than in the filename, and let the filename keep its number as a stable id that never moves. The column then sorts by the field, and reordering writes a field instead of renaming a file — cheap, and the identity never changes. The cost is a second source of truth and a question of who reconciles the two.

This is the one to sit with before building: the answer changes whether we are writing a field or renaming files, and those are very different features.