---
type: task
title: "the rail, the tree and the view panels"
status: todo
priority: high
tags: [design, ui]
blockers: [/8-design/004-header.md]
---

Mock lines 125–207. The section/panel logic in `Shell.tsx` (per-section open state, click-active-to-toggle, the picked section for a bundle with no boards) is kept as it is; this is what it draws.

## Rail

56px, `panel`, `line` hairline on the right, no shadow, in flow rather than absolute. 40px buttons, 10px radius, the mock's five glyphs at 19px / stroke 1.7. Active: `accent-bg` fill, `accent-ink` icon — the edge bar is dropped, the tint is the mock's only marker. Hover `fg`.

Badges, the mock's accent pill (15px, 9.5px bold, `on-accent`) at the top right: **Read later** shows its count; **Recently changed** shows the unseen count. Hidden at zero.

## Panel

268px, `panel`, hairline right. **⌘\\ toggles** the current section's panel (the same `toggle` the active icon calls).

### Entries

A header row: `ENTRIES` section label and a mono count of entries. Then the tree:

- Folder rows 32px, 7px radius, 500: a 20px chevron hit area that **alone** toggles (rotates 90° when open, 150ms), a 7px rounded-square dot in the folder's group colour ([003](./003-colour.md)) — top level only, deeper folders have no dot — the label, and a mono child count. Clicking the label **opens the folder** (its `index.md`, else the listing) and expands it.
- Entry rows: 400 in `muted`, active `accent-bg` / `accent-ink` / 500. Indentation matches the mock (folder 8px, child 44px, +12px a level).
- The saved and unseen marks keep their two-slot column at the right.
- The active folder (on its listing) is tinted like an active entry.

### Boards and Graphs

`BOARDS` / `GRAPHS` label, then each view as a card row: a 28px `elev` tile with the name's initial in `accent-ink`, the name, and `path · N cards` / `path · N nodes` in mono `faint`; the current one on `accent-bg`. Counts need `BoardConfig.cards` and `GraphConfig.nodes` on `/api/bundle`, computed with the index.

Below, a dashed **+ New board / graph** button that expands in place into the mock's form (Folder select, Name, the slug preview in mono, Cancel / Create, the "Appends a `[[tool.wikiview.board]]` table to wiki.toml" note) — `NewView` restyled, its behaviour unchanged. With none declared, the form is the whole panel as today, under the intro sentence.

### Graph groups

On a graph, under the list, a `GROUPS` section: each group of the graph's folder with its colour dot, label and count; clicking hides or shows its nodes (dimmed row when hidden). The hidden set is view state, per graph, in `useBundleState`. Wired to the canvas in [011](./011-graph.md).

## Tests

The existing panel-width assertions move from `w-64`/`w-0` to the new classes. New: ⌘\\ toggles; chevron toggles without navigating; the label navigates to the index or the listing; badges show counts and hide at zero; the groups toggle hides nodes.
