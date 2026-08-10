---
type: task
title: "refresh, pull, and sync"
status: todo
priority: medium
tags: [feature, actions, git]
blockers: [/3-reader/005-markdown-and-checkboxes.md]
---

The header's three actions. **Refresh** rebuilds the index. **Pull** is `git pull --rebase`. **Sync** is commit and push.

These are the first things wikiview does that reach outside the machine, and the first that are hard to undo. They are shaped accordingly.

## Preview, then confirm

Every action shows what it will do before it does it: files changed, commits ahead and behind, the commit message. Then it acts on confirmation.

Not ceremony. A push is irreversible from this UI's point of view, and a rebase that stops halfway leaves a conflicted working tree that a web page has no business trying to resolve.

## When a pull fails

The rule, decided rather than discovered later:

1. **Undo the attempt** — `git rebase --abort`, restoring the tree exactly as it was before. The UI never leaves the user in a conflicted state it cannot get them out of.
2. **Offer to push the local work as a new branch**, with a proposed name (`wikiview/2026-08-10-1430`) the user can confirm or override.

That turns a merge conflict from "your knowledge base is now broken and you are in a web page" into "your work is safe on a branch, resolve it where you have a real tool". It is the difference between an action that can strand someone and one that cannot.

## Constraints worth stating

- **Git is optional.** A bundle is a folder; it need not be a repository, and `git` need not be installed. The actions are absent, not broken, when it is not.
- **The bundle root is not necessarily the repository root.** A bundle can be a subdirectory of a larger repo, so committing must scope to the bundle rather than sweeping the whole worktree.
- **Nothing is automatic.** No pull on load, no push on a timer. The bundle belongs to the user and to whatever agent is also editing it; surprising them with a network operation is worse than making them click.
- **A rebuild follows a pull**, since the files changed underneath the index. The watcher will notice anyway; doing it deliberately avoids a window where the UI shows the old content.

## Open

Whether `sync` should refuse when the working tree contains changes the user did not make through wikiview. Leaning no — it is their repo and their folder, and an agent editing alongside is the expected case, not an anomaly — but the preview must show everything that will be committed, not only what wikiview touched.

**Acceptance:** each action previews before acting; a failed pull restores the previous state and offers a named branch; the actions are hidden when the bundle is not a git repository; committing is scoped to the bundle; nothing runs without being asked.
