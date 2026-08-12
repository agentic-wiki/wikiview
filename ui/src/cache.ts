import type { Entry } from "@/api";

/**
 * Entries already read this session, so returning to one is not a round trip.
 *
 * Two questions that look like one, kept apart:
 *
 * **"Is there anything to show right now?"** is about latency, and this answers
 * it. A copy taken on the way past is wrong for at most one round trip, and only
 * when the file has actually changed.
 *
 * **"Did the file change?"** is about truth, and this does not answer it at all.
 * The tree reports the version each entry's content last moved at, so a copy
 * taken at a later version *is* current — not probably, exactly. That is why
 * there is no timeout here and no guess about freshness: the comparison is
 * `at >= changedAt` and it is either true or it is not.
 *
 * A module rather than React state, because it has to outlive the component
 * between navigations and nothing renders from it directly.
 *
 * Unbounded on purpose: one copy per entry visited, so it is bounded by browsing
 * rather than by bundle size, and a session that reads a thousand entries has
 * other problems first. Worth a cap when something measures one that hurts.
 */
const kept = new Map<string, { entry: Entry; at: number }>();

/** Keeps a copy of an entry, noting the bundle version it was read at. */
export function remember(path: string, entry: Entry, at: number) {
  kept.set(path, { entry, at });
}

/** The copy held for a path, if there is one. */
export function recall(path: string): { entry: Entry; at: number } | undefined {
  return kept.get(path);
}

/**
 * Whether the copy held for a path is current.
 *
 * `changedAt` is when that entry's content last moved, from the tree. Unknown —
 * an entry the tree does not list — is never current: not knowing is a reason to
 * ask, not a reason to trust what is held.
 */
export function isCurrent(path: string, changedAt: number | undefined): boolean {
  const held = kept.get(path);
  return held !== undefined && changedAt !== undefined && held.at >= changedAt;
}

/** Empties the cache. For tests, which would otherwise start inside the last
 *  one's session. */
export function forget() {
  kept.clear();
}
