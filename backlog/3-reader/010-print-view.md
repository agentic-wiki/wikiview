---
type: task
title: "print the entry you are reading"
status: done
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

## What a board prints

The task above described the reader and stopped there, which left the two cases that actually needed deciding.

**A board prints as what it says, not as what it looks like.** It is a horizontal thing and paper is a vertical one: printed as laid out, every column past the first is clipped and the result reproduces nothing a reader could use. So the scroller becomes a block, columns lose their width, and it comes out as a section per column with its cards listed under it. That is what a board means anyway — these cards are in this state — and it is the form paper can hold.

**A card open over a board prints the card.** What you are looking at is what prints: the card is the subject and the board behind it is context you are not reading. It is also the only reading that produces a usable page, since a fixed dialog over a backdrop prints as one clipped sheet with a grey rectangle behind it. So the sheet stops being a sheet and becomes the page, and the board is dropped.

## The edge cases, and which of them mattered

Two decide whether printing works at all, and they are the last two anybody would think of:

- **The shell is a full-height flex layout.** Left alone, `height: 100%` gives exactly one page.
- **The view area scrolls itself.** A box that scrolls on screen prints only what is inside it, so a long entry prints the part that happened to be visible. Every scroll container in the shell is released.

The rest are ordinary and settled by one question — is this a control or is it content:

- Gone: the rail, the panel, the omnibar, the theme toggle, the hamburger, the board's Settings button, the card sheet's close and "open in reader", the drag ghost, the settings dialog and its backdrop, the CTA form on an empty board.
- Kept: the breadcrumb, which on paper is the only thing saying which entry the sheet came from; the frontmatter strip; backlinks; the card sheet's path, for the same reason as the breadcrumb.

**A print button, floated.** Every browser already prints and everyone knows ⌘P, but saying so on screen costs one button. It has nothing dependable to attach to — an entry with no metadata has no frontmatter strip, and one whose body names itself has no title element — so it is a real float rather than a position: it attaches to no element at all, and whatever comes first flows around it. Positioned instead, it would need a background to sit on where content ran underneath, which is a smudge on every entry where nothing does.

**Marked in the markup rather than matched by class.** `data-print="hide"` sits on the thing that is a control, because whether something is chrome is knowledge the component has and a stylesheet would be guessing at from Tailwind classes.

**What a test can hold is the markup**, not the rules: which elements are chrome and which are the page. The stylesheet itself would need a renderer to check, and there is none here — the same honest limit as the native drag.

That limit cost a bug immediately. The board *was* marked hidden with a card open, and printed anyway: hiding and the rule that stacks a board for paper are the same specificity and both `!important`, so the one written last won and un-hid it. Guarded with `:not([data-print="hide"])`, and pinned by a test that reads the stylesheet and refuses any print rule that restyles what the print rules hide. Reading CSS as text is crude, and it is the only thing between that bug and a silent return.
