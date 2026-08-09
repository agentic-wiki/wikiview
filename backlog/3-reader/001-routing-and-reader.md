---
type: task
title: "the reader: URL routing, history, and the kanban toggle"
status: todo
priority: high
tags: [feature, ui]
blockers: [/1-design/001-design.md]
---

**A markdown reader by default.** Serving a bundle opens on its front door (`index.md`), and the board is one of the views you can switch into, not the thing the server is for.

## URLs

Real routes, not hash fragments, so history, deep links, and the back button all work the way a reader's should. The SPA fallback already serves any non-`/api` path.

```
/                          → the bundle's front door
/wiki/notes/design.md      → the reader, on that entry
/kanban/backlog            → a board over that folder
/api/…                     → reserved
```

The bundle path is carried verbatim, `.md` and all, consistent with the rule that **bundle paths are the identity everywhere**. No collision to design around: only `/api` is reserved at the root, and a bundle folder named `wiki` or `kanban` reads unambiguously one segment in.

**Query strings carry view state**, as filters already do: `/kanban/backlog?where=status!=done&q=milk`. Route says *what you are looking at*, query says *how*.

## Following a link

- To an entry **on the board you are viewing** → open that card. The board keeps its context.
- To **any other entry** → leave the board and navigate the reader to it (`/wiki/<path>`).

That resolves the original problem outright: a link out of a board's slice is no longer unreachable, so the "marked as off-board" treatment can be deleted rather than kept as decoration. A link now either resolves or is genuinely unwritten, and unwritten is the `unresolved` case, which reads differently and belongs elsewhere.

## Toggling a folder as a board

Any folder is boardable by URL. The reader offers "view as board" when you are looking at a folder, which simply navigates to `/kanban/<that folder>`. Folders listed in `backlogs` additionally appear in navigation. Nothing has to be configured before it can be tried.

## Datasets

A `type: dataset` entry renders its table as a table, and an entry holding several renders each. Sorting and filtering are client-side over the rendered values; the stored cells are never rewritten, since formatting is presentation and the raw value is the data.
