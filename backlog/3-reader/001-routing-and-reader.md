---
type: task
title: "the reader: URL routing, history, and the kanban toggle"
status: done
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

So a link out of a board's slice is never unreachable, and there is no "off-board" state to mark. A link either resolves or is genuinely unwritten, and unwritten is the `unresolved` case, which reads differently and belongs elsewhere.

## Going to a board

A board is addressed by its id, `/kanban/<id>`, and every declared board is in the rail. `root` is the one every bundle has, so there is a kanban to open before anything is configured. Making a folder into a board of its own is a config write, and belongs to [choosing which folders are boards](../4-boards/002-choosing-boards.md).

## Datasets

A `type: dataset` entry renders its table as a table, and an entry holding several renders each. Sorting and filtering are client-side over the rendered values; the stored cells are never rewritten, since formatting is presentation and the raw value is the data.

## Settled

Everything above holds, and the parts that needed deciding since are decided in the tasks that build on it: [the shell](./004-ui-shell.md) for the chrome and the exact route table, [the reader](./005-markdown-and-checkboxes.md) for rendering and writes, [tables](./006-tables-and-grid.md) for the grid, and [the board](../4-boards/001-board-view.md) for what happens on one.

Three things were sharpened rather than changed:

- **Routes keep `.md`** and are the bundle path verbatim. Dropping the extension is ambiguous: a bundle can hold both `/notes.md` and `/notes/index.md`, and `wiki check` is clean on it.
- **A folder navigates to its `index.md` when it has one**, via `replaceState`. Without one, the folder URL stays and lists its entries; an empty folder gets a placeholder, and the UI never writes an `index.md` to tidy that away.
- **Hash routing is ruled out**, not merely unpreferred: the fragment carries heading anchors, so it cannot also carry the router.
