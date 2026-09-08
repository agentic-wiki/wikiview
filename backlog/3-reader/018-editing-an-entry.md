---
type: task
title: "editing an entry: a lock, a window, and a write"
status: todo
priority: high
tags: [feature, reader, write]
blockers: [/2-server/004-write-lock.md]
---

The tool's stated goal is to "never become a markdown editor", and this task is the first deliberate step past that line: a way to edit an entry from the UI. Not a full editor — an affordance. The default is view mode; a flip to edit mode gives a markdown editor, the flip back shows the rendered result. Think Notion for the toggle, Obsidian for the editing surface. Simple but comfortable — you should be able to write without fighting the interface, and you should be able to stop writing without ceremony.

## Two modes, one toggle

**View is the default; edit is the opt-in.** The entry renders as usual. An edit icon (or keyboard shortcut) flips to edit mode: the rendered content is replaced by a markdown textarea with the raw source. Flipping back re-renders. The toggle is the interface — no modal, no page change, no "you are now editing" announcement. The source is the entry's markdown, including frontmatter, and every change to it is a change to the file.

**Comfortable, not minimal.** The textarea is not a `<textarea>`: it is a code-aware editor surface with line wrapping, reasonable font sizing, and tab support. Think Obsidian's source mode — enough craft that writing is pleasant, not so much that it becomes a product about editing. Markdown is the format and the editor should know it: code blocks don't wrap, frontmatter has its visual break, headings are readable.

**Existing affordances extend naturally.** What can already be done from view mode — checking and unchecking checkboxes — continues to work. Edit mode adds the rest: changing text, adding paragraphs, modifying frontmatter. What works in view stays in view; what needs the source goes to edit.

## What the edit does

**An icon, and a lock behind it.** Entering edit mode takes a write lock on the file — a lock the server holds, so that nobody else (another user, another tab, an agent) can write to it while the window is open. The lock is the whole safety model: editing is a single-writer operation, and the server is what enforces the single writer.

**A window that resets on activity, not on the clock.** The lock is held for two minutes, but the two minutes restart every time the user edits something. An idle editor gives the file back in two minutes; a working editor holds it as long as they keep working. The window is a liveness signal, not a quota — it reclaims files from editors that were abandoned, and never from ones that are alive.

**A debounced write, not a save button.** Edits are sent to the server on a debounce: the client keeps the file in front of the user and ships it when the typing settles, so the server writes it down without the user ever pressing save. The debounce and the window work together — the debounce decides *when* to write, and the window decides *how long* the write is allowed.

## Where it lands

The write goes to the server, which writes the file — the client never touches the bundle directly, which is how every other write in this tool works. The server needs a write endpoint and a lock it can hold and expire, and that is the part this depends on: the reader UI is the easy half, and the server's ability to lock a file and let the lock die on its own is the half that has to be built.

The tension with the goal is real and worth naming: this makes the tool able to edit, and "able to edit" is a door. The lock, the bounded window, the server-held write, and the view-default toggle are what keep the door narrow — a deliberate edit rather than an always-open editor. You edit when you choose to, and you stop when you flip back. The rendered view is still the product; the source is the means to change it.