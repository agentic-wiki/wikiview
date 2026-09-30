---
type: task
title: "the peek: a side panel for a card or a node"
status: todo
priority: high
tags: [design, ui, boards, graphs]
blockers: [/8-design/007-entry.md, /8-design/009-board.md]
---

Mock lines 476–541. Replaces the centred `CardSheet` dialog for boards and graphs. The address is unchanged — `/kanban/<id>/<path>`, `/graph/<id>/<path>` — so everything that already opens a card by URL keeps working.

## Frame

An overlay on the view area, not a column: `position: absolute`, 10px from the top, right and bottom, `min(440px, 100% − 20px)` wide, `elev`, 14px radius, the shadow, `wv-peek`. The board or graph stays full width underneath and is not dimmed. No backdrop on desktop, so a click outside lands on the board: clicking another card opens that card, and clicking empty board closes the peek.

(The old dialog argued a side panel takes width from the view. This one does not: it floats over the right edge and the board scrolls under it.)

## Header

`10px 10px 10px 14px`, `line` hairline: a **back** button while there is a peek history, the group chip, the kind in `faint` ("Task" for a card, "Entry" otherwise), spacer, **read later** (filled when saved), **open as page** (the expand glyph), **close**.

**History**: following a link that stays in the peek pushes onto a stack kept in the peek; back pops it. It resets when the peek closes. The stack is in-memory state, not router history, so the browser's back still leaves the board the way it does now.

## Body

Scrolls on its own, reset to the top on each new path.

1. The path in mono `faint`, and the title at 23px 600 `-0.02em`.
2. For a card, the **property grid** (`panel-2`, 12px radius):
   - **Status**: one small button per column, each with its colour dot; the current one on `elev` with a `line-2` border. Clicking writes through `api.moveCard` with the card's lane, exactly as a drop does, optimistically and with a toast.
   - **<Lane field>** (the mock's "Priority", named after the board's actual lane field): one button per lane, same shape and same write. Absent on a board without lanes.
   - **Tags**, as chips.
   - **Waiting on**, in `danger`, when a blocker is unfinished.
   - The remaining frontmatter, as the entry page's grid shows it ([007](./007-entry.md)), without the status, lane and tags repeated.
3. The **full rendered entry** — `EntryView` in a peek mode: no toolbar, no title (it is above), no TOC. Checkboxes still toggle.
4. **LINKS · N** and **LINKED FROM · N**, one column each, rows with a chevron, which open in the peek when the destination is on the view.

## Footer

The hint in `faint` ("Changes write to the card's frontmatter" for a card, "Esc to close" otherwise) and a primary **Open page**.

## Escape

One stack for the whole app, so Escape closes the topmost thing only: palette, then settings, then the git popover, then the peek, then the drawer. Today each surface listens on `window` separately, so one Escape closes all of them at once. That is fixed here with a tiny `useEscape` hook that registers into a shared stack.

## Print

A peek prints as the page, which is what the sheet does today. `data-print="sheet"` moves to the peek, and the print tests are updated.

**Tests:** opening by URL; status and lane buttons writing through `moveCard` and rolling back on failure; history back; outside click to close vs to open another card; one Escape closes one layer; a peek on a graph; printing prints the entry.
