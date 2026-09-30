---
type: task
title: "the header, redrawn"
status: todo
priority: high
tags: [design, ui]
blockers: [/8-design/003-colour.md]
---

Mock lines 30–68. 52px, `panel`, a `line` hairline under it, no shadow.

Left to right:

1. **Logo tile + bundle name.** A 26px `accent` tile, 7px radius, the bundle label's initial in `on-accent` 700; the label beside it at 600. One link to the front door (the current `rootDestination`), hover `fg/5`. No chevron: there is one bundle.
2. **Breadcrumbs**, 13px: `line-2` slashes, each crumb a 3×6px-padded button-shaped link with `fg/5` hover, the last in `fg` and inert. Keeps the current middle ellipsis and the 260px per-crumb cap. The bundle name leaves the breadcrumb, since the tile says it. On a board or graph the trail becomes *Boards / <name>* or *Graphs / <name>* (today it is empty there), and on the two lists *Recently changed* / *Read later*.
3. Spacer.
4. **Search trigger**: `min(360px, 32vw)`, 34px, `panel-2`, `line` border (`line-2` on hover), 9px radius; magnifier, "Search or run a command…" in `faint`, a mono `⌘K` kbd.
5. **Refresh**: 34px icon button, the mock's single circular arrow; spins (`wv-spin`) while the request is in flight. A toast reports the result ([015](./015-toasts.md)).
6. **Git pill** — [005](./005-git-popover.md).
7. **Theme**: 34px icon button, sun/moon as in the mock, plus the existing half-disc for auto. Three states kept.

Removes: the old header's `elev-1`, the Pull and Sync icon buttons (replaced by the pill), the `caps` accent bundle name.

**Tests:** the tile links to the front door; the trail on a board, a graph and each list; refresh disables and spins while pending.
