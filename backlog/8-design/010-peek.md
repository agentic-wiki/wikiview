---
type: task
title: "the peek: a side panel for a card or a node"
status: done
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

## What building it settled

- **It stays `CardSheet`.** The code, the print rules (`data-print="sheet"`) and `sheetHref` already call it a sheet. "Peek" is the reference's word for the same thing, and one name is enough.
- **Anchored below the view's header, not at the view's top.** The reference floats it from the top of the view, where it covers the board's filter, Lanes/Flat and Settings. You could not narrow the board while reading a card. It now floats over the columns area (and the graph's canvas), found by screenshot.
- **One way a card moves.** `move(card, column, lane)` serves the drop and the sheet's Status/Lane choices alike. It writes nothing when nothing changes: the same column, and a lane that is the card's own or unnamed. The old drop handler would write a no-op when dropped outside a band in the same column.
- **A card with no status cannot change lane from its sheet**: `moveCard` needs a column to keep, and writing a status of nothing is the operation the unnamed column refuses. It waits until the card has a status.
- **The property grid takes caller rows** (`properties` on `EntryView`): drawn first, in place of those keys' plain values, and shown even when the entry lacks the key, since choosing one is how it gets it.
- **Escape is a stack** (`ui/escape.ts`, `useEscape`). Palette, settings, the git popover and the sheet each register while open, and a press goes to the top one only. Before, each listened on `window`, so the palette opened over a card closed both.
- **Outside presses close it** only on the view itself: not on a link (another card opens instead), a control, the panels, a dialog, or an `svg` (a graph's canvas is panned by pressing).
- **Back history is the sheet's own**, reset when it closes, so the browser's back still leaves the view as before.
- **Kind** in the header is the entry's own `type` from the tree ("Task", "Note"…), "entry" when it has none.
- **Print**: on paper the sheet is full width (`width: auto`); its header and footer are controls and hide.

## Revised after use (2026-09-30)

- **Resizable from its left edge.** The handle is a `separator` you can drag, move with the arrow keys (24px a step) when focused, or double-click to reset. It defaults to 480px (from 440), has a floor of 360px, can be no wider than the view it floats over, and the width is kept per bundle (`sheet:width`). The width travels as a custom property (`--sheet`) read by the class, which is also what the test DOM can parse. There is no handle on a narrow screen, where the sheet is full width.
- **No path above the title.** The header's group chip and "Open as page" already say where the entry lives, so the body opens on the title.
- **A click on a graph's empty canvas closes it**, as a click on an empty board does. Pressing the canvas is also how you pan, so the sheet's own outside-press rule still leaves the `svg` alone. The graph closes it instead, on a press that moved less than 4px (a node drag's threshold) and was not on a node. Found by the user: the sheet stayed open whatever you clicked.
- **A graph's sheet folds its properties**, as the page does: one line, floating on hover, pinned by a click, and the same remembered choice (`reader:properties`). A board's sheet keeps the grid open, since its Status and Lane controls are what the sheet is for. The rule is "folds unless the view put its own rows in it".
- **Every sheet folds its properties**, a board's included. This replaces the two notes above ("stays open" and "a graph's sheet folds"), so the hand learns one behaviour for every panel. On a board, status and lane lead the folded line, taken from the view (`Property.value`), which is ahead of the file during an optimistic move and is the card's lane even when the file does not say it. The Status and Lane buttons are in the grid and work while it floats, without pinning it. Moving a card is mostly done by dragging on the board, so they are one rest away rather than always showing.
- **"Open full page"**, outlined, in the footer, and the same words on the header's icon. Nothing in a panel is its main action, so nothing wears the accent. "Reader" is not a word the UI uses.
