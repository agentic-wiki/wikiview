import { useCallback, useMemo } from "react";
import { useBundleState } from "@/state";

/** The entries you meant to come back to, and the one thing you can do to them. */
export interface Queue {
  /** In the order they were added, oldest first: a queue is worked from the front. */
  paths: string[];
  /** The same list, for asking about one path while rendering a tree of them. */
  queued: Set<string>;
  toggle: (path: string) => void;
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

  // Appended, never sorted: the order you added things in is the only order this
  // list knows, and any other would need a second decision from whoever added
  // them.
  const toggle = useCallback(
    (path: string) =>
      setPaths((prev) => (prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path])),
    [setPaths],
  );

  return { paths, queued, toggle };
}
