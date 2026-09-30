---
type: task
title: "the graph, redrawn"
status: todo
priority: medium
tags: [design, ui, graphs]
blockers: [/8-design/010-peek.md]
---

Mock lines 400–436 and 763–779. d3-force layout, node dragging, zoom-around-pointer, arrows and neighbour styling all stay.

## Header

As the board's: the name, and `N entries · N links` in mono; spacer; a **Highlight nodes** input; a **Labels** segmented control with **Hubs / All / None**; then the existing **Direction** toggle and **text size** control, restyled as segmented controls; **Settings**. The soft-limit warning stays, as a thin `warn` strip under the header.

- **Highlight** matches titles and labels case-insensitively. Matches keep full opacity and show their labels, everything else drops to 14%, and edges between non-matches drop to 15%.
- **Labels**: *Hubs* labels nodes of degree ≥ the 85th percentile of the graph, and every node once zoomed past 1.8×. *All* labels everything and *None* labels nothing, except that the hovered node and its neighbours are always labelled. The existing `LABELS_FROM` threshold is replaced by this. The choice is kept per bundle.

## Canvas

- The `bg` background with the mock's dot grid: a 1px `line` radial dot every 22px.
- Nodes are **filled with their group colour** ([003](./003-colour.md), groups under the graph's `path`) and ringed in `bg`. A neighbour node stays hollow and dashed. The node open in the peek gets a `fg` ring. Hovering a node lights it and its neighbours, and its edges turn `accent` at 1.8px.
- Edges use `edge`.
- Labels are 11px, painted over a `bg` halo stroke, and ellipsized at 30 characters until hovered.
- Nodes hidden through the panel's groups legend ([006](./006-rail-and-panel.md)) are removed from the drawing along with their edges. The simulation keeps them, so showing them again does not re-layout.

## Overlays

- **Zoom controls**, bottom-left: a vertical `elev` group holding +, − and fit. Fit frames the graph's bounds.
- **Hover card**, beside them: the group dot, `group · N connections`, the title, and "Click to preview". It ignores pointer events.

**Tests:** the highlight dims non-matches and labels matches; the three label modes plus the hover override; zoom buttons change the transform; fit frames the nodes; hidden groups are not drawn; node colour comes from the group.
