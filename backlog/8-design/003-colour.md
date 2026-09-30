---
type: task
title: "positional colour: groups, tags, columns, lanes"
status: todo
priority: high
tags: [design, ui, api]
blockers: [/8-design/002-tokens-and-type.md]
---

The mock colours nearly everything, and the code had a rule against colouring values by meaning. The rule survives: colour here says **where something is**, never what a word means — with one exception, asked for. All of it lives in one module, `ui/src/colour.ts`, and nothing else picks a colour.

## The palette

Eight categorical hues from the mock's `GROUPS`/`TAGC` (`#9D8CFF #3CCBDA #FF6FA8 #8FD14F #FFB547 #5F9BFF #FF8A5C #FF5C7A`), each with a light-theme variant dark enough to read on paper. Index `i` takes hue `i mod 8`. Wrapping is accepted: a ninth group repeats the first colour, and the label disambiguates.

## Groups

`groupOf(path, root)`: the first path segment below `root` that is a folder. `/3-reader/004-ui-shell.md` under `/` is group `3-reader`; under a graph over `/3-reader` it is the neutral group, because it sits directly in the view's folder. One level only.

`groupColour(group, siblings)`: the group's index among `root`'s child folders in tree order. The neutral group is `faint`.

Used by: tree folder dots ([006](./006-rail-and-panel.md)), the entry's group chip and its links in/out ([007](./007-entry.md)), folder rows ([008](./008-folder.md)), graph nodes and legend ([011](./011-graph.md)), list rows ([012](./012-lists.md)), palette items ([013](./013-palette.md)), the peek chip ([010](./010-peek.md)).

## Tags

**Server:** `/api/bundle` gains `tags: string[]` — every entry walked in path order, each one's `tags` in frontmatter order, first appearance kept. Rebuilt with the index, so it moves with the version like everything else.

`tagColour(tag, tags)`: the palette at the tag's index. An unknown tag (the list is stale for a moment after a write) gets `faint` until the refetch.

Edge case, accepted: a new tag in an early-sorting file shifts the colour of every tag first seen after it.

## Columns

`columnColour(value, columns)`: a four-stop gradient **gray → blue → amber → green**, sampled in oklch at `i / (n − 1)` for the `i`-th of `n` live columns, whatever their count. Four live columns land exactly on the four stops.

- **`archived` and `parked` are gray**, always, and are not live: they take no step. So this backlog's `todo, in-progress, done, archived` is three live columns — gray, the blue–amber midpoint, green — and a gray `archived`. The midpoint for odd counts is pinned by test and checked by eye; if it reads muddy, the fix is in the sampling, not a special case.
- The shelved words are one constant in this module (`SHELVED`), matched case-insensitively. Adding a word is a one-line change; making it configurable waits for someone to ask.
- One live column is blue; two are gray and green.
- The column with no status is `faint`.
- The halo is the colour at 20% alpha, the progress bar the colour itself.

## Lanes

No hue. `laneBars(index, count)` returns how many of the mock's three bars are lit: the first lane three, the last one, the rest spread between. One lane: three.

## Tests

`colour.test.ts`: group resolution at root and under a subfolder, one-level-only, the neutral group; tag order from first appearance and dedup; the gradient's endpoints and stops for 1–6 columns; shelved words skipped and case-insensitive; lane bars for 1–5 lanes. Server: the tag list's order, dedup, and that it moves on rebuild.
