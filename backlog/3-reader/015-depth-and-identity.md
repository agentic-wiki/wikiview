---
type: task
title: "depth and identity"
status: done
priority: medium
tags: [ui, design]
blockers: [/3-reader/004-ui-shell.md]
---

The shell worked and looked like a diagram of itself. Light mode was white on white, dark was black on black, nothing cast a shadow, and the accent was the blue every tool ships with.

## What was actually wrong

Not "no shadows". One background colour, everywhere, with hairline borders drawn on it. Everything was technically visible and nothing had a position: a card, a column, the header and the page were the same surface with different rectangles drawn around them.

## Three greys

`sunken` is the ground, `bg` is the page, `surface` is anything raised off it. A board reads as columns on a canvas because the canvas is darker than the columns, before any shadow is involved. That matters most in dark mode, where a shadow is close to invisible: a shadow is light that did not arrive, and on a near-black page there is none left to withhold.

The neutrals carry a little of the accent's hue. Not visible as colour at those chromas; it is what stops a light theme reading as paper-white and a dark one as switched-off.

## One accent, and it is not a state colour

Warnings are amber and failures are red, by a convention nobody is going to unlearn. An identity colour that lands in either family competes with them every time something goes wrong, which is the worst possible time. So indigo, and `warn` and `danger` are their own tokens rather than four spellings of `text-red-500` scattered across four files.

The accent earns its place by doing something: keyboard focus, links in prose, the active rail section, the drop target a card is over. Not by tinting a logo.

## Every token defined once

`light-dark(light, dark)`, rather than the palette written three times — a `prefers-color-scheme` block, plus an attribute block per explicit choice. A palette written three times is one where one of the three is wrong. The three cases collapse to three lines of `color-scheme` and the colours are stated once, side by side, where they can be compared.

Shadows cannot go through it: `light-dark()` takes exactly two arguments and a two-layer shadow holds a comma of its own. Only the ink does, so the geometry is stated once and dark gets the same shape in a blacker one.

**Acceptance:** three distinct surface tones per theme; elevation on chrome, cards and dialogs; an accent used for interaction rather than decoration; no palette colour hardcoded in a component; every token defined in exactly one place.

## Done

Elevation is three hand-written classes rather than theme values, so it is one name in the markup and one definition in the stylesheet, the way `.caps` already was. `.lift` is separate and only goes on cards: something rising to meet the pointer says it is loose on the board, and saying that about a row you can only click is a promise the interface does not keep.

Syntax highlighting got a lightness per theme instead of one mid-tone for both, which was a compromise that read well on neither. Keywords moved from 305 to 330, because titles are drawn in the accent and an indigo title beside a violet keyword was two colours doing one job.

**`light-dark()` survives the build intact.** Lightning CSS transpiles it to a `--lightningcss-light` / `--lightningcss-dark` pair keyed on `color-scheme`, so the output works in browsers without it, and the explicit `[data-theme]` selectors still outrank the media query in both directions.

**No screenshot proves this one.** There is no browser in the container, and the tests can only assert that a class is present, not that the result has depth. What was verified is that every new utility and token reaches the compiled stylesheet, which is the part that fails silently.
