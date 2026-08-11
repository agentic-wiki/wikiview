---
type: task
title: "mark entries that changed since you last saw them"
status: done
priority: medium
tags: [feature, reader]
blockers: [/3-reader/005-markdown-and-checkboxes.md, /3-reader/002-per-bundle-ui-state.md]
---

An agent edits this bundle while it is open. Right now the screen quietly updates and the tree gives no sign, so a change you were not looking at is a change you never learn about.

A small mark — a dot on the entry in the tree, on the folder containing it, and in the palette — that clears when you open it.

## What "seen" means

**Seen is a property of a person and a browser, not of the bundle.** It belongs in [per-bundle UI state](./002-per-bundle-ui-state.md) alongside the rest, keyed by bundle id. Writing it into the files would put one reader's attention into everyone's repository, and into git.

**Per entry, not per bundle version.** The store's version moves when *anything* changes; marking every entry unseen because one of them was edited would make the mark meaningless within a day.

## What the server has to say

The version alone is not enough: it says *something* changed, not *what*. The reader would have to diff two trees to find out, which is the client rederiving something the server computed and threw away.

So a rebuild should report which entries changed. The store already digests every entry to decide whether the version moved; that digest is per entry before it is combined, so the comparison costs nothing extra — it is the intermediate value being discarded today.

That suggests a shape: keep the per-entry digests from the last build, and have `Rebuild` return the paths whose digest differs. Added, removed, and modified are all the same question asked of two maps.

## Decisions worth making before building

- **Does opening an entry clear it, or does looking at it?** Opening is unambiguous and easy to explain. "Looking" needs a scroll or dwell heuristic, and a mark that clears without you doing anything is worse than one that stays.
- **Does a folder show a count or a dot?** A dot says *something* inside changed; a count says how much. A count also has to be recomputed as descendants clear, and a wrong count is more annoying than no count.
- **What happens on first load?** Everything is technically unseen. Marking the whole tree on first open would be noise, so the initial state is "all seen" — the mark means *changed since you were here*, not *unread*.
- **How long is history kept?** Storing a digest per entry per bundle grows with the bundle. Storing a single timestamp per entry is smaller and enough for "changed since", which is all this claims.

**Acceptance:** an entry edited on disk while the app is open is marked in the tree; the folders above it are marked; opening it clears the mark; a change made through the UI (a checkbox) does not mark anything, since the person doing it plainly saw it; nothing is written to the bundle.
