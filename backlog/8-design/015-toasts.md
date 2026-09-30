---
type: task
title: "toasts: saying an action landed"
status: done
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

## What building it settled

- **`ui/Toast.tsx`**: `ToastProvider` around the reader, `useToast()` → `toast(message, tone?)`. One toast at a time; each is timed from when *it* appeared, so a second toast shortly after the first gets its full 2.6s. Pinned by test, and by a mutation that timed only the first.
- **Read later toasts once, at the queue.** The reader wraps `queue.toggle`, so every bookmark (the entry's, a card sheet's, the list's "Done") says what it did without each button knowing about toasts.
- **The git popover's "Done." pause is gone.** Success closes it at once and toasts "Pulled N commits", "Committed N files and pushed" or "Pushed N commits". A rescue still stays open, since the branch name it shows is the point, and it toasts "Pushed to <branch>".
- **A card move** toasts "Moved to <column> · <lane>" when it lands, and a refused one toasts the server's words in `danger`, alongside the snap-back.
- **Refresh** toasts "Reloaded N entries"; a failed refresh toasts why.
- **Not wired, deliberately**: a checkbox tick. It is its own feedback (the box is ticked), and a refused one already shows its error in place.
