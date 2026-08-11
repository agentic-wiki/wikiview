---
type: task
title: "resolve on the server, render in the client"
status: done
priority: high
tags: [feature, reader, api]
blockers: [/2-server/003-watch-and-events.md]
---

The reader needs entries it can display. Two engine rules stand in the way of doing that in a browser, and where they live decides the shape of the whole API.

## The rules the client must not own

**Link resolution.** A body link is written relative (`./b.md`), and turning it into something navigable means resolving it against the bundle root. That is the engine's rule, and a client doing it would be reimplementing it in TypeScript against a copy of the index.

**Heading ids.** An `#anchor` link has to land on the heading `wiki check` thinks it names. Every markdown library ships its own slugger and they are *almost* right: goldmark turns `and_underscore` into `and-underscore`, where the engine keeps the underscore, matching GitHub. A near-match is the worst case — `check` calls the anchor valid and the reader silently fails to scroll, with nothing reporting a problem.

## The answer: data, not HTML

Both travel as lookup tables beside the body, so the client owns neither rule and does no path arithmetic:

```jsonc
{
  "body": "…markdown exactly as on disk…",
  "links":    [ { "raw": "./b.md", "to": "/notes/b.md", "anchor": "", "exists": true } ],
  "headings": [ { "level": 2, "text": "A Heading_here", "id": "a-heading_here" } ]
}
```

The client renders with its own markdown stack and resolves each href by **dictionary lookup on `raw`**. Anything absent from the table — an external URL, a link out of the bundle — is left exactly as authored, which is the correct default rather than a special case.

## Why the server does not render HTML

Rendering the markdown to HTML in Go would keep the rules in one place too, and it is the wrong trade:

- **Two representations of the same content** on every request, since the source is still needed.
- **It forecloses editing.** An editor saves the source back, and any scheme that rewrites links inside the markdown needs a reverse transform at save time.
- **It forecloses markdown plugins.** Task lists, mermaid, and highlighting want to be components in the tree; injected HTML puts the body outside it, so every interaction becomes manual delegation over a foreign DOM subtree.

The goal is *resolving* server-side, not rendering server-side. Shipping data gets that without any of the cost.

## Also decided here

- **Routes keep `.md`**: `/wiki/notes/a.md#a-heading_here`. The path *is* the bundle path, so there is no transformation and no rule to specify. Dropping the extension is ambiguous — a bundle can hold both `/notes.md` and `/notes/index.md`, and `check` is clean on it, so `/wiki/notes` would name two entries.
- **Real routes, not hash routes.** The fragment belongs to heading anchors, so it cannot also carry the router.
- **A folder navigates to its `index.md`**, via `replaceState` so one entry keeps one URL. `index.md` is optional in the format, so `/api/tree` reports each folder's index when it has one; a folder without one gets a synthesized listing and keeps the folder path.

`/api/tree` was added for that, and for navigation: the whole tree in one response, derived from an index already in memory, rather than a round trip per folder to answer a question the client could answer locally.

**Acceptance:** the body is served as written; links carry their raw form and resolved path; headings carry ids the engine agrees with; the tree reports each folder's index. Verified live, and the slug rule is cross-checked against the real `wiki` binary so a divergence fails the build.
