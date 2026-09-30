---
type: task
title: "the entry page, redrawn"
status: todo
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

A 200px sticky column, top 48px, beside the article at viewport ≥ 1180px, when the entry has two or more h2/h3 and no peek is open: `ON THIS PAGE`, then each heading as a 13px button on a `line` left rule, h3 indented, the one in view marked with an `accent` rule (an IntersectionObserver over the headings), click scrolls the view to it and sets the hash.

**Tests:** meta counts and dedup; the TOC's threshold, contents and scroll target; the property grid's link and tag chips; links honour `destination`; print still hides the toolbar and TOC. Server: `updated` from git for a clean tracked file, mtime for a dirty or untracked one, mtime outside a repository.
