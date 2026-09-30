---
type: task
title: "the entry page, redrawn"
status: done
priority: high
tags: [design, ui, reader, api]
blockers: [/8-design/006-rail-and-panel.md]
---

Mock lines 211–306. The page most time is spent on.

## Layout

Centred, padding `44px 48px 96px`, the article `max-width: 720px` (normal) or `1040px` (wide) — the existing width toggle, whose `--column-width`/`--measure` are retuned to these numbers. A 48px gap to the TOC column when it shows. `wv-fade` on arrival.

## Toolbar

One flex row above the title, replacing the three floated buttons (and the float workarounds documented around them):

- the **group chip**: 24px pill, `panel-2`, `line` border, a 7px dot in the group colour, the group's label (the root's is the bundle label);
- the entry's path in mono `faint`;
- spacer, then three 32px icon buttons: **width** (hidden in the peek), **read later** (filled `accent-ink` when saved), **print**.

## Title and meta

- H1 `clamp(28px, 4vw, 38px)`, line-height 1.12, `-0.03em`, 700, `text-wrap: balance`. The existing "already named" rule still decides whether it is drawn; a body's own opening H1 gets the same style.
- Meta line, 12.5px `faint`, gap 16px: **Updated <age>**, **N links out**, **N backlinks**.
- **Server:** `Entry.updated` (and `EntryStub.updated`, for [008](./008-folder.md)) as an ISO time: the last commit touching the file when the bundle is a repository and the file is clean, else the file's mtime. The client formats the age ("just now", "6 min ago", "3 h ago", "yesterday", "3 days ago", then a date).

## Frontmatter

The chip strip becomes the mock's property grid (as in the peek, lines 495–513): `panel-2`, 12px radius, 14px padding, an 84px `faint` key column and values beside it. References stay links; list values become chips; `tags` become tag chips with their colour ([003](./003-colour.md)). Same filtering (`title`, `okf_version` hidden). The truncation guarantees of task 020 still hold.

## Prose

`.markdown` retuned: 16.5px / 1.72; h2 22px `-0.02em`, h3 18px; paragraph spacing 16px, section spacing 36px; `text-wrap: pretty`; strong in `fg`; code on `panel-2`, pre on `panel-2` with a `line` border and 12px radius; tables in a `line` border with a `panel-2` header; blockquotes and callouts on the new tokens. Syntax colours kept, re-checked against the new backgrounds.

## Links to / Linked from

Replaces the Backlinks section. A top-bordered two-column grid (`auto-fit, minmax(260px, 1fr)`):

- **LINKS TO · N**: the entry's resolved, in-bundle outgoing links, deduplicated by target, in body order.
- **LINKED FROM · N**: its backlinks, deduplicated by source.

Each row: a 7px dot in the target's group colour, the title, the group label in `faint`, `fg/5` hover, bleeding 10px into the gutter. Each honours `destination`, so on a board they open cards. An empty column says "Nothing yet" rather than vanishing, so the grid does not reflow between entries.

## On this page

A 200px sticky column, top 48px, beside the article when the reader has room for it (see "Revised after use"), the entry has two or more h2/h3 and no peek is open: `ON THIS PAGE`, then each heading as a 13px button on a `line` left rule, h3 indented, the one in view marked with an `accent` rule (an IntersectionObserver over the headings), click scrolls the view to it and sets the hash.

**Tests:** meta counts and dedup; the TOC's threshold, contents and scroll target; the property grid's link and tag chips; links honour `destination`; print still hides the toolbar and TOC. Server: `updated` from git for a clean tracked file, mtime for a dirty or untracked one, mtime outside a repository.

## What building it settled

- **"Updated" is the engine's `SortTime`** (a frontmatter `timestamp`, else the file's mtime), decided with the user over the git-commit rule this task first proposed. One rule, the one `wiki` sorts by, and cheap. Known limit: a clone, checkout or pull rewrites mtimes, so what it touched reads as changed "just now". A git-aware rule is wanted **upstream**, in the engine. Server test covers a curated timestamp, a date-only one, an unquoted YAML date, and the mtime fallback, in both the tree and the entry.
- **The title is hoisted.** When the body opens with an ATX `# Heading`, that heading becomes the page title above the metadata, and its line is *blanked* (not removed) in the body handed to `Markdown`, so every checkbox and heading keeps its source line. It keeps its anchor id. A setext H1 is left alone, since blanking one of its two lines would leave the underline to render as a rule.
- **An opening H2 no longer suppresses the title.** It is a section, and the entry's title goes above it. Only an opening H1, or a first line that says the title in prose, still means "already named". With the title leading the page, the old rule would have given an entry that opens on a section no title at all.
- **The toolbar replaced the floats** and everything written to keep them from covering content. Its tests replaced the float-era ones.
- **`useBundle()` context** (`ui/src/bundle.tsx`) for the bundle and tree, so group chips, link rows and tag colours work at any depth, including inside cards, without threading props.
- **`useMedia()`** (`ui/src/media.ts`) is live, not read once at load; [017](./017-mobile.md) reuses it. A happy-dom bug surfaced here: a media listener's remembered state starts `false` whatever the query says, so one added while the query matches never hears it stop. The test mounts narrow and widens after, which works in both happy-dom and browsers. The production hook is correct as written.
- **`IconButton` gained `active`**, rather than taking a colour class that would fight its own `text-muted` by stylesheet order.
- **"Links out" counts entries**: in-bundle body links that exist and are not files, plus frontmatter references, each target once. It is the same set the footer lists.
- **The links footer does not print.** Like the rest of the navigation, a list of links on paper goes nowhere. The old Backlinks section used to print.
- **Palette note, for the user**: two of the reference's eight hues, `#FF6FA8` and `#FF5C7A`, read as nearly the same pink side by side (seen on tags). Not changed; raised.

## Revised after use (2026-09-30)

- **Properties fold on the page.** They start as one line of their values ("todo · high · ● feature ● ui · 2 blockers"), with a chevron that opens the full grid, and the choice is remembered per bundle (`reader:properties`). They are not folded in a card's sheet, where the board's Status/Lane controls live. The grid is tighter everywhere (`gap-y-1.5`, `p-3`).
- **Pointing at folded properties floats them.** The full grid appears as an overlay under the summary line, over the text, so nothing reflows as the pointer passes. It folds 200ms after the pointer (or focus) leaves. A click on the summary still pins it into the page, which is also the way in on a touch screen. The delay and the enter/leave/focus handling are `ui/peek.ts` (`usePeek`), shared with the graph legend's fold ([011](./011-graph.md)).
- **Wide means wide.** The "paragraphs hold at the measure" rule is gone. It made wide look like a button that did nothing on an entry of prose. On top of that, with "On this page" beside it, the article had no room to grow anyway (about 770px available of the 1040px asked for at 1440px with the tree open).
- (Superseded by the heading map, below.) **"On this page" makes way.** It is a column only when the reader has room and the page is not wide. Otherwise it is a toolbar button with the same list as a popover, which closes on choosing a section, on Escape and on a press outside. Width is now a hook (`useWidth`), so the reader knows which it is.
- **The reader lays out by its own room, not the window's.** A window-width rule could not know whether the tree panel was open. With it open, the article stopped growing at a 1140px window while the wide button went on offering nothing, and at 1180px "On this page" arrived and squeezed the article to about 512px. Closed, the article sat capped with empty margins from 872px until 1180px. The reader now measures its own area (`useInlineSize` in `media.ts`, a `ResizeObserver`):
  - **Wide is offered only when the article is capped**, when the area is wider than the reading width (`READING`). Below that, which covers phones, tablets and a small window with the panel open, it would change nothing, so the button goes. A wide choice is kept, and the button comes back pressed when there is room again.
  - (Superseded by the heading map, below.) **"On this page" arrived the moment it fit** beside a full-width article (area ≥ `READING` + `CONTENTS`: the column and its 48px gap), so the article never shrinks to make way. Between the two the article is capped and centred, and the contents are the toolbar popover. That band is the smallest one possible without the article jumping.
  - `READING` is written in `EntryView.tsx` and in `index.css` as `--column-width`. `tokens.test.ts` holds the two together.
  - The test DOM has no layout and its `ResizeObserver` never reports, so `test-setup.ts` installs one that reports what a test tells it (`resize`). Checked in a real browser at 800–1500px with the panel open and closed.
- **A narrower reading width: 680px** (about 80 characters of prose at 16.5px), from the reference's 720px (about 85, past the comfortable 60–75). The contents column is 180px, from 200px. Together the column now arrives at a 908px area, 60px sooner, which is a 1328px window with the tree panel open and 1060px with it closed. Wide stays 1040px, so it does more.
- (Superseded by the heading map, below.) **The contents button peeked.** Pointing at it shows the list, and it folds 200ms after the pointer leaves, like the properties. A click keeps it open (also the way in on a touch screen). Choosing a section closes it, and `usePeek`'s new `dismiss` keeps it closed until the pointer has left, so it does not stay open under the click that chose.
- **The toolbar order stays** wide, read later, print (the contents button has since become the heading map). What comes and goes with the room is on the left, so read later and print hold their place at the right edge as the window resizes.
- **A heading map replaces "On this page"**, as in Notion. The column, the toolbar button and its popover are gone, and so is the rule for when the column fits (`CONTENTS`). The map is a short line per heading, fixed in the page's right margin and centred in the view. The line for the section being read is in the accent, and deeper headings get shorter lines. It needs no room of its own, so it is there at every width, wide pages and phones included. It lists h1 to h3, less the heading that became the page title, with depth counted from the shallowest one listed.
  - **Resting on it** (120ms) floats the titles to the left of the lines. The title under the pointer is lit (`fg` on `fg/5`), and so is its line. The one being read is `accent-ink`.
  - **A click on a line** while the map is closed opens it and keeps it open, rather than jumping, since a line says nothing until its title shows. That is also how a touch screen opens it. Choosing a heading lets go of the click's hold, and the titles stay while the pointer is on the map (found by the user: hiding them under the pointer made the map disappear mid-use). Escape puts it away until the pointer has left, which is what `usePeek`'s `dismiss` is for. Keyboard: a visually hidden "On this page" button, and focus opens it.
  - With many headings the lines give way to each other (9px down to 3px) within 60% of the view's height.
- **Properties open after a 100ms rest and close 30ms after the pointer leaves**, as the user set. Passing over them on the way to the text no longer opens them. Focus opens them at once. `usePeek` takes `openAfter` and `closeAfter` per surface: the properties 100/30, the map 120/150, and the graph legend 0/200 (unchanged).
- **Test pitfall**: when an `expect` fails on a happy-dom element (`toBeNull` on a found node, `toEqual([])` on a list of them), bun's pretty-printer walks the DOM and the run is killed for memory, silently and with no report. Assert on counts, attributes or text instead. It surfaced here as a full run that died with no output.
- **`usePeek` tracks the pointer and keyboard focus apart**, and closes only when neither is inside. Focus given by a click is not counted (`:focus-visible` tells them apart). This fixes the map vanishing under the pointer after a click, which the user found: the click focused the link, following it handed focus on to the page, and that blur was taken as leaving. The test DOM treats every focus as keyboard focus, so the click half of the rule is checked in a real browser only. The pointer half is pinned by test.
- **No dead gap under the summary.** The float's 4px gap was margin, outside the area, so a slow pointer on its way down to the grid left the area and the float closed under it (found by the user). The gap is now padding on the float's wrapper, inside the area. Checked in a browser by moving down 1px every 50ms, slower than the close: it never closes.
- **An empty property says nothing**, rather than the word "null". A key with nothing after it (YAML's null), an empty string and an empty list have no values: they are left off the folded line, and the grid shows the key with a faint "(nothing)", the word the filter chips use for an empty value. A `null` inside a list is dropped too. Found by the user in a board screenshot ("todo · medium · null").
