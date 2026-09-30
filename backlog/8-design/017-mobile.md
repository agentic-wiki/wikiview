---
type: task
title: "narrow screens: drawer, tab bar, bottom sheet"
status: done
priority: low
tags: [design, ui, mobile]
blockers: [/8-design/015-toasts.md]
---

Mock lines 31–33, 52–54, 138–141, 544–557, 837 and 884. The last phase, after desktop parity.

Below **780px** (read live from a `matchMedia` hook, replacing the load-time `wideEnough` in `Shell.tsx`):

- **Header**: a hamburger on the left, then the logo tile and name. Breadcrumbs are hidden. The search trigger becomes an icon button, and the git pill drops the branch name and keeps only its counts.
- **Rail**: hidden. It is replaced by a **bottom tab bar**, 62px, `panel`, with a `line` hairline on top. It holds the five sections with icon and label, the active one in `accent-ink`, and pads for `env(safe-area-inset-bottom)`.
- **Panel**: becomes a **drawer**, fixed under the header at `min(320px, 86vw)` with the shadow, over a `black/50` backdrop. The hamburger opens it. It closes on navigation, on the backdrop and on Escape. Outside a panel section (on the lists) it shows the tree.
- **Peek**: becomes a **bottom sheet**, fixed from 14vh to the bottom with an 18px top radius, over a backdrop.
- **Board**: columns are 84vw and snap horizontally (`scroll-snap-type: x mandatory`). Card dragging still works by touch, because the drags are pointer events.
- **Entry**: padding becomes `22px 18px 60px`. The TOC and the wide button already go when the reader has no room for them ([007](./007-entry.md)).
- **Toasts** sit 78px up to clear the tab bar.

**Tests:** the layout switches when the media query changes (happy-dom lets us fake it); the drawer opens, closes on navigation and closes on Escape; the tab bar navigates; the peek renders as a sheet.

## What building it settled

- **`NARROW` is one named query** (`(max-width: 779px)` in `media.ts`), read live by `useMedia` wherever the layout differs: the shell, the sheet, the board, the entry, the toast. The load-time `wideEnough` is gone; the panel's default follows the live width.
- **The panel's contents are one function** (`panelFor`), drawn in the sidebar on a wide screen and in the `Drawer` on a narrow one, so the two cannot drift apart. The drawer closes on navigation, on its backdrop and on Escape (through the stack).
- **Tapping the tab you are on opens its panel** in the drawer, since there is no panel beside the view to toggle, as the rail's active icon does on a wide screen. The tab bar says "Changed" and "Later" under the glyphs, the rail's full names shortened.
- **The header gives way by ellipsizing the bundle name**, found by screenshot: at 390px the header was 13px wider than the screen and the theme button was clipped. Gaps also tighten on a narrow screen.
- **The sheet is a bottom sheet** from 14vh down, over a backdrop that closes it, and board columns are `84vw` and snap.
- **Tests run at phone width by mounting wide and narrowing after**, for the happy-dom media-listener quirk noted in [007](./007-entry.md).
