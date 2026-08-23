---
type: task
title: "hover a card to see what it blocks and what blocks it"
status: todo
priority: medium
tags: [feature, boards]
blockers: []
---

A task's `blockers` field names the entries that hold it up, and the board already reads that field — but the only place it surfaces is inside the entry, where you have to open the card to see it. The graph is already on the board in every card's metadata, and this task is to make it visible without leaving the board: hover a card, and a floating list shows what is blocking it and what it is blocking in turn.

## What the hover shows

**Two directions, one list.** Hovering a card lists, first, the entries that block it (its own `blockers`), and then the entries that block on it (the reverse — the ones whose `blockers` name this card). The reverse is computed, not stored: the field is written one way, and "what am I holding up" is just the field read from the other side.

**A floating list, anchored to the card.** The list appears beside the hovered card and follows it, and each entry in it is a link — click one and the board jumps to that card. It is a tooltip that is also a map, not a dead-end label.

## Why it matters

"Is this stuck, and on what" is the first question a board is for, and today it is one click deep in every card. The blockers are already on the board in the data; the hover is just the surface that brings them forward, so the shape of the dependency — what waits on what — reads off the board at a glance instead of being opened card by card.