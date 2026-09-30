---
type: task
title: "Recently changed and Read later, redrawn"
status: todo
priority: medium
tags: [design, ui, reader]
blockers: [/8-design/008-folder.md]
---

Mock lines 438–473. The behaviour stays as it is: Changed rows leave when opened or dismissed, Read later reorders by pointer and by arrow keys.

Both pages use a 760px column with the entry padding, a 32px `-0.03em` title, and a `muted` sentence under it (the existing wording is kept).

## Recently changed

Styled as the mock's *Recent*:

- Rows are 10px-radius with a `fg/5` hover. Each row has the group dot, the title (500), the path in mono `faint` under it, and the entry's age on the right, taken from `updated` ([007](./007-entry.md)).
- The per-row **mark seen** tick stays, as an icon button that only appears on hover and focus.
- **Mark all N as seen** sits at the top right, as a quiet button.
- The empty state is a dashed box: "Nothing has changed since you were last here."

## Read later

- Rows become cards: `panel`, `line` border, 12px radius. Each has the grip (the existing `Handle`, now with the mock's six-dot glyph), the group dot, the title with its folder under it in `muted`, and a **Done** button (check glyph and word) that turns `ok` on hover.
- The drop position shows as the mock's 3px `accent` line above the target row. The ghost uses the new shadow.
- An entry that has gone away keeps its row and keeps saying "Entry not found in this bundle".
- The empty state is a dashed box: "Nothing saved. Use the bookmark on any entry."

**Tests:** the existing list tests keep passing against the new markup. New tests cover age shown per row, the hover-revealed action still reachable by keyboard, and both empty states.
