---
type: task
title: "the graph, redrawn"
status: done
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

## Groups legend

Moved here from [006](./006-rail-and-panel.md), so it ships with the canvas that honours it. On a graph, the panel gets a `GROUPS` section under the list of graphs: each group under the graph's `path`, with its colour dot, its label and a count. Clicking one hides or shows its nodes, and a hidden group's row is dimmed. The hidden set is view state, kept per graph in `useBundleState`.

## Overlays

- **Zoom controls**, bottom-left: a vertical `elev` group holding +, − and fit. Fit frames the graph's bounds.
- **Hover card**, beside them: the group dot, `group · N connections`, the title, and "Click to preview". It ignores pointer events.

**Tests:** the highlight dims non-matches and labels matches; the three label modes plus the hover override; zoom buttons change the transform; fit frames the nodes; hidden groups are not drawn; node colour comes from the group.

## What building it settled

- **The groups legend is on the canvas, not in the panel.** The reference puts it in the sidebar, but the Graphs panel is shut by default when a bundle declares one graph, and the panel has no nodes to count (a `where` filter would make folder counts wrong). As a floating card at the top left, it is there whenever the graph is and counts what is drawn. It appears only with two or more rows. Groups with no node on the graph are left out, and everything outside the graph's groups is one "Other" row (entries directly in its folder, and neighbours). Hidden groups are kept per graph (`graph:<id>:hidden`), and their nodes and every edge touching them leave the drawing while the simulation keeps them.
- **Label modes replace the zoom threshold.** *Hubs* (the default) names nodes at or above the 85th-percentile degree, everything past 1.8× zoom, and everything on a graph of `SMALL_GRAPH` = 24 nodes or fewer, where there is no crowding to spare. *All* and *None* mean what they say. The pointed-at node, its neighbours and the highlight's matches are always named. Kept per bundle.
- **The highlight** matches title or label. Non-matches fade to 14% and edges not between two matches to 15%, as in the reference.
- **Nodes are filled with their group's colour** as an inline `fill` (a token, so the theme follows). The node open in the sheet is ringed in `fg`, and hovered edges are `accent` at 1.8px. Edges are the `edge` token.
- **Direction stays a real checkbox** inside its label, restyled (`accent-color`), and text size keeps its three-letter scale on the segmented track.
- **`ui/SearchField.tsx` and `ui/SettingsButton.tsx`**, now shared by the board and the graph headers.
- **Found in testing: "main svg" now matches the search field's magnifier**, so two tests that meant "the graph canvas" were targeting an icon, one of them passing for the wrong reason. They now select `svg[role='img']`.
- **The palette note from [007](./007-entry.md) is plainer here**: two top-level folders drawn in `#FF6FA8` and `#FF5C7A` read as one pink. Still the reference's palette; still raised rather than changed.
- **Revised after use:** hovered edges are drawn in the text colour (`stroke-fg`: white in dark, near-black in light), not the accent. Violet edges competed with the group colours of the nodes they join, and the rest of the edges stay the gray `edge`.
- **Revised again:** pointing at (or focusing) a legend row lights that group the way pointing at a node lights its neighbours. Its nodes stay at full strength and are named, the edges between two of them light, and the rest dims. A node hover wins over a group hover, which wins over the highlight's matches, and a group that is set aside has nothing to light. Lit edges are also quieter: `stroke-fg/60` at 1.5px, not full strength at 1.8px, which outshouted the nodes in dark mode.
- **Hiding the group you point at no longer dims everything.** The hover kept lighting a group that was no longer drawn, so every node visible was outside it. A group set aside now lights nothing, and the rest shows as usual. Found by the user; pinned by test, and a mutation removing the guard fails it.
- **Show only this group.** A round button replaces a row's count on hover and focus (in the count's place, so the row does not grow). It sets every other group aside. Pressed again while its group is the only one showing, it brings them all back; in that state it stays in place, lit. Each row is two buttons, the toggle and this one, since a button cannot hold a button.
- **A hidden group previews on hover.** Pointing at a hidden group's row draws it, lit, with the rest dimmed, for as long as you point, and changes nothing about what is hidden. The exception is the row you just used to hide its group: it waits for the pointer (or focus) to leave before it will preview. Otherwise the group would reappear under the click that put it away. This replaces the earlier "a hidden group lights nothing" guard, which the wait-for-leave rule makes unnecessary.
- **"show all"** sits in the legend's heading whenever any group is hidden, and brings every group back.
- **No more "Other".** It mixed two things. Entries directly in the graph's own folder are now a row named after that folder (the bundle's name for a graph over `/`), listed **first**, since they are what the folder itself holds. Neighbours, which come from anywhere in the bundle, are their own **"Neighbours"** row, listed last, with the hollow dot the canvas draws them with. On this backlog's Tasks graph, the "Other 1" row was in fact the neighbour `index.md`. The hover card uses the same names.
- **No Direction toggle.** Arrowheads are drawn only on the edges of the node you point at, where the question of which way a link goes is being asked, and never otherwise. The stored `graph-arrows` preference is no longer read. The arrowhead is a notched dart (not a plain triangle) in the lit edge's own `fg/60`. This supersedes the "arrowheads are a view toggle" decision in [7-graphs/001](../7-graphs/001-graph-view.md).
- **The legend folds.** By default it is one line: GROUPS and a dot per group (the hidden ones faded), plus "N hidden" when any are. It opens while pointed at or focused, and folds 200ms after the pointer leaves, so grazing its edge does not flicker it. A click on its header pins it open, kept per bundle (`graph:legend`), which is also how it opens on a screen with no hover. Rows carry `data-legend-row`.
- **Every click on the legend's header shows what it did** (found by the user: "always open, no matter how many times I click its header"). With the pointer on it, the legend is already open, so a click only flipped the stored pin, and nothing on screen changed. A pin once set also opened the legend on every load, which read as "not folded by default". Now a click on a legend that is open under the pointer pins it, and a pin mark lights beside GROUPS. A click on a pinned legend folds it at once, and it stays folded while still pointed at, until the pointer leaves (`usePeek`'s `dismiss`). The reader's properties follow the same rule.
