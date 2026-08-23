---
type: task
title: "a long frontmatter value hides the entry's buttons"
status: done
priority: medium
tags: [bug, reader, ui]
blockers: [/3-reader/007-frontmatter-display.md, /3-reader/010-print-view.md]
---

An entry whose frontmatter holds a long text value renders that value as one wide chip, and the chip slides under the print and read-later buttons floated in the top-right corner, covering them. They are still there and still clickable in theory, but a value is painted over them, so in practice they are gone.

## Why it happens

The buttons are floats with nothing to attach to (see [010](./010-print-view.md)), so they sit in the corner and content flows around them. The frontmatter strip is a `flex-wrap` container, which steps aside from a float as a block, but a single chip cannot wrap inside itself: a value with no break opportunity is one unbreakable box, and an unbreakable box wider than the space beside the float overflows into the float's column rather than moving below it.

So the fault is not the float and not the strip. It is that a chip has no maximum width and no way to shed length, so a long value is rendered at full width wherever that width lands.

## The fix

A chip's value gets a ceiling and an ellipsis: a `max-width`, `truncate`, and the full text in the `title` so nothing is lost, only shortened on screen. That is what the tree, the breadcrumb and the card already do with names too long for their space, so it is the app's existing answer to "this text is longer than its slot," applied to the one place that does not use it yet.

A resolving value is a link and a plain value is text, and both can be long, so the ceiling belongs on the value regardless of which it is. The key is short by nature and needs none.

## What to check while there

- **The chip vs. the float specifically.** Truncating the value fixes the overlap only if the chip then fits beside the float or wraps below it. Worth confirming the ceiling is small enough that a single very long chip lands under the buttons rather than beside-and-under them.
- **A long *key*.** Conventionally short, but nothing enforces it, and a pathological key wants the same treatment rather than being the new thing that overflows.
- **Many short values.** A list-valued field renders several chips; `flex-wrap` already handles that, and truncation must not turn a set of short chips into a set of ellipses. The ceiling is a maximum, not a fixed width.

**Acceptance:** an entry whose frontmatter holds a very long value renders it truncated with the full text on hover, the print and read-later buttons stay visible and clickable, and an entry with several short values still shows them in full.
