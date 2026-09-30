---
type: task
title: "the folder listing, redrawn"
status: done
priority: medium
tags: [design, ui, reader, api]
blockers: [/8-design/007-entry.md]
---

Mock lines 308–337. A folder with no `index.md`.

- Same column and padding as an entry.
- A **Folder** chip (folder glyph stroked in the group colour) and the path in mono.
- H1 as on an entry; under it `N subfolders · N entries` in `muted` (the mock's description has no source).
- A row with the count on the left and a **Name / Updated** segmented control on the right, the choice kept per bundle.
- One bordered, 12px-radius list: subfolders first, then entries. Each row a 4-column grid — the group dot, title (500) with the entry's own title under it in `muted` when it differs, a link glyph and count in mono, and the age right-aligned at 72px min. Subfolders show their item count instead of links and age.
- Under the list, the mock's note: "No `index.md` here, so this listing is generated. Add `/<path>/index.md` to replace it."

**Server:** `EntryStub` gains `links` (outgoing + incoming, distinct entries, as the mock's count) and `updated` ([007](./007-entry.md)). Sorting by Updated uses `updated`, newest first, ties by name.

`listing.tsx`'s `Row` is the row for [012](./012-lists.md) too, so it is redrawn once here for all three pages.

**Tests:** both sorts and their ties, the stored choice, subfolders first, the empty folder, the hint's path.

## What building it settled

- **`links` on a stub is the entry's degree on a graph**: distinct entries linked either way, by `linksFrom`, the graph's own edge rule (body links and frontmatter references, not self, not unwritten targets). It is computed in one pass by `connections()` rather than by `Backlinks` per entry, which would walk the index once for each. Pinned by a server test, including both-ways-counts-once and a frontmatter-only link.
- **The folder has its own rows.** `listing.tsx`'s `Row` is shared with Changed and Read later, which the reference draws differently (a dated list, and draggable cards). Redrawing it here would have restyled those pages before their task. [012](./012-lists.md) redraws them and removes `Row` once nothing uses it.
- **`ui/Segmented.tsx`**: the reference's segmented track, as a radio group. The board's Lanes/Flat and the graph's label modes reuse it.
- **No duplicate count.** The subtitle names subfolders only when there are some; the entry count lives on the row beside the sort, as in the reference.
- **By name is the tree's order** (the path, which the filenames encode), not an alphabetical re-sort of labels. **By updated** puts entries without a time last, with ties in name order, so the list does not shuffle between renders.
- The root listing is titled with the bundle's label, since the root has no name of its own.
