---
type: task
title: "the watcher, the change digest, and SSE"
status: done
priority: high
tags: [feature, server]
blockers: [/2-server/002-server-foundation.md]
---

The server holds a bundle that something else owns. An agent edits it while the UI is open, someone edits it in an editor, `wiki move` relocates things. So the index has to follow along without being asked, and open clients have to hear about it.

This finishes the server. After it, the reader has something live to subscribe to rather than having live updates retrofitted into it.

## Shape

- **A watcher** over the bundle, with a quiet period so a batch of filesystem events is one logical change. A save is several events (write, chmod, sometimes a rename); a `tidy --all` is hundreds across many files. Both are one change to a reader.
- **A version that only moves when something actually changed.** A rebuild triggered by a touch, a permissions change, or a save that edited nothing must not churn every open tab. This is what makes the events cheap enough to be worth having.
- **SSE carrying the version, not a payload.** Clients refetch what they are looking at. A client that missed events pulls once and is correct again, so there is no replay to design and no ordering to get wrong.

## Deliberately not

- **No payload in the event.** Sending the changed entry would mean the server deciding what each client cares about, and a client that missed one being permanently behind.
- **No per-client filtering.** Every client hears every version. The refetch is one request against an in-memory index.
- **Nothing that writes.** Still read-only.

**Acceptance:** editing an entry updates the index without a request; a batch of edits is one version bump; a write that changes nothing does not bump; a non-markdown write does not rebuild; clients receive versions over SSE and disconnect cleanly on shutdown.

## Done

All of it, verified against a live server: an edit moved the version 1 → 2 and the served body with it, rewriting a file with identical content did not move it, a new entry moved it to 3, and a `.txt` write moved nothing. The SSE stream carried exactly the three versions.

**The digest is content, not modification times**, and that was a measurement rather than a preference. On a 5k-entry bundle a content digest costs ~82ms against a ~266ms rebuild, where a stat-based one costs ~21ms — but a stat digest moves on every touch, which is the thing this exists to prevent. A third of a rebuild that only happens when something already changed is worth paying so that connected clients are not told to refetch for nothing.

**The debounce is what makes the rest affordable.** One save is several filesystem events and a `tidy --all` is hundreds across many files; both are one change. Without it, a bulk operation would rebuild the bundle dozens of times and tell every client each time.

Two things worth knowing for later:

- **The publisher never blocks.** A client that stops reading would otherwise stall a rebuild and every other client. Versions are absolute rather than increments, so dropping an older pending one loses nothing — the newer number supersedes it — which is what makes coalescing safe here.
- **The SSE tests run against a real server and client**, not an `httptest.Recorder`. A recorder's buffer would be written by the handler goroutine and read by the test concurrently, which is a genuine data race; the structure removes it rather than relying on the detector to catch it.

**`-race` is part of the gate.** It was skipped at first for want of a C compiler, and the tests were written to be race-free by construction instead — which is not the same as checking. What got through was a data race in the *engine's* TOML decoder, reached by two ordinary requests: `bundle.DecodeTool` writes to the `toml.MetaData` it reads from, so two handlers decoding one bundle is a concurrent map write, and the Go runtime kills the process for it. It killed a live server. `just check` runs the race detector now.

**Rebuilding and announcing are one step**, for a related reason. Taken apart — rebuild, then read the version, then notify — two of them overlapping each read the version *after* both had landed: one version was announced twice and the one between it never at all. That is visible in a terminal as a repeated `v4` with no `v3`, and it is exactly the sort of thing the log exists to make impossible.

**Every version says why it moved.** A deleted entry is absent from `ChangedAt` rather than marked in it, so a version that moved because of one had nothing to point at and read as `no entry content moved` — which tells whoever is watching nothing about whether their bundle is fine. The store reports what was removed and whether `wiki.toml` changed, and a version with no nameable reason says `unaccounted for` rather than implying calm.
