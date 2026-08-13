---
type: task
title: "search, or the icon that promises it"
status: todo
priority: high
tags: [feature, reader, ui]
blockers: [/3-reader/004-ui-shell.md]
---

The rail has a Search icon. Clicking it opens a panel that says "Search is not built yet."

That is the worst of both: a control that looks like every other control, sits in permanent chrome, and answers a click with an apology. Either it does something or it goes.

## What it would be, if it stays

**Not the omnibar.** The omnibar already finds an entry by its name and takes you to it, and a second thing that does the same in a wider box is one problem with two solutions. Search is the other question: which entries *say* this, and where in them.

So: full text over entry bodies, results as a list beside your work rather than a jump target. A result is a path and the line the match is on, and clicking one opens the entry at it. The panel is where results live because they are something to work through, and a palette that closes when you pick from it cannot be worked through.

Frontmatter is searched with the body, since `blockers: /3-reader/004-ui-shell.md` is exactly the kind of thing worth finding by typing part of it.

## What to decide before writing any of it

- **Server or client.** Every entry's body already crosses the wire one at a time; a bundle small enough to hold in a browser is a different tool from one that is not. Leaning server: the index is already there, already rebuilt on change, and already the thing that knows what a version means. It also keeps the payload proportional to the results rather than to the bundle.
- **Substring or terms.** Substring is what people expect from ⌘F and needs no index. Terms give ranking, and ranking only matters once results run past a screen.
- **What happens to a search when the bundle changes underneath it.** Results carry paths, and a path can stop existing while you are reading its match.

## The other option

Delete the icon and the section. The omnibar covers finding a known entry, which is most of what a wiki of this size is for, and a rail of two icons is not worse than a rail of three. Nothing else in the app depends on the section existing.

This is the cheaper answer and it is not obviously the wrong one. What it costs is the one thing the omnibar cannot do: finding the entry whose name you do not know.

## Half of it is being taken

The icon and the empty section go now, ahead of any decision about the feature. [017](./017-changed-and-queued.md) puts two sections in the rail that do something, and an apology sitting beside three icons that work is worse than a gap where a fourth would be. The feature stays wanted and stays here.

When it returns it returns to the panel, not to a page: results survive being clicked, and by the rule 017 sets down, a list whose rows survive a click belongs beside your work rather than in the view area. So this task's own reasoning about the panel is unchanged — only the promise in the chrome is being withdrawn until it can be kept.

**Acceptance:** a query returns entries matching their body text with the matching line shown, opening one lands on that line, and the results survive the bundle changing underneath them. (The other half of the old acceptance — the dead icon and section gone from the chrome — is settled in 017 and no longer an alternative to building this.)
