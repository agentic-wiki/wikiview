---
type: task
title: "UI state scoped per bundle"
status: todo
priority: medium
tags: [feature, ui]
blockers: [/1-design/001-design.md]
---

Remembered UI state (last board, collapsed lanes, view preferences) must not leak between bundles. One person serving five knowledge bases from the same browser would otherwise carry a board choice from one into another, where the folder may not even exist.

**Scope every stored key by a bundle id.** The server computes it once from the bundle's absolute root path and sends it with the board payload, so the client namespaces its storage without deriving anything itself:

```
localStorage["wiki:<bundleId>:board"] = "/backlog"
```

The server sending it, rather than the client hashing a path it was given, keeps one definition of a bundle's identity and avoids the client caring how it is computed.

## One key per thing, never a packed list

That `board` key holds **the board you were last on**, a single path — not the set of boards, which belongs in `wiki.toml` where it is shared and versioned. So there is nothing to comma-separate.

Where state genuinely is per board, the board's path goes in the key rather than the value:

```
wiki:<id>:board                          "/backlog"          the one you return to
wiki:<id>:board:/backlog:collapsed       ["done","archived"] that board's collapsed columns
wiki:<id>:tree:expanded                  ["/notes","/ref"]   folders opened by hand
```

Packing several values into one string is the thing to avoid. A comma-separated list needs an escaping rule the moment a value can contain a comma — and these values are **paths**, which can contain anything a filename can. That rule would then live in the client, be forgotten once, and corrupt silently. A key per concern needs no parsing at all, and a value that is genuinely a list is stored as JSON, which already has an escaping rule.

**Anything stored is disposable by definition.** A missing or unparseable key falls back to the default rather than being repaired: this is a view preference, and there is no state here worth writing recovery code for.

**Known limitation to accept rather than solve:** the id follows the path, so moving a bundle loses its remembered state. That is the correct failure — it is a *local view preference*, not data, and a bundle has no identity of its own to key from. Anything worth keeping belongs in `wiki.toml`, where it is shared and versioned with the files.
