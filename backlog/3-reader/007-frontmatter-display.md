---
type: task
title: "how frontmatter is shown in an entry"
status: archived
priority: low
tags: [feature, reader, design]
blockers: [/3-reader/005-markdown-and-checkboxes.md]
---

Frontmatter is metadata about an entry, not part of its prose, and the format puts no ceiling on what it holds. The reader prints every field as a strip, which is fine for four fields and would be wrong for fifteen.

**Parked, because no bundle here has fifteen.** Entries in this backlog carry five or six short fields and the strip handles them. The disclosure below is the right answer to a problem worth waiting for: an entry whose metadata genuinely pushes its own prose off the screen.

Two things learned from measuring rather than assuming:

- **A field is glanceable when its value is short**, which the value already says. A list of blessed names (`type`, `status`, `priority`) would need configuring for a bundle that invents `severity`, and the length rule needs nothing declared. Measure what is displayed, not what is stored: a `blockers` value renders as "002 Backlogs config" and reads short, though the path behind it does not.
- **Nested YAML is invisible.** `nested:` with a sub-map arrives as `"nested": ""` — the key survives, the content is gone, because the parser models scalars and string lists. It is out of the format's spec, so this is not urgent, but the reader currently shows a field with nothing in it and no way to see what is really there. `/raw/{path}` now serves the file, so the fix is a link rather than a feature.

## What it is, which decides how it looks

Three kinds of field live in the same block, and they want different treatment:

- **Structural** — `type`, `status`, `priority`, `tags`. Short, low-cardinality, and the things you filter by. These are what a reader glances at.
- **References** — `blockers`, `epic`, and anything else holding a bundle path. The format says these are root-absolute precisely so they are stable keys, and a reader that showed `/epics/x.md` as text rather than a link would be wasting the one thing that spelling buys.
- **Everything else** — a `title` already shown as the heading, an `okf_version`, a snapshot field, a long description. Real data, rarely what you came for.

## Proposal

**A strip of the structural fields**, always visible: `type`, `status`, and anything short enough to read at a glance, with `tags` as separate chips. Values are not styled by meaning — no colour-coding `status: done` green — because the vocabulary is the bundle's, not ours, and guessing at semantics is how a neutral reader starts having opinions.

**References render as links**, resolved the way body links are. A value ending in `.md` that names an entry is a link; one that names nothing is shown as unresolved, the same treatment a body link gets. This needs the server to resolve frontmatter refs the way it already resolves body links — the client must not start deciding what looks like a path.

**Everything else behind a disclosure.** Collapsed by default, showing the field count, so a fifteen-field entry does not push its own content below the fold. Open state is a view preference, so it belongs in [per-bundle UI state](./002-per-bundle-ui-state.md), keyed per bundle rather than globally.

**Nothing is hidden outright.** A reader that silently drops fields makes the file and the view disagree, and the file is the truth. Collapsed is not hidden.

## Already applied

Keys carry an accent tint and the pair sits in a chip, so the eye separates key from value without a colon or a gap doing the work.

**Values are never coloured by meaning.** Tinting `status: done` green would require knowing that `done` means finished, and the vocabulary belongs to the bundle rather than to this reader — a bundle whose statuses are `visit-only` and `retired` would get an arbitrary palette. Colour distinguishes *key from value*, which is structural and always true, not *value from value*, which is a guess.

## Open

- **Which fields count as structural.** Deriving it (short scalar, low cardinality across the bundle) adapts to any vocabulary but is unpredictable; naming them in `[tool.wikiview]` is predictable but is configuration nobody wants to write. Leaning derived with a config override, on the same principle as board columns: infer, and let config correct.
- **Whether the raw YAML should be viewable at all.** Probably yes, as a toggle in the disclosure — it is the truth, and an entry whose frontmatter the subset parser does not model (a nested map, an anchor) would otherwise be invisible in the reader while still being on disk.

**Acceptance:** an entry with four fields shows them inline; one with fifteen does not bury its content; frontmatter references are links that behave like body links; no field is unreachable.
