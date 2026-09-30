---
type: task
title: "git as a pill and a source-control popover"
status: todo
priority: medium
tags: [design, ui, api, git]
blockers: [/8-design/004-header.md]
---

Mock lines 58–64 and 70–121. Replaces the two icon buttons and the modal `Preview` in `GitActions.tsx`. Every behaviour of the modal survives: fetch on open, nothing without an upstream, the outside-staged warning, the rescue branch after a failed pull, busy states, the proposed commit message.

## The pill

34px, `panel-2`, mono 12px: branch glyph, the branch name (`fg`), `↓N` in `accent-ink` when behind, an amber dot and the change count when dirty, `synced` in `ok` when neither. Its border is `accent` while the popover is open. Absent without a repository or upstream, as now.

## The popover

Anchored under the pill, `min(410px, 100vw − 24px)`, `elev`, 14px radius, the shadow, `wv-in`. Header "Source control" with `branch ⇄ remote` in mono, and a close button. Closes on Escape and on an outside click.

A two-tab segmented control, **Incoming N** and **Changes N**:

- **Incoming**: the sentence ("7 commits to take, rebasing your 0 on top."), the commit list in a bordered box, max 240px scrolling — mono sha in `accent-ink`, message ellipsized, `author · age` in `faint` — or "Nothing to pull. You're up to date." A primary **Pull & rebase**, inert with nothing to pull.
- **Changes**: the file list with an amber status square (`M`, `A`, `D`, `?`) and the path in mono, or "Working tree clean."; the outside-staged warning when it applies; the "Commit message" field; "N commits ahead" and a primary **Commit & push** (or **Push** when nothing is staged).

The rescue branch UI appears inside the Incoming tab, as it does in the modal today. Success closes the popover and toasts ([015](./015-toasts.md)) instead of the "Done." pause.

## Server

`GitStatus` gains `incoming: {sha, subject, author, when}[]` — `git log --format=… HEAD..@{u}`, capped at 50, after a fetch. `when` is an ISO time; the client formats the age. Empty when nothing is behind.

**Tests:** the pill's three states; tabs; pull and push disabled with nothing to do; the rescue flow still offered after a failed pull; Escape closes. Server: the incoming list's order and cap, empty without upstream.
