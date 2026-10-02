---
type: task
title: "highlight follows preview"
status: done
priority: medium
tags: [graphs, interaction]
blockers: [/7-graphs/001-graph-view.md]
---

Clicking a node opens it in the sheet, and the highlight its hover gave (its neighbours at full strength, its edges lit and arrowed, their names shown) used to vanish as soon as the pointer moved to read it.

With **Highlight follows preview** ticked, the open node counts as hovered for as long as the sheet is open. It is exactly the hover highlight, not a new look:

- Following a link in the sheet moves the highlight to the entry it opened. Closing the sheet clears it.
- Pointing at another node takes over while you point, then the highlight returns to the open one.
- An entry the sheet reached that is not drawn on this graph (outside its filter, or in a group set aside) lights nothing, so the graph looks as if nothing were open.

## The setting

A checkbox in the graph's Settings dialog, under Include neighbours, off by default. It is changed about as rarely as the graph's other settings, so it sits with them, not in the header. It is saved per bundle in this browser (`graph-follow-preview`) and never written to `wiki.toml`; the checkbox says so, since the dialog's footer says it writes `wiki.toml`. It is part of the form: Save applies it and Cancel discards it.

It was asked for with slower devices in mind. Honestly, the cost is the same one render a hover triggers, once per open, with nothing ongoing, so the switch is about preference rather than speed.

A consequence to watch: hover already beat a pointed-at legend group and the typed highlight, and the open node inherits that. While a sheet is open, typing a highlight or pointing at a legend row has no visible effect until it closes. If that bites, the fix is to rank the open node below those two and keep the hovered node above them.
