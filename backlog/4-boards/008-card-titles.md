---
type: task
title: "cards show the entry's title, not its filename"
status: todo
priority: high
tags: [bug, boards]
blockers: []
---

A card's title is taken from the filename today, even when the entry has a `title` in its frontmatter or a heading at the top of its body. The filename is a fallback, not a source — and when the entry says its own name, the card should say it too.

## What it should resolve to

**Prefer the title the entry gives itself.** The order is: a `title` in the frontmatter, then the first heading in the body, and only then the filename with its extension and number stripped. A task called `004-moving-a-card.md` whose frontmatter says `title: "drag a card into another column"` should read "drag a card into another column" on the board, not the filename.

**The reader already does this.** The entry view resolves a title by exactly this precedence, and the frontmatter is already displayed there. The board is the one place that skips the resolution and falls straight to the filename — so this is likely the board reaching for the name the wrong way rather than a missing rule.

## Why it matters

The filename is an id and the title is a label, and a board is a wall of labels. When every card reads like a filename, the board stops saying what its cards are about and starts saying what they are called.