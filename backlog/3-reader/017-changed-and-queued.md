---
type: task
title: "two lists: what changed, and what you queued"
status: todo
priority: medium
tags: [feature, reader, ui]
blockers: [/3-reader/004-ui-shell.md, /3-reader/008-unseen-changes.md]
---

Two questions the reader cannot answer today:

- **What changed under me?** An agent edits this bundle while it is open. The tree marks what moved, but a mark is only an answer where you are already looking: after a `tidy --all` across thirty files, a folder dot says "something in here moved" and you open folders until you find them. The tree turns a digest into a hunt.
- **What did I mean to come back to?** An entry you find while looking for something else, that plainly matters and that you cannot read now. There is nowhere to put it, so you either stop what you are doing or you lose it.

One task, because deciding where each of them lives is one decision. They do not get the same answer.

## The rule that decides where a list lives

**A list whose rows survive being clicked belongs beside your work. A list whose rows are consumed by being clicked belongs in the view area.**

Opening a changed entry marks it seen, so its row leaves the list. In a left panel that is a broken handle: the thing you clicked disappears from under the cursor, the rows below jump up, and the next click lands on something you did not aim at. In the view area nobody sees it happen — you left the page. Coming back renders the list as it now stands, minus what you read, which is the honest answer and the one you expect.

A queued row is not consumed. It stays until you remove it, so the panel is stable, and the panel is also where it wants to be: you are reading A *while knowing* B and C are waiting. Triage is a moment you go to; a queue is a companion you keep.

Same rule, applied elsewhere as a check: [search](./016-search.md) results survive being clicked, so the panel stays the right home for them.

## What changed: a page, shaped like a folder listing

A route, so it has an address, back and forward work, and ⌘K can reach it. Rendered with the same row model as a folder with no `index.md` — icon, the entry's name, its own title underneath when it says something the filename does not, and something on the right where a folder listing puts the type. Ordering is newest first.

`FolderView`'s `Row` is already the right component and takes `to`/`icon`/`title`/`subtitle`/`meta`. Extract it and share it; do **not** synthesize a `TreeNode` for a folder that does not exist, which would put a fabricated path into links and breadcrumbs.

It stores nothing new. `useSeen` already returns `unseen` and `changedAt`, so this is a rendering of state the app holds, and it empties itself as you read. Its empty state — nothing has changed since you were last here — is a real answer rather than an apology.

Ordering is free; wall-clock is not. `changedAt` is a bundle version, not a time, so "newest first" is exact and "four minutes ago" is unavailable without the API carrying something it does not carry today. Say the order, not the time.

**The alternative considered and rejected:** keep it in the panel and stop consuming rows — the mail-client model, where a read row stays and only loses its emphasis. That needs a second notion of seen, session-scoped and unversioned, sitting beside the versioned one the bundle actually has. Two definitions of "you have looked at this" is a bug waiting for a reason to happen. The page needs no new state at all.

## What you queued: a panel list

A queue, not favourites. A queue is consumed and emptied, so what is in it is what you still owe yourself; favourites only grow, and a shelf that only grows stops being read. Only one of the two is missing here: a wiki already answers "somewhere I go back to often" with the tree, links, breadcrumbs and ⌘K, while "this matters, but not now" is answered by nothing.

Add, open, remove. Opening does not remove — that is the whole difference from the other list — so removal is a control on the row. Ordered by when it went in, the only ordering the queue itself knows.

Personal, so `localStorage`, per bundle, through `useBundleState`, alongside `seen`, which settled this question already: what one person owes themselves is not a property of the bundle, and writing it into the files would put one reader's attention into everybody's repository and into git. The cost, stated plainly: an agent cannot see this list, `wiki list --where` cannot query it, and clearing site data loses it. Acceptable for a personal queue, and none of it would be acceptable for a shared one — a shared read-later is a different feature with a different store, a frontmatter field, queryable from the CLI, and somebody else's queue in your diff.

Stored as JSON under one key, which is what `state.ts` prescribes for a value that is genuinely a list: these are paths, and paths hold whatever filenames hold.

## The rail

Four icons: Entries, Boards, Changed, Queued. Two questions, two icons, because one icon holding both lists would need a switch inside the panel and the switch would be the thing you clicked twice on every visit.

The Search icon comes out at the same time, ahead of the feature. It has been permanent chrome answering a click with an apology, and a gap is better than an apology beside three icons that work. It returns when search does — see [016](./016-search.md).

That leaves the rail with one section of a kind it has not had: a route with no panel behind it. `Shell.pick` currently does two things — navigate when there is somewhere to go, toggle the panel when there is not — and a repeat click on Changed has no panel to toggle. That function has been wrong twice already, both times by tangling navigation with panel state, so the third case gets written deliberately rather than discovered.

## Decisions left

- **One mark vocabulary.** The tree already carries the unseen dot. A queued mark next to it must be a different shape, not a different colour, or the two compete and neither reads at a glance. An entry that is both is the case to design for.
- **Where the queue toggle is.** The entry header is obvious. The card sheet needs the same control or a board is a place where nothing can be queued. The palette too, if it can be done without a modifier nobody discovers.
- **Coming back to a shorter list.** Scroll restoration puts you where you were, and the page you return to is one row shorter than the one you left. Probably fine, possibly a jump worth pinning to the top instead.
- **An entry that stops existing.** Paths go stale, the same problem search has. A queued item silently dropped looks like the queue lost something; shown as missing, unopenable and removable is honest and costs one branch. The changed list does not have this problem, since it only ever lists what the tree currently holds.

## The blind spot both lists inherit

A deleted entry is invisible. `seen` collects paths from the tree, so an entry that is gone is absent rather than reported, and "deleted while you were not looking" is the one change neither list can show. Already true of the marks shipped today. Worth knowing before either list is described to anybody as "what changed", and worth its own task if it matters.

## The argument against the queue

The browser already has it. A bookmark is read-later, it survives a cache clear, it works across every tool, and now that the document title names the entry and its bundle, a bookmark of one finally has a usable name.

What a bookmark cannot do is sit next to the entry in the tree, follow a bundle that moves, or know that what you queued has changed since you queued it — and that last is free here, since `changedAt` is on every entry. If the built queue does not do those three things, the bookmark is better and it should not exist. None of this applies to the changed list, which has no equivalent anywhere.

**Acceptance:** a route lists what changed since you last looked, newest first, using the same row model as a folder listing, with an empty state that says so; opening one entry from it does not reflow a list under the cursor; an entry can be queued and unqueued from the reader and from a card, the queue survives a reload without leaking into another bundle, opening a queued entry leaves it in the list, and each row can be removed from the row; a queued entry and an unseen one are distinguishable in the tree at a glance, including on the same row; the rail carries four working sections and no dead one.
