---
type: task
title: "a write lock on an entry, held and self-expiring"
status: todo
priority: high
tags: [feature, server, write]
blockers: []
---

The write path today is optimistic: every read carries a version, and a write must present the version it was made from, so a second writer who has gone stale is rejected with the entry's current version rather than silently clobbering it. That is the right guard for a single write. It is not enough for an edit that lasts minutes, because the version only speaks at the moment of writing — two people can both have a file open, both be mid-sentence, and the second one to finish learns too late that the first already moved. This task is the missing half: a lock a session takes on a file while it is editing, holds as long as it is alive, and that dies on its own when the editor stops.

## What the lock is

**A lock is a session, not a write.** It is coarser than the version and orthogonal to it. The version still guards every individual write; the lock coordinates the sessions around a file, so that while one editor has it open, the others are told up front that someone is working on it rather than discovering it at the last moment.

**It is acquired, held, and released — and it expires.** An editor takes the lock when it opens the file for editing and releases it when it closes or when the debounce has flushed. But the release cannot be trusted alone: a closed tab, a crashed browser, or an abandoned edit must not hold a file forever. So the lock carries a deadline the server enforces — it is held for a bounded time and that time restarts on every edit, so a live editor keeps it and a dead one gives it back.

**The deadline lives on the server.** The client sends activity (an edit, a heartbeat); the server moves the deadline. The client never decides for itself that it may still write — the server is what knows whether the lock is still held, and it is what the other sessions ask.

## Why it is its own task

Editing an entry is the first feature that needs it, and it is the half of that feature that has to be built: the reader UI is the easy part, and the server's ability to hand a file to one editor, keep it from the rest, and take it back when the editor is gone is the part the edit cannot start on. The version and the lock are not alternatives — the lock keeps two humans from editing the same file at once, and the version keeps the writes that do happen from clobbering each other.