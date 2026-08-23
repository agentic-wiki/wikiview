import { useCallback, useEffect, useMemo } from "react";
import type { TreeNode } from "@/api";
import { useBundleState } from "@/state";

/**
 * Which entries have changed since you last looked at them.
 *
 * An agent edits this bundle while it is open. The screen follows along, but a
 * change to something you were not looking at is a change you never learn
 * about, so each entry carries the bundle version its content last moved at and
 * this remembers the version you last saw it at. Newer means unseen.
 *
 * Seen is a property of a person and a browser, not of the bundle, so it lives
 * in per-bundle browser state. Writing it into the files would put one reader's
 * attention into everyone's repository, and into git.
 *
 * Comparing versions rather than diffing trees is what makes this survive a
 * missed event: whatever you did or did not receive, the answer comes from the
 * numbers in hand.
 */
export function useSeen(bundleId: string, tree: TreeNode, current: string) {
  // null means this browser has never opened this bundle, which is different
  // from having opened it and seen nothing.
  const [seen, setSeen] = useBundleState<Record<string, number> | null>(bundleId, "seen", null);

  const changedAt = useMemo(() => collect(tree, {}), [tree]);

  // On first sight everything counts as seen. Marking a whole tree on first
  // open would be noise: the mark means *changed since you were here*, not
  // *unread*.
  useEffect(() => {
    if (seen === null) setSeen(changedAt);
  }, [seen, setSeen, changedAt]);

  const unseen = useMemo(() => {
    const out = new Set<string>();
    if (seen === null) return out; // still deciding what the baseline is
    for (const [path, at] of Object.entries(changedAt)) {
      // The entry on screen is never news, whether it moved because you ticked
      // a box in it or because an agent edited it while you read: either way
      // you are watching it happen.
      //
      // Derived here rather than left to markSeen to undo a frame later. That
      // effect runs after a render triggered by a fetch resolving, which React
      // may paint before — so the mark would appear and vanish, on the one
      // entry guaranteed to be under your eyes.
      if (path === current) continue;
      // Absent means an entry that did not exist when the baseline was taken,
      // which is a change like any other.
      if (at > (seen[path] ?? 0)) out.add(path);
    }
    return out;
  }, [seen, changedAt, current]);

  const markSeen = useCallback(
    (path: string) => {
      const at = changedAt[path];
      if (at === undefined) return; // not an entry, or not in the tree yet
      setSeen((prev) => (prev?.[path] === at ? prev : { ...(prev ?? {}), [path]: at }));
    },
    [changedAt, setSeen],
  );

  // The same mark, applied to many at once, in one write rather than a loop of
  // them. What the recently-changed list dismisses from is exactly this: a set of
  // entries accounted for without opening each. One update, so the list does not
  // re-render per entry as a per-path loop would.
  const markManySeen = useCallback(
    (paths: string[]) => {
      setSeen((prev) => {
        const next = { ...(prev ?? {}) };
        let moved = false;
        for (const path of paths) {
          const at = changedAt[path];
          if (at !== undefined && next[path] !== at) {
            next[path] = at;
            moved = true;
          }
        }
        return moved ? next : (prev ?? next);
      });
    },
    [changedAt, setSeen],
  );

  // Handed back as well as used here, because "when did this entry's content
  // last move" answers two questions with one table: whether to mark it as
  // changed, and whether a copy of it already read is still the file.
  return { unseen, markSeen, markManySeen, changedAt };
}

/** Whether anything below this folder is unseen, so the mark leads to it. */
export function folderHasUnseen(node: TreeNode, unseen: Set<string>): boolean {
  return (
    node.entries.some((e) => unseen.has(e.path)) ||
    node.children.some((c) => folderHasUnseen(c, unseen))
  );
}

function collect(node: TreeNode, out: Record<string, number>): Record<string, number> {
  for (const e of node.entries) out[e.path] = e.changedAt;
  for (const c of node.children) collect(c, out);
  return out;
}
