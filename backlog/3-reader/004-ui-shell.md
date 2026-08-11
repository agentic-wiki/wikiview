---
type: task
title: "the UI shell: rail, panel, breadcrumbs, palette"
status: done
priority: high
tags: [feature, reader, ui]
blockers: [/3-reader/003-resolve-server-side.md]
---

The chrome every view sits inside, agreed before any of it was written.

## Stack

Vite + React + TypeScript, Tailwind, and shadcn/ui **where it is a net positive** — dialogs, popovers, command palette, dropdowns are worth taking; a button that is one Tailwind class is not.

Dependencies install with `bun install --ignore-scripts`, always. Postinstall scripts run arbitrary code from every transitive dependency, which is the main supply-chain path in this ecosystem.

## Shell

```
┌────┬─────────────────────────────────────────────────────┐
│ 📄 │ ☰  my-kb / … / notes / design.md      ⌘K  ⟳ ↓ ↑    │
│ ▪▪ ├──────────────┬──────────────────────────────────────┤
│ 🔍 │ ▾ /          │                                      │
│    │   index.md   │             view area                │
│    │ ▾ notes/     │                                      │
│    │   design.md  │                                      │
└────┴──────────────┴──────────────────────────────────────┘
  ▲         ▲
  rail    panel (☰ collapses; open on desktop, drawer on mobile)
```

**One layout, not a setting.** Breadcrumbs, a collapsible panel and a palette are three affordances, not three competing designs, so they compose. Two selectable layouts would mean two sets of states, two responsive behaviours, and every future view built twice — for a choice nobody has yet asked for. If real use shows two genuinely different workflows, that is the moment to revisit, with the evidence.

**The rail** carries Entries / Boards / Search. An icon rail rather than tabs or a bottom section: both lists stay one click away and permanently visible as affordances, and it scales when a fourth thing appears.

It expands **ephemerally** to show labels, over the panel rather than pushing it, so nothing reflows. It collapses on leave and on selection.

Two separate timings, easily conflated:

- **Hover intent** — about 150ms before it begins expanding, so a cursor sweeping past does not flash it open. No delay before collapsing: leaving should feel immediate.
- **The animation** — both directions animate, a short width transition with an ease-out curve. Snapping shut is jarring even when the decision to close is instant. Respect `prefers-reduced-motion` by dropping to a near-zero duration rather than removing the state change.

**Focus expands it as well as hover**, or keyboard users get unlabelled icons and touch gets nothing. Every button carries an `aria-label` regardless, so a screen reader never depends on the expansion happening.

**⌘K is an overlay, not a header input.** That is what resolves the tension between breadcrumbs and search: a persistent input would fight the path for width, while a centred overlay has room for the placeholder, the filters, and results. The header carries only a small affordance.

**Breadcrumbs** middle-ellipsize on deep paths, keeping the first and last segments with the collapsed ones in a dropdown (`my-kb / … / notes / design.md`). On narrow screens they reduce to the current entry plus back.

**Desktop first, degrading to a drawer.** Boards and grids need width; this is a working tool on a wide screen before it is a phone app.

## Routes

```
/                        the bundle's front door (root index.md)
/wiki/notes/design.md    the reader, on that entry
/wiki/notes/             a folder
/kanban/backlog          a board over that folder
/api/…                   reserved
```

Real routes via the History API, never hash routes: the fragment belongs to heading anchors (`/wiki/notes/a.md#a-heading_here`), so it cannot also carry the router. The server returns `index.html` for any non-`/api` path so a cold load or refresh of a deep URL works, and the client takes over from there.

Paths keep `.md` and are carried verbatim — the URL *is* the bundle path. Dropping the extension would be ambiguous: a bundle can hold both `/notes.md` and `/notes/index.md` and `wiki check` is clean on it, so `/wiki/notes` would name two entries.

**A folder navigates to its `index.md` when it has one** (`replaceState`, so one entry keeps one URL and the back button is not polluted). With no index, the folder URL stays and lists the entries inside it. An empty folder gets a placeholder; offering to create an entry or a board there is deliberately later, and the UI must never write an `index.md` on its own to make a folder look tidier.

## Views

| route | view |
|---|---|
| `/wiki/<entry>.md` | reader: rendered markdown, frontmatter strip, checkboxes, linked mentions |
| `/wiki/<folder>/` | the folder's entries, or a placeholder |
| `/kanban/<folder>` | board: columns from status, optional lanes |
| an entry holding tables | grid affordance on each table |

Query strings carry view state (`?where=status!=done`), as filters already do: the route says what you are looking at, the query says how.

## Deliberately not now

- **Markdown editing.** The layout should leave room for it — the body is served as source precisely so an editor can save it back — but nothing edits prose in this phase.
- **A macOS-style column browser.** Discussed and set aside; the folder list is enough to start, and columns can be a view later if browsing proves awkward.
- **Creating entries or boards** from an empty folder.

**Acceptance:** the shell renders with rail, collapsible panel, ellipsizing breadcrumbs and a ⌘K overlay; routes resolve on cold load and on client navigation; a folder with an index redirects to it and one without lists its entries; the panel is a drawer on narrow screens; every rail control is reachable and labelled by keyboard.

## Done

The shell is built as agreed: rail with ephemeral labels, collapsible panel, ellipsizing breadcrumbs, ⌘K overlay, real routes with the SPA fallback, and the folder rule (redirect to `index.md`, else list, else placeholder).

Four things that only surfaced in the building:

- **A selection survives navigation.** React reuses DOM nodes between routes, so a selection made on one entry reappears over whatever text lands in those nodes. A full page load would never do it; it is a consequence of not having one.
- **Scroll has three cases, not two.** New page to the top, back to where you were, and `#anchor` beating both — the last being the one most easily forgotten, and the reason this reader cannot use hash routing.
- **A URL outside the routes rendered nothing at all.** `/README.md` served `index.html`, the app booted, no route matched, and the result was a blank page that reads as a broken app rather than a wrong address.
- **An entry was called three different things** depending on where it was named: raw filename in the tree, de-slugified in a backlink, path segment in the breadcrumb. The display name is now computed once, on the server.

Deferred as planned: markdown editing, a column browser, and creating entries from an empty folder.
