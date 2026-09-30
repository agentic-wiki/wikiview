---
type: task
title: "the command palette: entries and commands"
status: todo
priority: medium
tags: [design, ui]
blockers: [/8-design/005-git-popover.md]
---

Mock lines 559–580 and 839–851.

## Look

- The backdrop is `black/55` with a 3px blur, and uses `wv-fade`.
- The panel is `min(620px, 92vw)`, 12vh from the top, `elev` with a 16px radius, the shadow, and `wv-in`.
- The input row is 56px: a magnifier, a 16px input reading "Search entries, jump to a view, run git…", and an `esc` kbd hint.
- Results scroll up to `min(420px, 56vh)`. Each item has a 26px `panel-2` tile holding an 8px mark, a title (500), a mono sub-line and the kind on the right. The selected item gets `accent-bg`.
  - Entries get a round mark in their group colour.
  - Commands get a square mark in `accent`.
- The footer reads "↑↓ navigate · ↵ open · ⌘K toggle".

## Contents

Entries are matched as they are today, on label, title and path. The mock's commands are added, each one a plain `{title, sub, kind, run}` in one list in `Omnibar.tsx`:

| Command | Sub | Shown when |
|---|---|---|
| Pull N commits | `git · remote → branch` | there is an upstream (opens the popover on Incoming) |
| Commit & push… | `git · N changed` | there is an upstream (opens the popover on Changes) |
| Toggle theme | `appearance` | always (cycles auto → light → dark) |
| Open board · <name> | its path | once per declared board, including `root` |
| Open graph · <name> | its path | once per declared graph |
| Recently changed | `N unseen` | always |
| Read later | `N saved` | always |

With an empty query, the first three commands come first, then five entries, then the remaining commands. With a query, matching entries come first, up to 9, then matching commands. Arrow keys wrap. Enter runs the selected item.

**Tests:** ordering with and without a query, arrow keys wrapping, each command running its action, git commands absent without an upstream, and one board command per declared board.
