---
type: task
title: "editing an entry: a lock, a window, and a write"
status: todo
priority: high
tags: [feature, reader, write]
blockers: []
---

The tool's stated goal is to "never become a markdown editor", and this task is the first deliberate step past that line: a way to edit an entry from the UI. Not a full editor — an affordance. An edit icon that takes a lock on the file, gives a bounded window to work in, and writes the result back to the server when the user stops. The shape below is the user's, and it is good, because every part of it exists to make the edit safe rather than to make it comfortable.

## What the edit does

**An icon, and a lock behind it.** The entry shows an edit icon. Pressing it takes a write lock on the file — a lock the server holds, so that nobody else (another user, another tab, an agent) can write to it while the window is open. The lock is the whole safety model: editing is a single-writer operation, and the server is what enforces the single writer.

**A window that resets on activity, not on the clock.** The lock is held for two minutes, but the two minutes restart every time the user edits something. An idle editor gives the file back in two minutes; a working editor holds it as long as they keep working. The window is a liveness signal, not a quota — it reclaims files from editors that were abandoned, and never from ones that are alive.

**A debounced write, not a save button.** Edits are sent to the server on a debounce: the client keeps the file in front of the user and ships it when the typing settles, so the server writes it down without the user ever pressing save. The debounce and the window work together — the debounce decides *when* to write, and the window decides *how long* the write is allowed.

## Where it lands

The write goes to the server, which writes the file — the client never touches the bundle directly, which is how every other write in this tool works. The server needs a write endpoint and a lock it can hold and expire, and that is the part this depends on: the reader UI is the easy half, and the server's ability to lock a file and let the lock die on its own is the half that has to be built.

The tension with the goal is real and worth naming: this makes the tool able to edit, and "able to edit" is a door. The lock, the bounded window, and the server-held write are what keep the door narrow — a safe, single-writer, self-expiring edit rather than an always-open editor.