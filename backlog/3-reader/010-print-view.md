---
type: task
title: "print the entry you are reading"
status: todo
priority: medium
tags: [feature, reader, ui]
---

Every browser on every platform already turns a page into a PDF, and everyone already knows ⌘P. What is missing is a page worth printing: today that means the rail, the panel, the breadcrumbs and the omnibar burned into the paper around a column of text.

So this is a stylesheet, not a feature. `@media print` in the one place the shell is described, and the existing markup does the rest.

## What print hides, and what it does not

Everything that exists to navigate goes: the icon rail, the tree panel, the omnibar, the theme toggle. They are ways to reach other pages, and paper has none.

The breadcrumb stays, as text rather than links. On screen it says where you are; on paper it is the only thing identifying which entry this sheet came from, and it reads naturally at the top of a printed page.

Backlinks stay too, unless they turn out to be noise. They are the part of an entry a reader cannot reconstruct from the text, which is exactly the argument for keeping them on a copy that has no index behind it.

## Details that decide whether it looks printed or dumped

- **Ink, not theme.** Black on white whatever the screen is set to. A dark-theme page printed as-is wastes a cartridge and is unreadable in the bargain.
- **Nothing splits across a page break** that reads as one thing: a code block, a table row, a heading stranded at the foot of a page (`break-inside: avoid`, `break-after: avoid` on headings).
- **Link destinations.** The classic `a[href]::after { content: " (" attr(href) ")" }` is right for an article and wrong here: a wiki entry is dense with links, and every one would grow a bundle path mid-sentence. Probably only for external `http` links, where the URL is genuinely unrecoverable.
- **Checkboxes print as boxes**, ticked or not. They are content, not controls.
- **The frontmatter strip** stays, flattened to a line. It is the entry's metadata and a printed copy without a status is less useful than one with it.

## Why not generate the PDF on the server

It would mean a headless browser in the release archive, or a PDF library fed by a Go markdown renderer. The second is the one that matters: [resolving on the server](./003-resolve-server-side.md) settled that this repo renders markdown in exactly one place, and adding a second renderer to produce a different-looking artefact is precisely the drift that decision exists to prevent.

**Acceptance:** ⌘P on an entry yields a page with the entry, its breadcrumb and its metadata, and nothing else; a code block does not split across pages; the output is legible printed from a dark-theme browser; no route, no button and no dependency was added to get it.
