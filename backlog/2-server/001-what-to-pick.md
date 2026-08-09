---
type: task
title: "what to pick from the previous attempt, and what to leave"
status: todo
priority: high
tags: [design, architecture]
blockers: [/1-design/001-design.md]
---

A working board UI exists in the `wikanban` repo. It is not the starting point, because [the retro](../lessons/001-first-attempt.md) is about what happens when it is treated as one: every migration artifact it lists came from preserving decisions that were right for *a board over one folder* and wrong for *a reader over a bundle*.

So this repo is built from its intended shape, and pieces are **picked deliberately, one at a time, with a reason**. The list below is the picking order, not a port.

## Take, nearly as-is

These were solved on their own terms and do not encode the board's shape.

- **The watcher.** fsnotify with a quiet-period debounce, plus the rule that a batch is one logical change. Its tests are worth taking too, including the one asserting a non-markdown write causes no rebuild.
- **The digest.** Rebuilding only bumps a version when the rendered content actually changed, so a save with no edit does not churn every open tab. This is what makes SSE cheap.
- **SSE carrying a version, not a payload.** Clients refetch; a client that missed events pulls once and is correct again.
- **Atomic write plus lock file.** Temp file and rename, so a reader never sees a half-written entry.

## Take the idea, rewrite the code

- **The path guard.** "A request path is only ever a map key, never a file operation" is the right rule and should survive verbatim. But the map is now every entry in the bundle rather than the cards on one board, so it is a different index with a different lifetime.
- **`--where` filtering in the browser.** The vocabulary and the URL form are right. The implementation must come from the engine, not a second parser: the previous version reimplemented `--where` matching in TypeScript and kept it honest with a "copy as CLI" escape hatch, which is a clever fix for a problem that should not exist once the engine is importable.

## Do not take

- **The frontmatter writer.** It existed only because `setFrontmatterValue` was unreachable. It is a second implementation of a rule the engine owns, and importing the engine is the entire reason this repo is a separate module rather than a shell-out.
- **The link resolver.** Same story: `normalizeLink` is the one correct home. The previous attempt had three.
- **The board-shaped store.** One filtered slice held as *the* index is the assumption the reader breaks. One bundle, one index, many views over it, no view privileged by living in the store.
- **The config loader.** See [where the config lives](../1-design/002-backlogs-config.md).
- **`--path` meaning "the board".** The board's folder is a view setting with a default, not a launch flag.

## Take, but only once the reader exists

The board itself: columns, lanes, drag on pointer events, the card sheet, quick-add. All of it works and none of it is wrong; it simply cannot be the first thing built, or the reader ends up shaped around it again.

Two details worth keeping when it comes: dragging on **Pointer Events** rather than HTML5 drag-and-drop (so touch works at all, and so drag state is not tied to an element React unmounts mid-move), and **suppressing the synthesized click** after a drag so finishing one does not also open the card.
