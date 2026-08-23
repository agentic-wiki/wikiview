---
type: task
title: "auto-scroll the board while dragging toward its edges"
status: todo
priority: high
tags: [feature, boards, write]
blockers: []
---

Dragging a card to a lane or column near the top or bottom edge of the viewport does nothing today: the drop target is there but the board will not move it into reach, so a card cannot be assigned to a lane that is off-screen. This is the last missing piece of moving a card — the drag works, the drop works, but the board has to scroll on the user's behalf when the pointer gets close to an edge.

## What it should do

**Scroll is driven by pointer proximity, not by the card.** When the pointer (or the dragged card's edge) comes within a band of the top or bottom of the scrollable region, the board scrolls in that direction. The closer to the edge, the faster it scrolls — a ramp, not a step, so a slow nudge near the edge creeps and a hard push to the corner flies.

**Both axes.** A card can be moved to another lane within a column, or to another column entirely, so the band applies to the vertical scroll (lanes) and, where the board scrolls horizontally, to the columns. The same edge-detection handles both; the axis is just whichever one the pointer is near.

**It stops the moment the pointer leaves the band.** No momentum, no continued scroll after release — the board only moves while the pointer is in the edge zone, and it settles as soon as the pointer eases back. This keeps the drop predictable: the target that is under the pointer when the card lands is the one it lands in.

## Why it matters

A board with lanes is taller than the screen, and the whole point of a lane is to sort a card by its priority. If the top and bottom lanes are off-screen and the board refuses to scroll for the drag, those lanes are unusable from a drag — a card can only go where the pointer already reaches. Auto-scroll is what makes the full lane range reachable, and it is the difference between "I can move this card" and "I can move this card anywhere."