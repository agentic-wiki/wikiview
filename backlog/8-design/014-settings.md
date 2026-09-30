---
type: task
title: "board and graph settings, redrawn"
status: todo
priority: medium
tags: [design, ui, config]
blockers: [/8-design/009-board.md]
---

Mock lines 582–638. The fields and what gets written to `wiki.toml` stay as they are: `SettingsDialog` is the frame, and `BoardSettings` and `GraphSettings` own the fields.

## Frame

- A centred dialog: `min(560px, 100%)`, max height 90vh, `elev` with a 16px radius, the shadow, and `wv-in`, over a `black/55` backdrop.
- The header shows the title at 16px 600 with the view's path in mono under it, plus a close button.
- The body scrolls, with 18px between fields.
- The footer reads "Writes to the bundle's `wiki.toml`", followed by Cancel and a primary Save.

## Fields

- **Inputs and selects** are 38px, `panel-2`, with a `line-2` border that turns `accent` on focus and a 9px radius. Labels are 12.5px 500 `muted` above the control, and hints are 12px `faint` under it.
- **Cards are entries where**: each `where` clause is a chip on `elev` in mono, showing `key` `is`/`is not` `value` with the value in `accent-ink` and a × to remove it. After them comes a dashed **+ Filter** button that opens an inline key/op/value row. The parsing and validation stay the server's job, as now.
- **Columns from** and **Lanes from** sit side by side as two selects over the board's known fields. Lanes gets a "— no lanes —" option.
- **Waiting on** is a select over the fields that hold references, with the mock's hint text.
- **Columns · order is left to right**: a bordered list where each row has the column's dot, its value in mono, ↑, ↓ and × (× turns `danger` on hover). An "Add column" row follows. This replaces the current tabbed editor. Lanes get the same list, under a second heading.
- **Graph settings** use the same frame and the same where-chips, with the neighbours toggle as a switch.

**Tests:** the existing settings tests keep passing. New tests cover adding and removing a where chip, reordering with ↑ and ↓ (disabled at either end), the no-lanes option clearing the lane, and Save writing the same payload the old form did.
