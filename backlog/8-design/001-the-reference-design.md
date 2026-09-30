---
type: task
title: "the reference design, applied: plan and decisions"
status: in-progress
priority: high
tags: [design, ui]
---

The UI works and reads as a wireframe. `wikiview-ui-ref/Wikiview.dc.html` (a single mock, beside this repo; `support.js` is only its template runtime) is the design to apply: every surface, not a palette swap. This entry is the inventory and the decisions; the work is split into the tasks below, applied in order, each one finished before the next.

The mock is a prototype with fake data and inline styles. It is the **look and the layout**, never the implementation: behaviour the app already has (pointer-event drags, URL-addressed sheets, the seen/queue state, git previews, print) stays, and wears the new design.

## Decisions

Settled with the user before any code, 2026-09-29.

- **Fonts: Geist and Geist Mono, self-hosted.** Bundled from `@fontsource-variable/geist` and `@fontsource-variable/geist-mono` into `ui/dist`, so the binary still loads nothing from a network. Not the mock's Google Fonts link.
- **Server additions, where the mock shows data the API lacks:** wall-clock *updated* times, the *incoming commits* list for the git popover, *link counts* on tree entries and cards, and the *first blocker's title* on a card ("Waiting on …", ellipsized, first blocker only, the rest counted).
- **"Recently changed" stays** what it is (unseen changes, not an opened-history), restyled as the mock's *Recent* page. No history view is added.
- **Colour is positional, never by meaning**, with one exception the user asked for (below). One module owns all of it — [003](./003-colour.md).
  - *Groups*: an entry's group is the **first-level subfolder under the view's folder** (the bundle root in the reader; a graph's `path` on a graph), one level only — deeper entries take their first-level ancestor. Groups are coloured by their position among their siblings. Entries directly in the view's folder are the neutral group.
  - *Links in/out* dots: the linked entry's group colour, same rule.
  - *Tags*: every tag in the bundle, collected in the order they first appear (entries walked in path order, tags in frontmatter order), deduplicated. A tag's index in that list picks its colour, so one tag is one colour everywhere.
  - *Board columns*: a gradient **gray → blue → amber → green** across the columns, whatever their count. **Exception: `archived` and `parked` are always gray** and take no step in the gradient. The no-status column is faint.
  - *Lanes* take no hue: the mock's three-bar glyph fills by position, first lane strongest.
- **Card/node peek: a side panel with the full body.** The mock's right-hand peek (header, property grid with Status/Lane controls, links) plus the whole rendered entry, replacing the centred `CardSheet` dialog — [010](./010-peek.md).
- **Mobile is the last phase** — [017](./017-mobile.md).

## Assumed, not yet confirmed

Small enough to default; listed so they are not silent.

- **Theme keeps three states** (auto → light → dark) with the mock's icons. The mock has two and defaults to dark; dropping "match system" would be a regression nobody asked for.
- **No bundle switcher.** The mock's header name has a dropdown chevron; there is one bundle per server, so the name is a link to the front door, without the chevron.
- **No accent picker.** The mock exposes four accents as a prop; one accent, `#8B7CFF`.
- **No lead summary.** The mock's entries open with a muted summary paragraph and folders with a description. Neither has a source in a bundle; they are omitted rather than invented from a frontmatter key nobody agreed on.
- **Tree folders**: clicking a folder's name opens it (its `index.md`, or its listing); the chevron alone toggles it, as in the mock. Today the whole row toggles.

## Inventory

Every region of the mock, where it lands, and the task that owns it. Line numbers are into `Wikiview.dc.html`.

| Mock | Lines | Lands in | Task |
|---|---|---|---|
| Tokens, both themes, scrollbars, keyframes, 14px base | 15–25 | `index.css` | [002](./002-tokens-and-type.md) |
| Group / tag / column colour | 649–651, 720 | new `colour.ts`, `/api/bundle` | [003](./003-colour.md) |
| Header: logo tile, crumbs, search trigger, refresh, theme | 30–68 | `Shell`, `Breadcrumbs`, `Omnibar`, `Theme`, `GitActions` | [004](./004-header.md) |
| Git pill and Source control popover | 58–64, 70–121 | `GitActions`, `/api/git` | [005](./005-git-popover.md) |
| Rail, tree panel, collections panel, new board/graph form, graph groups legend | 125–207 | `Rail`, `Tree`, `Shell`, `NewView` | [006](./006-rail-and-panel.md) |
| Entry: toolbar, title, meta line, prose, links to / linked from, "On this page" | 211–306 | `EntryView`, `Markdown`, `index.css` | [007](./007-entry.md) |
| Folder listing | 308–337 | `FolderView`, `listing.tsx`, `/api/tree` | [008](./008-folder.md) |
| Board: header, columns, lanes, cards, drop targets | 339–398 | `BoardView` | [009](./009-board.md) |
| Peek | 476–541 | `CardSheet` → peek | [010](./010-peek.md) |
| Graph: header, canvas, zoom, hover card | 400–436, 763–779 | `GraphView` | [011](./011-graph.md) |
| Recent and Read later pages | 438–473 | `ChangedView`, `ReadLaterView` | [012](./012-lists.md) |
| Command palette | 559–580, 839–851 | `Omnibar` | [013](./013-palette.md) |
| Board settings dialog | 582–638 | `SettingsDialog`, `BoardSettings`, `GraphSettings` | [014](./014-settings.md) |
| Toasts | 640–644 | new `Toast` | [015](./015-toasts.md) |
| Loading, not found, empty, error | — (not in the mock) | `Loading`, `NotFound`, `App`, `BoardView` | [016](./016-states.md) |
| Drawer, bottom tabs, bottom-sheet peek, snapping columns | 31–33, 52–54, 138–141, 544–557, 837, 884 | everywhere | [017](./017-mobile.md) |

Keyboard from the mock: ⌘K toggles the palette (exists), **⌘\\ toggles the panel** (new, [006](./006-rail-and-panel.md)), Escape closes the topmost of palette → settings → git → peek → drawer (today each surface listens on its own; [010](./010-peek.md) makes it one stack).

## Rules for every task

- **One vocabulary.** The token names become the mock's (`bg`, `panel`, `panel-2`, `elev`, `line`, `line-2`, `fg`, `muted`, `faint`, `accent`, `accent-ink`, `on-accent`, plus `ok`/`warn`/`danger`) and the old ones (`sunken`, `surface`, `border`, `accent-fg`) are removed everywhere in [002](./002-tokens-and-type.md), not aliased.
- **Tailwind classes, not inline styles.** The mock's inline styles are transcribed into the existing Tailwind idiom; a repeated recipe (the segmented control, the chip, the section label, the icon button) becomes one component the first time it is needed twice, in `ui/src/ui/`.
- **Print keeps working.** Every surface is checked against the print stylesheet; `print.test.ts` must stay green.
- **Tests move with the markup.** `App.test.tsx` asserts panel widths by class (`w-64`/`w-0`); those assertions change with the panel, they are not deleted. New behaviour (colour assignment, filters, lane toggle, peek controls, palette commands) gets tests that challenge it.
- **`just check` green at the end of every task**, `just backlog` clean.

## Order

002 → 003 first: everything else is drawn in their tokens and colours. Then the shell (004–006), the reader (007–008), the views (009–012), the overlays (013–016), and mobile (017) last.
