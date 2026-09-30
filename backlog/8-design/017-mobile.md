---
type: task
title: "narrow screens: drawer, tab bar, bottom sheet"
status: todo
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
- **Entry**: padding becomes `22px 18px 60px`. The TOC is already hidden below 1180px.
- **Toasts** sit 78px up to clear the tab bar.

**Tests:** the layout switches when the media query changes (happy-dom lets us fake it); the drawer opens, closes on navigation and closes on Escape; the tab bar navigates; the peek renders as a sheet.
