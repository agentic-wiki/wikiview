---
type: task
title: "what a board holds: any filter, chosen when it is made"
status: done
priority: medium
tags: [feature, boards, graphs, config]
blockers: [/4-boards/003-customizing-a-board.md]
---

A board held tasks and, in practice, nothing else. `where` could already say `type=idea`, but three things made `type=task` feel forced:

- **Clearing the filter brought tasks back.** Settings sent `where: []`, the writer dropped an empty list as "say nothing", and a board with no `where` takes the default. The filter editor said "every entry in the folder is a card" while the board went on holding tasks.
- **A board could not be made as anything else.** Declaring wrote `id`, `path` and `name` only, so every new board started as tasks and had to be changed afterwards.
- **The empty board said `type: task`** whatever its filter was, which sends you off to write the wrong frontmatter on a board of ideas.

## Decisions

- **`where` is the only way.** There is no `type =` shortcut key: it would be a second spelling for one thing, and `where` already covers `type=topic`, `type!=task` and anything else the query language can say. `wiki.toml` gains no keys.
- **Nil and empty are different on a board.** A missing `where` is the default, `["type=task"]`. `where = []` is every entry under `path`, and it is the one list the writer writes when empty. On a graph, which has no default, the two mean the same thing and the key is left out.
- **One way to declare a view.** A **New board** or **New graph** button opens a dialog, the same frame settings use: folder, name, address, and the filter as chips. It replaces the inline form in the panel's empty state, behind the panel's disclosure, and on the empty `root` board.
- **The default lives on the server.** The dialog starts from `GET /api/draft/{board|graph}/{folder}`, which returns the filter a new view would have and the folder's keys to choose another from. The client never holds its own copy of `type=task`.
- **A changed folder keeps the filter.** The keys follow the folder; the filter is taken from the first draft only, because once it is on screen it is the user's.

## Left alone

- Status, columns, lanes and blockers are not in the creation dialog. They have sensible defaults or are inferred, and the board's Settings are where they are edited, against a board whose columns are already on screen.
- Creating a card from a column ([010](./010-create-card.md)) pre-fills from `where`. Only `key=value` conditions can become frontmatter; `type!=task` gives the form nothing to write, and a board with `where = []` gives it no `type` at all.
