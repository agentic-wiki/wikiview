import { useMemo } from "react";
import type { EntryStub, TreeNode } from "@/api";
import { describe } from "@/tree";
import { count, FileIcon, Row } from "@/views/listing";

/**
 * What changed since you last looked.
 *
 * A page rather than a panel, and the reason is the click. Opening an entry
 * marks it seen, so its row leaves the list — in a panel that is a handle
 * disappearing from under the cursor while the rows below jump up, and the next
 * click lands on something you did not aim at. Here nobody sees it happen: you
 * left the page, and coming back renders what is left, minus what you read.
 *
 * The alternative was keeping rows and only dimming them, the way a mail client
 * does. That needs a second, session-scoped notion of "you have looked at this"
 * beside the versioned one the bundle already has, and two definitions of that
 * is a bug waiting for a reason. This one stores nothing: the marks in the tree
 * and this list are one state, read twice.
 */
export function ChangedView({
  tree,
  unseen,
  rootLabel,
}: {
  tree: TreeNode;
  unseen: Set<string>;
  /** What to call the bundle root, for an entry that lives in it. */
  rootLabel: string;
}) {
  const rows = useMemo(() => changed(tree, unseen), [tree, unseen]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-fg text-2xl font-semibold tracking-tight">Recently changed</h1>
      {/* What the page is, not just how many rows are on it: this list exists
          because something else writes to these files while you read them, and
          that is not obvious from a heading. */}
      <p className="text-muted mt-1 text-sm">
        {rows.length === 0
          ? "Nothing has changed since you were last here."
          : `${count(rows.length, "entry", "entries")} changed since you last opened ${
              rows.length === 1 ? "it" : "them"
            }, most recent first. Opening one takes it off this list.`}
      </p>

      <ul className="mt-6 space-y-1">
        {rows.map(({ entry }) => {
          // What the entry calls itself, and where it lives when the name does
          // not already say. A list of things to read, not the tree — and the
          // tree is where a row has to keep naming its file.
          const { name, where } = describe(tree, entry.path, rootLabel);
          return (
            <Row
              key={entry.path}
              to={"/wiki" + entry.path}
              icon={<FileIcon />}
              title={name}
              subtitle={where}
              meta={entry.type}
            />
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The changed entries, newest first, each with the folder it sits in.
 *
 * Ordered by the version their content last moved at, which is the only clock
 * there is: `changedAt` counts bundle rebuilds, not seconds, so "most recent
 * first" is exact and "four minutes ago" is not available to say. Ties are one
 * rebuild — an agent writing several entries at once, which is the common case —
 * and fall back to the path so the order is stable between renders.
 */
function changed(tree: TreeNode, unseen: Set<string>): { entry: EntryStub }[] {
  const out: { entry: EntryStub }[] = [];
  const walk = (node: TreeNode) => {
    for (const e of node.entries) if (unseen.has(e.path)) out.push({ entry: e });
    for (const c of node.children) walk(c);
  };
  walk(tree);
  return out.sort(
    (a, b) => b.entry.changedAt - a.entry.changedAt || a.entry.path.localeCompare(b.entry.path),
  );
}
