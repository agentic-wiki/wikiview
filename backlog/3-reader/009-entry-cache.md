---
type: task
title: "keep entries already read, and refresh them behind what is shown"
status: done
priority: medium
tags: [feature, reader, api]
---

Every navigation is a round trip today, so there is a window with nothing correct to show. The reader keeps the outgoing entry on screen through it, which holds the layout together and lets a back navigation land on the position it was left at, but the content under the new address is the wrong content until the fetch lands.

Keep what has already been read, render it at once, and fetch behind it.

## Two questions that look like one

**"Is there anything to show right now?"** is about latency. It is answered by a copy taken on the way past, and it is wrong for at most one round trip.

**"Did the file change?"** is about truth. It is answered by the version on the event stream, and it is already answered today.

Conflating them produces the usual cache: a guess about freshness with a timeout attached. Kept apart, neither needs a heuristic.

## The version makes revalidation exact

The bundle's version is a digest of its content, so it moves when and only when something on disk changed. Store it with each copy and the comparison stops being a guess:

- Version unchanged since the copy was taken: no file changed, so the copy *is* current. Nothing to fetch.
- Version moved: something changed, though not necessarily this entry. Show the copy and refresh it.

Most navigation in a session happens with a still version, which means most of it should involve no request at all.

## Decisions worth making before building

- **Swapping in a refresh must be invisible when nothing differs.** Replacing state with an equal value re-renders for no reason, and this is the reader's most-trodden path. Compare before setting, and the common refresh becomes a no-op rather than a repaint.
- **What a stale copy is allowed to look like.** A spinner over readable content is worse than the content: it says "do not read this" about something correct. Nothing, or a mark small enough to ignore.
- **A write updates the copy.** Ticking a checkbox already updates what is on screen optimistically; if it does not also update the stored copy, navigating away and back shows the box unticked until the refresh lands, which reads as the write having failed.
- **What bounds it.** One entry per entry visited, so it is bounded by browsing rather than by bundle size. Worth a cap only once a session can plausibly hold enough to matter, and worth measuring before guessing where that is.

## Where it meets the rest

[Marking entries that changed](./008-unseen-changes.md) needs the server to report *which* paths changed on a rebuild rather than only that something did. That is the same information this needs to stop dropping every copy whenever any file moves, so building that one first makes this one a smaller change.

Scroll restoration retries when the position it is applying does not fit the height on screen, which is what happens when the entry being returned to has not rendered yet. A copy rendered on the same commit as the navigation fits on the first attempt, so the retry stops being the normal path and goes back to being the fallback it reads as.

**Acceptance:** returning to an entry read earlier in the session renders it in the same frame as the navigation, with no request when the bundle's version has not moved since; a refresh that finds nothing different causes no re-render; a checkbox ticked, navigated away from, and returned to is still ticked; an entry read before a file changed on disk is refreshed rather than trusted.

## Done

A `Map` from path to `{entry, at}`, read *during render* rather than in an effect: that is what puts a revisited entry on screen in the same commit as the navigation instead of a frame later. A module rather than React state, because it has to outlive the component between navigations and nothing renders from it directly.

**The freshness check is per entry, not per bundle**, which [marking entries that changed](./008-unseen-changes.md) had already paid for: the tree reports the version each entry's content last moved at, so `at >= changedAt` is exact. A copy taken at a later version *is* the file — not probably, exactly — so there is no timeout here and no guess.

That distinction turned out to matter more than the round trip it saves. The case a bundle is actually open in is an agent editing it continuously, and a bundle-wide check would refetch whatever you were reading every few seconds because *something else* moved. Per entry, an edit elsewhere costs nothing.

**Two things fell out of it rather than needing building.** Comparing before setting — listed above as a decision — is unnecessary: the only thing that triggers a fetch is that entry's `changedAt` having moved, and that only moves when the content did, so a fetch that finds nothing different cannot happen. And an unknown `changedAt`, for a path the tree does not list, is never treated as current: not knowing is a reason to ask rather than to trust.

**The write path needed the same copy.** `toggle` keyed off the fetch's own state, which is not set when the entry came from the cache — so the first thing this broke was ticking a checkbox on a revisited entry. It reads the shown entry now, whichever it came from, and keeps the optimistic result: without that, navigating away and back renders the copy taken *before* the tick and reads as the write having failed.

**Unbounded on purpose.** One copy per entry visited, so it is bounded by browsing rather than by bundle size. Worth a cap when something measures one that hurts.
