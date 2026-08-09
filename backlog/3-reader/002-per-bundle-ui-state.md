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

**Known limitation to accept rather than solve:** the id follows the path, so moving a bundle loses its remembered state. That is the correct failure — it is a *local view preference*, not data, and a bundle has no identity of its own to key from. Anything worth keeping belongs in `wiki.toml`, where it is shared and versioned with the files.
