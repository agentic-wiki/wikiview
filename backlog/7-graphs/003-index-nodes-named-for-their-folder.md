---
type: task
title: "an index node is named for its folder"
status: done
priority: low
tags: [graphs, labels]
blockers: [/7-graphs/001-graph-view.md]
---

A folder's `index.md` with no title drew as "Index", so a graph over several folders showed a scatter of identical dots. A graph has no tree or breadcrumb beside a node to say where it lives, so the name has to.

An untitled `index.md` node is now labelled with its folder's readable name (`/2-server/index.md` → "2 Server"), and the bundle's own `/index.md` with the bundle's name, the way a view over `/` is named. An entry's own `title` still wins, as it does everywhere.

Graph only. The tree and breadcrumb keep "Index", since the folder is already on screen around it. Backlinks keep "Folder (index)", where the qualifier tells you a row is an index and not an entry called "Orgs". Both rules share `indexedFolder`, so what counts as an index is decided in one place.

## Drawn as landmarks

An index stands for its folder, so it reads as a landmark rather than one more entry:

- **Named whenever names are on.** "Hubs" names an index however few links it has, as "All" does. "None" still means none, apart from what you point at or highlight, as for any node. The rule lives in the UI's `labelled`, using `isIndex` from `tree.ts`.
- **A ring, not a dot.** Ground-coloured fill with a solid 2.5px stroke in its group's colour. This is deliberately not the neighbour look, which is a dashed grey outline. A neighbour that is also an index keeps the neighbour look, because being context is the stronger thing to say. The node open in the sheet keeps the foreground ring that marks it.

Not done: the legend has no "Index" row explaining the ring, the way it has one for neighbours. Add one if the ring turns out not to explain itself.
