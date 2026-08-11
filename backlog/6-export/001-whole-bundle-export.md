---
type: task
title: "one document from many entries"
status: todo
priority: low
tags: [feature, export]
blockers: [/3-reader/010-print-view.md]
---

A bundle read one entry at a time is a website. A bundle as a single document is something you can hand to somebody, archive, or read on a train: the whole knowledge base, in order, with a table of contents.

Same mechanism as [printing one entry](../3-reader/010-print-view.md), pointed at many: a route that renders entries into one long document, printed by the browser. What this task owns is everything that only becomes a question once there is more than one entry on the page.

## Where it runs

In the client, rendered by the same markdown pipeline as the reader.

The alternative is generating a PDF server-side, and it fails on the same point twice. A headless browser is a hundred megabytes in a release archive that currently holds one static binary. A Go PDF library needs a Go markdown renderer, which is a second implementation of rendering — the thing [resolving on the server](../3-reader/003-resolve-server-side.md) removed `goldmark` to avoid. An export that quietly disagrees with the screen about how a table or a task list looks is worse than no export.

The server's job is smaller: hand over many entries in one response, in order. A print route that fetches five hundred entries one at a time is a bad idea in a way that has nothing to do with rendering.

## Order

Reading order, which is not quite the tree's visual order.

The tree draws folders above the files beside them, because a folder is a thing you open. A document wants the opposite: a folder's own `index.md` first, since that is the front door and usually says what the folder is, then the rest of its entries, then each subfolder in turn. Depth-first, index first.

Within a folder, entries sort by path, which is already what makes `001-`, `002-` prefixes work — the ordering people encode in filenames is honoured without a second convention for it.

## The problems that only exist in one document

- **Heading ids collide.** They are unique per entry, not per document; two entries with a `## Notes` produce the same id and every link to either lands on the first. Ids need namespacing by entry path, and every internal link rewritten to match.
- **Internal links must become fragments.** `/wiki/notes/a.md` is a route, and a route in a PDF is dead. A link to an entry that *is* in the document becomes an anchor to it; a link to one that is not has to degrade to something honest rather than a broken jump.
- **Every entry starts a page** (`break-before: page`), or entries run together and the document reads as one enormous note.
- **A table of contents** is the reason to do this at all rather than printing entries one by one. Generated from the same order, with links that work as fragments.

## Scope, before it eats a browser

Rendering five thousand entries into one DOM will not end well, and "the whole bundle" is rarely what anyone means. A subtree is: *this folder and everything under it*, which is also how someone would describe what they want out loud. Worth starting there, with a `--where`-style filter later if it is asked for.

Whether this needs a bulk endpoint or the existing one called in parallel is a measurement, not a decision to make up front.

**Acceptance:** a route renders a folder and its descendants as one document in reading order, with a table of contents; internal links between included entries jump within the document; heading ids are unique across it; each entry starts on a fresh page; the browser's print dialog produces a PDF that matches what the reader shows.
