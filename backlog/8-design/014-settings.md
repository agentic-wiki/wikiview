---
type: task
title: "board and graph settings, redrawn"
status: done
priority: medium
tags: [design, ui, config]
blockers: [/8-design/009-board.md]
---

Mock lines 582–638. The fields and what gets written to `wiki.toml` stay as they are: `SettingsDialog` is the frame, and `BoardSettings` and `GraphSettings` own the fields.

## Frame

- A centred dialog: `min(560px, 100%)`, max height 90vh, `elev` with a 16px radius, the shadow, and `wv-in`, over a `black/55` backdrop.
- The header shows the title at 16px 600 with the view's path in mono under it, plus a close button.
- The body scrolls, with 18px between fields.
- The footer reads "Writes to the bundle's `wiki.toml`", followed by Cancel and a primary Apply (renamed from Save on 2026-10-02: it applies the settings to the view as much as it writes a file).

## Fields

- **Inputs and selects** are 38px, `panel-2`, with a `line-2` border that turns `accent` on focus and a 9px radius. Labels are 12.5px 500 `muted` above the control, and hints are 12px `faint` under it.
- **Cards are entries where**: each `where` clause is a chip on `elev` in mono, showing `key` `is`/`is not` `value` with the value in `accent-ink` and a × to remove it. After them comes a dashed **+ Filter** button that opens an inline key/op/value row. The parsing and validation stay the server's job, as now.
- **Columns from** and **Lanes from** sit side by side as two selects over the board's known fields. Lanes gets a "— no lanes —" option.
- **Waiting on** is a select over the fields that hold references, with the mock's hint text.
- **Columns · order is left to right**: a bordered list where each row has the column's dot, its value in mono, ↑, ↓ and × (× turns `danger` on hover). An "Add column" row follows. This replaces the current tabbed editor. Lanes get the same list, under a second heading.
- **Graph settings** use the same frame and the same where-chips, with the neighbours toggle as a switch.

**Tests:** the existing settings tests keep passing. New tests cover adding and removing a where chip, reordering with ↑ and ↓ (disabled at either end), the no-lanes option clearing the lane, and Save writing the same payload the old form did.

## What building it settled

- **Mostly a restyle**: the dialog was already the reference's form, field for field. The frame is centred at `min(560px, 100%)` with the float shadow, and fields, lists and footer follow the reference.
- ~~**The where-rules stay editable rows**~~ (replaced by chips that open for editing: see "Revised after use"), not the reference's remove-only chips. Each rule's key, operator and value can be changed in place, which the chips cannot do. They sit in the reference's `panel-2` box, and "Add filter" is the dashed button.
- **Columns and Lanes stay tabs** (now a segmented switch), not two stacked lists. That is the earlier, stated decision: side by side, each list would get half the width for a value like `in-progress`. The reference shows only the columns list.
- **A pinned column wears its board colour** (`columnColour` over the pinned order), so the list reads as the board's columns. Pinned by test against the board's own dot.
- A test helper that read "the first span" as a row's value now asks for the value span itself.

## Revised after use (2026-09-30)

- **The filter is chips**, as in the reference: each condition reads as a sentence (`type is task`, with an empty value shown as "(nothing)"), and its ✕ removes it. There are no inputs until you ask for them. Clicking a chip opens it in one editor under the chips (key, is / is not, value with suggestions, Done), and the chip being edited is outlined. "+ Filter" adds a condition and opens it there. A condition the dialog cannot read keeps its raw text, in `warn`, and can only be removed.
- **Edits apply as they are made.** The editor has no Add or Cancel, so there is never a draft for the dialog's Save to miss. Enter and Escape finish the condition. Enter's default (submitting the dialog's form) is prevented, and Escape goes to the editor's own layer on the escape stack, so the dialog stays open.
- **Removing a chip while one is open** keeps the editor on the same condition, or closes it when that condition is the one removed.
