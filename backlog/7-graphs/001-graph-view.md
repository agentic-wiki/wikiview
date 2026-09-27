---
type: task
title: "the graph: entries and the links between them"
status: done
priority: medium
tags: [feature, graphs]
---

A graph over a slice of the bundle, the way Obsidian draws one: `/graph/<id>`. Each entry that makes it through the graph's filter is a node, and a link from one of them to another is an edge. An entry that links to nothing and that nothing links to is still drawn, as an isolated dot: **no node may be invisible**, for the same reason no card may be.

## Declared, never built in

```toml
[[tool.wikiview.graph]]
id    = "people"
path  = "/people"
where = ["type=person"]   # optional, and no default
```

`id` and `path` are required; `name` and `where` are optional. Unlike a board there is no default `where`: a board assumes tasks, a graph assumes nothing, so a graph is every entry under `path` until `where` narrows it.

**No built-in graph.** Boards have `root`; graphs do not. Every graph is custom and explicit. A whole-bundle graph is one declaration (`path = "/"`), and adding it as a built-in later is easy — removing one people came to rely on is not.

Ids are their own namespace: a board and a graph may both be called `people`, because `/kanban/people` and `/graph/people` cannot be confused. Two graphs sharing an id are reported, as two boards are.

## What an edge is

**Both kinds of link.** A body link (`[Ana](./ana.md)`) and a frontmatter value naming an entry (`manager: /people/ana.md`) are both edges. For a graph of people, frontmatter is often where the relationships actually live. The frontmatter rule is the one the reader already uses for `frontmatterRefs`: a `.md` value, resolved relative to the entry, inside the bundle.

Each edge carries where it came from — `body` or the field name — so hovering one can say `manager` rather than just "linked".

**Directed underneath, drawn as a line.** A link has a direction and the server keeps it. Two entries linking each other are one edge marked `mutual`, not two lines drawn on top of each other. Arrowheads are a view toggle, remembered per bundle in the browser: whether you want to see direction is a preference, not a fact about the bundle.

Left out, deliberately:

- **Links to entries not written yet.** A missing file is not a node.
- **Self-links.** An entry linking itself is not a relationship.
- **Links to assets and links leaving the bundle.** Not entries.
- **Duplicates.** Two links from A to B are one edge, with the count kept for the hover.

## Neighbours

`neighbours = true` (default off) also draws the entries the filtered ones link to, and the ones linking to them, even though they fail the filter. Drawn hollow and dimmed, so it is obvious which nodes the graph is *about* and which are context.

Only edges touching a filtered entry. An edge between two neighbours would quietly turn this into a graph two hops out.

Config rather than a UI toggle, because it changes which entries the graph contains — the same kind of setting as `where`.

## Where it comes from

`GET /api/graph/{id}`, returning nodes and edges. Assembled on the server for the reason a board is: the config is decoded there, `where` is parsed there, and the links are already resolved in the index. A client doing it would need every entry's links, which is a request per node.

## The view

Laid out with `d3-force`, the only dependency this adds: nodes repel, edges pull, and the graph settles. Everything else is drawn here in SVG, so it looks like the rest of the app.

- **Drag** a node and it pins under the pointer; its neighbours follow as the layout reheats.
- **Hover** a node and its edges and neighbours light up, the rest fades.
- **Click** a node and its entry opens as the same card sheet a board uses: `/graph/<id>/<entry path>`, so back closes it and a node can be linked to.
- **Zoom** with the wheel, **pan** by dragging the background.

Nodes are sized by how many edges they have and labelled with their title. No colouring: a later concern, if at all.

**A refresh keeps positions.** The version moves on any change to any file, and rerunning the layout each time would scramble the graph under you while an agent writes somewhere else. Nodes that survive keep where they were; a new one starts beside whatever it links to; nothing moves when nothing changed.

**A soft limit, not a cap.** Filters exist so a graph is not thousands of nodes. Past 500, the graph says so and suggests narrowing `where` — and still draws everything.

## The Graphs rail section

Its own icon, listing declared graphs the way Boards lists boards. With none declared, the panel is where the first one starts: for now the snippet above, until [declaring graphs](./002-declaring-graphs.md) replaces it with the form.

**Acceptance:** a declared graph opens at `/graph/<id>`; its nodes are the entries under `path` passing `where`, isolated ones included; edges come from body and frontmatter links between them, deduplicated, mutual pairs merged, self-links and unwritten targets left out; `neighbours = true` adds the entries one hop out, drawn apart, with no edges between them; a node opens its card sheet; a refresh leaves surviving nodes where they were; an unknown id is not found; a bad graph in the config is reported rather than taking anything down.

## Done

`GET /api/graph/{id}` assembles nodes and edges in `internal/server/graph.go`; `GraphView` lays them out with `d3-force` and draws them in SVG. Config is `config.Graph`, validated by the rules boards follow, with its own table of known keys, so `lane` on a graph is reported as the misspelling it is there.

**The card sheet is shared.** It moved out of `BoardView` into `CardSheet`, taking a `destination` for links instead of knowing about boards. A board sends a link inside its folder to another card; a graph sends a link to one of its nodes, neighbours included, to that node. Everything else leaves for the reader in both. The address split moved with it (`splitSheetPath`), used by both routes and the tab title, which each had their own copy of it.

**Positions carry over in `place()`**, a pure function tested apart from the view. It is handed the previous layout explicitly rather than keeping one anywhere hidden. Nothing restarts the simulation unless a node or an edge changed. A first layout is mostly settled before the first paint, so a graph opens close to its shape rather than exploding out of a spiral.

**A graph with no `path` is not served.** It is reported at startup and missing from the list, because an empty prefix is how the index spells the whole bundle, so serving it would quietly graph everything.

**Not here:** declaring and editing from the UI, which is [002](./002-declaring-graphs.md); colouring nodes; and a whole-bundle graph built in.

## Zoom spreads, a control sizes

Added after first use. Zoom scaled the whole drawing, so zooming in to read made the dots and titles bigger along with the gaps between them: a bigger copy of the same crowding, and the dots felt too large.

**Zoom now moves nodes apart and makes nothing bigger.** Positions are multiplied by the zoom and every size is in screen pixels, so zooming in makes room between titles.

**Size is its own control: Small, Medium, Large**, live in the header and remembered per bundle, like Direction. Dots follow the text a little but less than in proportion, since a large dot is what this was fixing. Kept out of Settings because it is how you look at the graph, not what the graph is.

Titles are shortened at 24 characters and shown whole on the node you point at; the accessible name is never shortened. Dots are smaller than before, 3–10 px at Medium rather than 4–16.

**Not done:** a spacing slider. Zoom already sets on-screen spacing, and a slider changing the layout's own distances would re-run it and move every node, including ones you placed.
