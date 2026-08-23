import { useCallback, useMemo } from "react";
import { useBundleState } from "@/state";

/** The entries you meant to come back to, and what you can do to them. */
export interface Queue {
  /** The order to read them in: what you added first, until you say otherwise. */
  paths: string[];
  /** The same list, for asking about one path while rendering a tree of them. */
  queued: Set<string>;
  toggle: (path: string) => void;
  /** Set the whole order at once, which is what a reorder produces. */
  reorder: (paths: string[]) => void;
}

/**
 * A queue of entries to come back to.
 *
 * A queue rather than favourites, which sound like one feature and are two. A
 * queue is consumed and emptied, so what is in it is what you still owe
 * yourself. Favourites only grow, and a shelf that only grows stops being read —
 * and a wiki answers "somewhere I go back to often" already, with the tree, the
 * breadcrumb and ⌘K.
 *
 * Personal, so it lives in per-bundle browser state exactly like `seen`: what
 * one person owes themselves is not a property of the bundle, and writing it
 * into the files would put one reader's intentions into everybody's repository
 * and into git.
 *
 * Nothing here checks that a path still exists. What is queued is what you
 * queued; whether the entry survived is the tree's answer, given where the list
 * is drawn, and an entry silently dropped from a queue reads as the queue
 * losing things.
 */
export function useQueue(bundleId: string): Queue {
  const [paths, setPaths] = useBundleState<string[]>(bundleId, "queue", []);
  const queued = useMemo(() => new Set(paths), [paths]);

  // New things land at the end: added-order is the default until you drag it
  // into another. That order is now yours to change, which is why this appends
  // rather than sorting — a sort would be the thing undoing every drag.
  const toggle = useCallback(
    (path: string) =>
      setPaths((prev) => (prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path])),
    [setPaths],
  );

  // Kept honest against what is actually stored: a reorder can only permute the
  // list it was handed, so anything not already queued is dropped and anything
  // queued but missing is kept. Otherwise a stale caller could add or lose paths
  // through the back door of "just set the order".
  const reorder = useCallback(
    (next: string[]) =>
      setPaths((prev) => {
        const set = new Set(prev);
        const kept = next.filter((p) => set.has(p));
        return kept.length === prev.length ? kept : prev;
      }),
    [setPaths],
  );

  return { paths, queued, toggle, reorder };
}
