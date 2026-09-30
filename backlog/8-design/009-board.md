---
type: task
title: "the board, redrawn"
status: todo
priority: high
tags: [design, ui, boards, api]
blockers: [/8-design/006-rail-and-panel.md]
---

Mock lines 339–398. Every behaviour of `BoardView` stays: pointer-event drags with the ghost, lane bands as drop targets, column-header drag to pin order, condensed empty lanes until a drag starts, optimistic moves, the empty-board form, print as stacked sections. The mock's HTML5 drag-and-drop is not adopted.

## Header

`14px 20px`, `line` hairline: the name (18px 600 `-0.02em`), `path · N cards` in mono; spacer; a **Filter cards or tags** input (200px, `panel-2`, magnifier); a **Lanes / Flat** segmented control (only on a board with a lane field); a **Settings** button with the sliders glyph.

- **Filter** is client-side, case-insensitive, over the card's label, title and tags; kept in the URL query (`?q=`) so it survives the sheet opening and a reload. Counts and progress bars follow the filter.
- **Flat** hides the lane bands without touching config, per board, in `useBundleState`.

## Columns

316px, `panel-2`, `line` border, 14px radius, max-height the board, 14px gap, padding `18px 20px 24px`. Header: a 9px dot in the column's colour ([003](./003-colour.md)) with a 3px halo, the label (13.5px 600, separators as spaces), the count in mono, and a 44×4px progress bar — the column's share of all cards on the board. The pinned mark stays, as a faint tooltip'd dot after the label. Drag-over: `accent` border.

## Lanes

A 10px-radius band, 4px padding, 6px gap. Header: the three-bar glyph lit by position, the lane name in 10.5px 600 `.09em` caps `faint`, the count in mono. Drop-over: `accent-bg` fill and a 1.5px dashed `accent` outline. An empty band while dragging: a 38px dashed "Drop here".

## Cards

`elev`, `line` border (`line-2` and −1px lift on hover), 10px radius, `11px 12px 10px`:

- the title, 500 13.5px, line-height 1.35 — the entry's title when it has one, else the label;
- the label under it in `muted` 12.5px, clamped to two lines, when it differs (the mock's description slot);
- **Waiting on**: `danger` 11.5px, the barred-circle glyph, "Waiting on <first blocker's title>", ellipsized, and "+N" when there are more — only while a blocker is not done;
- a footer: tag chips (20px, `panel-2`, a 6px dot in the tag's colour), capped at 3 with "+N"; spacer; the link glyph and count in mono. The "holding up N" badge stays in the footer.

The dragged card stays in place at 35% opacity; the ghost is the card in `elev` with the shadow and `accent` border. The card open in the peek has a 1.5px `accent` ring.

## Server

`Card` gains `blocker` (the first unfinished blocker's title) and `links` (as on a stub).

**Tests:** the filter over label, title and tags, in the URL, counts following it; Flat persisted and hiding bands; column colours from the gradient with `archived` gray; the waiting-on line only for unfinished blockers, with "+N"; progress bar share. Every existing drag test still passes.
