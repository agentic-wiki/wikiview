---
type: task
title: "toasts: saying an action landed"
status: todo
priority: medium
tags: [design, ui]
blockers: [/8-design/004-header.md]
---

Mock lines 640–644. The app has no toasts today. An action that writes or reaches outside currently either changes the screen silently or holds a dialog open to say "Done."

## Look

- Bottom centre, 24px up (78px on mobile, clearing the tab bar).
- The colours are inverted: `fg` background and `bg` text, 13px 500, 11px radius, the shadow, and `wv-in`.
- A 7px dot sits before the text: `ok` normally, `danger` for a failure.
- Only one toast shows at a time. A new one replaces the old, and each lasts 2.6s.
- It carries `role="status"` so screen readers announce it.

## Shape

A `useToast()` hook over one provider in `App`. `toast(message, tone?)` is the whole API: no queue, no actions, no stacking.

## Wired to

| Action | Message |
|---|---|
| Refresh | "Reloaded N entries" |
| Read later | "Saved to Read later" / "Removed from Read later" |
| Card moved | "Moved to <column> · <lane>" |
| Pull | "Pulled N commits" |
| Sync | "Committed N files and pushed" / "Pushed N commits" |
| Settings saved | "Board saved to wiki.toml" / "Graph saved to wiki.toml" |
| View created | "Created board <name>" / "Created graph <name>" |
| Write refused or failed | the server's message, in `danger` |

The git popover's "Done." pause is removed ([005](./005-git-popover.md)).

**Tests:** a toast appears and times out, a new toast replaces the current one, and every row in the table fires its message, success and failure alike.
