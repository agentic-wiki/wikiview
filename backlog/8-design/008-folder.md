---
type: task
title: "the folder listing, redrawn"
status: todo
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
