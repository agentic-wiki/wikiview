---
type: task
title: "loading, not found, empty and error states"
status: done
priority: low
tags: [design, ui]
blockers: [/8-design/002-tokens-and-type.md]
---

The mock does not draw these, so they are drawn in its language rather than left as leftovers of the old one.

- **Loading**: the delayed indicator stays, now a spinning refresh glyph (`wv-spin`) in `faint` with the word beside it, instead of the bare "Loading…". The cold app load in `App.tsx` uses the same component.
- **Not found**: a centred block with a 40px `panel-2` tile holding a file glyph, the hint in `muted`, the path in mono, and the front-door link as a secondary button (`line-2` border, 9px radius).
- **Cannot reach the bundle**: the same block with `danger` on the tile and a Retry button that re-runs the initial load.
- **Empty board and empty graph**: the same block with the existing explanation. The empty board keeps its inline `NewView` form, restyled in a `panel-2` card.

One `State` component, `{icon, tone, title, detail, action}`, covers all of these. It lives in `ui/src/ui/`.

**Tests:** each state renders its text and its action, Retry refetches, and Loading still waits 150ms before showing.

## What building it settled

- **`ui/State.tsx`**: `{icon, tone, title, detail, action, live, spinning}` plus a small `StateIcon` set and the `stateButton` class, used by Loading, not found, the unreachable bundle, the empty board and the empty graph. The empty graph gained a title ("Nothing on this graph"), so it reads like the empty board.
- **Retry re-runs the initial load**: the same `refresh` counter the event stream bumps, so there is no second loading path. Pinned by test, which heals the server between the failure and the click. A mutation that made Retry a no-op fails it.
- **The first load uses `Loading`** too, with its 150ms delay, rather than its own bare "Loading…".
