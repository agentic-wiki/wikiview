---
type: task
title: "dismiss a changed entry without opening it"
status: done
priority: medium
tags: [feature, reader, ui]
blockers: [/3-reader/017-changed-and-queued.md]
---

The recently-changed page loses a row when you open the entry, because opening is what marks it seen. But some of what changed is not worth opening: you can see from the row that it was a title tweak, or an entry you do not care about, and the only way to clear it today is to open it anyway.

So: an X on each row that marks it seen where it stands, the way opening would, without navigating.

## What it does, exactly

Marks that one entry seen at its current `changedAt`. That is the same write opening performs, so a row cleared this way and a row cleared by reading are indistinguishable afterwards, which is the point: there is one notion of seen, and this is a second way to reach it, not a second kind of dismissed.

The row leaves the list on the next render, like any other. No reflow problem here that there was not already: this page is not a panel, and a row vanishing from a page you are looking at is the behaviour it already has when you open one.

## What to decide

- **A "mark all seen" as well.** After a `tidy --all` the list is thirty rows you have already accounted for by other means. One button that clears the lot is the obvious companion, and it is the more dangerous one: it clears things you have not looked at, so it wants a way back, or at least a count in its label so it is not a blind sweep. Worth deciding whether it ships with the per-row X or waits for a second ask.
- **Undo.** Seen is a number, and the number it was before is knowable for as long as the row's data is in hand. A tap-to-undo on the row that just left, for one render, costs little and turns a misclick from "hunt for the entry and re-open it to re-mark it" into nothing. Might be over-building; noted rather than assumed.
- **The X on a queued entry.** An entry can be on this list and in read-later at once. Dismissing it from *changed* must not touch the queue: they are different lists answering different questions, and one X clearing both would be a surprise.

## The seam it needs

`useSeen` exposes `markSeen(path)`, which is what opening calls. This is the same call from a button, so nothing new in the model. The only new thing is a control on a `Row`, which already takes an `action` slot (added for read-later's remove button).

**Acceptance:** each row on the recently-changed page has a control that marks that entry seen without navigating; the row then leaves the list exactly as it would after opening; the entry's read-later state, if any, is untouched; and the marks in the tree agree, because it is the same seen.

## What building it settled

The control is a tick, not an X: it means "I have accounted for this," which is the act reading performs, where an X would imply deleting the entry. It calls `markSeen`, the same function opening calls, so there is no second kind of dismissed and the tree, the list and a reopen all read one state. It touches seen alone, which is what keeps a dismissed-here entry saved in read-later: they were never the same store.

The "mark all as seen" companion shipped, because after a `tidy --all` the per-row X is thirty clicks. It carries its count in its label rather than being a bare "clear," since it dismisses things you have not looked at and the number is the warning. It needed one new seam, `markManySeen`, which writes the whole set in a single update rather than a loop of them, so the list does not re-render per entry.

Undo did not ship. Seen is a version number, so the value before a dismiss is knowable, but a tap-to-undo is a second interaction for a mistake that costs a search-and-reopen to fix, and that trade did not earn its code yet. Recorded rather than built.
