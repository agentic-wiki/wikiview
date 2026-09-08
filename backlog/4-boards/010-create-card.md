---
type: task
title: "create a new card from the column"
status: todo
priority: medium
tags: [feature, boards, write]
blockers: []
---

A column is a bucket for work at a certain stage, and sometimes the work does not exist yet. "Decide the launch date" or "get design review" — things that are known to be needed but have no file behind them. Today, creating a card means leaving the board, making a file somewhere, giving it the right frontmatter, and coming back. This task is to make the column the place where the card starts, too.

## What it looks like

**A button at the bottom of each column.** "+ Add card" or the equivalent — something that says "new" without borrowing a filename from an entry that already exists. Clicking it opens an inline form in the column itself, not a modal, not a page change. The card appears at the bottom of the column with a text field for its title and rows for the frontmatter it needs.

**The form writes frontmatter.** At minimum: `title` (the card's label), `status` (the column's status, pre-filled), and `type: task`. Optional rows expand on demand — priority, tags, blockers. The form does not ask for everything; it asks for what makes the card useful in the column and lets the rest be empty.

**Saving creates the file.** The entry is written to the board's folder with a numbered filename, its extension, and the given title as frontmatter. The numbering follows the existing convention — the next number after the highest in the folder — so the card sorts correctly without renaming. If the board's folder is `/backlog/4-boards` and the highest number is `009`, the new card is `010-<slug>.md`.

## The file name

The slug in the filename comes from the title, lowercased and spaced reduced: "Decide the launch date" becomes `010-decide-the-launch-date.md`. If that name already exists, the system appends a disambiguator or falls back to a counter — the filename is not the identity the user gave, so it does not have to match the title exactly. The title lives in frontmatter where it belongs; the filename is the id the board needs to hold it.

## Where the content goes

**Into the board's folder, not a subfolder.** A card is an entry in the column, and the column is a view of one folder. The new file goes there, so the board sees it on the next index rebuild without any path mapping. If the board has a `where` filter that excludes certain types, the form pre-fills the field that matters — `type: task` for a board that filters `type=task`.

**Not a draft, not a template.** The file is a real entry from the start. It has frontmatter and an empty body. Opening it from the board gives the reader the same empty entry that a user-created file gives — nothing special about its origin. This is the point: a card created from the column is an entry that just happens to have started in a column.

## Why it matters

The board is where you see what needs to happen, and sometimes seeing it is the moment you realize something is missing. Having to leave the board to create the thing you just noticed is a friction that turns "I should make a task for that" into "I'll remember it later." The column is where the work lives; the button is how it gets there.
