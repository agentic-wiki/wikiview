---
type: task
title: "a blocker on a card should open a card"
status: done
priority: medium
tags: [bug, boards, reader]
blockers: [/4-boards/001-board-view.md]
---

Open a card on a board, click one of its `blockers`, and the board is gone: you are in the reader at `/wiki/<path>`, even when the entry you clicked is a card in the column beside the one you came from.

A link in the same card's *body* does the right thing already. It stays on the board when its target is on the board, and leaves for the reader when it is not.

## Why one works and the other does not

A card is `EntryView` in a dialog, and the board passes it a `destination` — "where a link to a bundle path should go" — resolving to `/kanban/<id>/<path>` for anything on the board. `EntryView` hands that to `Markdown`, which uses it for every href in the body.

Nothing else in that view is told. The frontmatter strip builds `"/wiki" + ref.to` itself, and so does the backlinks footer. So one view has three link surfaces and one of them honours the rule.

That is the whole bug. `destination` exists, is correct, and reaches one of the three places that need it.

## What "obey the board" means for each surface

- **Frontmatter references.** `blockers`, `epic`, anything the engine resolved to a path. On the board these are the most likely of all links to point at a sibling card, which is what makes it the surface where leaving hurts most.
- **Backlinks.** Same rule, same reason: "what is waiting on this" is usually another task on the same board.
- **The body.** Already correct, and the shape everything else should copy.

The rule itself does not change: on this board it opens a card, otherwise it leaves for the reader. What changes is that all three ask.

## The shape of the fix

`destination` becomes the view's rule rather than the markdown renderer's argument: `EntryView` defaults it to `"/wiki" + path` and passes it to the frontmatter strip and the backlinks footer as well. The reader passes nothing and behaves exactly as now, which is what keeps this from being a change to the reader at all.

Worth checking while in there: a frontmatter reference whose target does not exist. The engine resolves `blockers` to a path either way, and a chip linking to nothing should read like the body's unwritten links do rather than like a live one.

## Not in this task

The blocked and blocking badges on a card in the column are counts, not links. Making them open the entries they count is a different idea — a count is a glance, and one click behind it would need somewhere to put a list of two or three paths — so it is recorded here and left alone.

**Acceptance:** with a card open on a board, a `blockers` reference to an entry on that board opens that entry as a card and the board stays; a reference to an entry outside the board leaves for the reader; backlinks behave the same way; the reader itself is unchanged; and a reference to an entry that does not exist is distinguishable from one that does.

## What building it settled

**"On this board" meant the wrong thing, and threading the rule everywhere is what exposed it.** The board tested whether a target was one of its *cards*. A folder's `index.md` is not a task, so it is never a card — and it is the front door of the very folder the board is over. Following a backlink to it left the board, which is the report that reopened this. A task the board's `where` excludes had the same problem: `where` decides which entries get columns, not which entries belong to the folder.

So the test is now the folder: a path inside `board.path` opens as a sheet, anything else leaves for the reader. That also covers an entry in the folder that nobody has written yet — it opens over the board and says there is no entry there, rather than throwing the board away to say it. The card set is no longer computed at all.

A board over `/` therefore covers the whole bundle and nothing is outside it. That is the rule holding rather than failing, and the ways out — Escape, "open in reader", the rail — are all already on the sheet.

`destination` is now the *view's* rule with a default of its own — `"/wiki" + path` — rather than an argument that happened to be handed to the markdown renderer. All three surfaces ask it. The reader passes nothing and is unchanged, which is the other half of the rule: staying on the board is the board's business, and the reader has no board to stay on, so a `blockers` chip there goes to the reader as it always did.

Two tests, one per direction, because the interesting thing is that one rule gives opposite answers: a chip whose target is a card on this board opens the card, and a backlink from an entry that is not on the board leaves for the reader.

**The unresolved-reference case needed nothing.** The server only emits a frontmatter reference that resolves to an entry — an unresolved value is deliberately left as ordinary text, on the grounds that a frontmatter field is not a link by nature and marking every `.md`-ish string as broken would put warnings on data that is merely a string (`frontmatterRefs`, `internal/server/entry.go`). So a chip is a live entry by construction, and there is already a test saying values that resolve are links and others are text. The acceptance asked for a distinction that exists one layer down.

**A caching bug hid the fix and cost a round trip.** The folder rule was in the source, in the built bundle and under test, and the running app kept the old behaviour. `index.html` names the hashed JavaScript bundle, so a cached copy of it asks for the previous build's code no matter how many times the binary is rebuilt: the fix is compiled in, served on request, and never asked for.

`static.go` set `Cache-Control: no-cache` on the fallback path — a client route, which is not a file — and nothing at all on the branch that serves `index.html` as a file, which is what a request for `/` does. Its comment already said index.html must never be cached; only one of the two branches did it. Both do now, with a test over both, because this failure mode is invisible from the code that is wrong: everything you can check locally says the fix is there.

Still true, and still not done: the blocked and blocking badges on a card in the column are counts rather than links.
