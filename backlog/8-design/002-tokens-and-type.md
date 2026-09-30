---
type: task
title: "tokens, type and base styles from the reference"
status: done
priority: high
tags: [design, ui]
blockers: [/8-design/001-the-reference-design.md]
---

The foundation every other task in this epic draws with. Mock lines 12–25.

## Tokens

The mock's palette, stated once per token as `light-dark(light, dark)` in the existing `@theme` block, so the three `color-scheme` lines at the bottom of `index.css` remain the only place the theme branches.

| token | dark | light | use |
|---|---|---|---|
| `bg` | `#0C0C11` | `#F6F6F9` | the page, under views |
| `panel` | `#111118` | `#FFFFFF` | header, rail, side panel, folder rows |
| `panel-2` | `#15151D` | `#EFEFF5` | inputs, chips, columns, segmented tracks |
| `elev` | `#1B1B25` | `#FFFFFF` | cards, popovers, dialogs, peek |
| `line` | `#22222D` | `#E4E4EC` | hairlines |
| `line-2` | `#2E2E3B` | `#D5D5E0` | input borders, hovered hairlines, separators |
| `fg` | `#EDEDF4` | `#16161F` | text |
| `muted` | `#A1A1B5` | `#545468` | secondary text |
| `faint` | `#6E6E84` | `#8A8A9C` | labels, counts, paths |
| `accent` | `#8B7CFF` | `#8B7CFF` | fills, focus, active |
| `accent-ink` | accent 70% + white | accent 60% + black | accent as text on `bg` |
| `on-accent` | `#0D0B1A` | `#0D0B1A` | text on an accent fill |
| `edge` | `rgba(170,170,215,.32)` | `rgba(40,40,90,.24)` | graph edges |
| `ok` / `warn` / `danger` | `#3DD68C` / `#FFB547` / `#FF7A8A` | darkened for paper | state |

`accent-bg` is `accent/16` (dark) and `accent/13` (light), expressed as a utility rather than a token. `hover` is `fg/5`.

The old names — `sunken`, `surface`, `border`, `accent-fg` — are **removed**, and every use across `ui/src` rewritten to the new name that matches its role (not a blind rename: `surface` meant both "raised chrome" and "a card", which are now `panel` and `elev`).

**One shadow**, the mock's `--shadow` (a wide soft drop plus a 1px ring), for everything that floats: popovers, dialogs, palette, peek, toasts, the drag ghost. `elev-1`/`elev-2`/`elev-3` and `.lift` are replaced by it, and removed. Chrome no longer carries a shadow: the mock separates header, rail and panel by hairline and tone only.

## Type

- Geist Variable and Geist Mono Variable from `@fontsource-variable/*`, imported in `main.tsx`; Vite fingerprints the woff2 into `ui/dist`, so they are embedded. Installed with `--ignore-scripts` as always.
- `font-sans` and `font-mono` point at them in `@theme`, with `system-ui` / `ui-monospace` fallbacks.
- Base size **14px**, `-webkit-font-smoothing: antialiased`.
- `.caps` takes the mock's `.08em` tracking. The section-label recipe (11px, 600, `faint`) is a component, not this class — see below.

## Base

- Scrollbars: 10px, `line-2` thumb inset by a transparent border, transparent track.
- Keyframes `wv-in` (rise + fade), `wv-peek` (slide from the right), `wv-fade`, `wv-spin`, registered as Tailwind animations; all subject to the existing reduced-motion rule.
- Links: `accent-ink`. The mock drops the underline until hover. Prose links keep theirs for now, because in body text an underline is the only cue that isn't colour alone. The call is revisited with the rest of the prose in [007](./007-entry.md).
- Focus ring stays: the accent, `:focus-visible` only.

## Print

The `@media print` override block is rewritten in the new names. `print.test.ts` pins that print rules do not restyle; it must stay green.

**Acceptance:** no old token name left in `ui/src` (grep), both themes and "auto" render with the mock's colours, Geist loads from the binary with the network off, `just check` green.

## What building it settled

- **`.caps` stays about the letters.** Folding the section label's size and colour into it would have beaten the utilities at the sites that already set their own (unlayered CSS wins over Tailwind's layers), so a column heading in `text-fg` would have turned faint. The label becomes a `SectionLabel` component the first time two surfaces need it ([006](./006-rail-and-panel.md)).
- **Print empties the shadow inks** (`--ink-drop`, `--ink-ring`) rather than listing every shadowed class: one rule removes every shadow drawn with them, which is every shadow.
- **Floating surfaces lost their `border`.** The ring in `shadow-float` draws their edge, and a bare `border` in Tailwind v4 is `currentColor` — a bright outline in dark mode.
- **Mono paths are `faint`** everywhere, the mock's treatment, applied here since it is a pure role mapping.
- **Guarded by `tokens.test.ts`**: a removed token name in a component fails the suite, and so does a `var(--color-*)` the stylesheet does not define.
- Checked by eye in headless Chromium against the served binary, both themes: Geist loads from the binary, and the palette matches the mock.
