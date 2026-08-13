import { useEffect } from "react";
import { useLocation } from "react-router";
import type { BundleInfo, TreeNode } from "@/api";
import { find } from "@/tree";

/**
 * Keeps the browser's title saying what is on screen.
 *
 * A single-page app has to do this by hand, and it is not cosmetic: the title is
 * the tab, the window in an alt-tab list, the name a bookmark takes, the history
 * entry a back-button menu shows, and the header a browser prints at the top of
 * the page. All of those said "wikiview" for every entry in every bundle, which
 * is the same answer to five different questions.
 *
 * One rule: what you are looking at, then which bundle it is in. The bundle name
 * is the suffix rather than a view name like "Wiki" or "Kanban" — somebody with
 * three bundles open has three tabs to tell apart, and the view is already
 * obvious from the thing named in front of it.
 */
export function DocumentTitle({ bundle, tree }: { bundle: BundleInfo; tree: TreeNode }) {
  const title = titleFor(bundle, tree, decodeURIComponent(useLocation().pathname));

  useEffect(() => {
    document.title = title;
  }, [title]);

  return null;
}

/**
 * The title for a route.
 *
 * Derived from the tree rather than from the fetched entry, so it is right in
 * the same commit as the navigation: waiting for the fetch would leave the
 * previous entry's name in the tab, and a title that trails the page by a
 * network round trip is one a bookmark can catch mid-flight.
 *
 * Exported for tests, which is the only way to see the fallbacks — a bundle
 * whose root has no name, a board id that no longer exists.
 */
export function titleFor(bundle: BundleInfo, tree: TreeNode, pathname: string): string {
  const what = subject(bundle, tree, pathname);
  return what ? `${what} · ${bundle.label}` : bundle.label;
}

/** What the route is showing, or nothing when the route names no one thing. */
function subject(bundle: BundleInfo, tree: TreeNode, pathname: string): string | undefined {
  if (pathname.startsWith("/kanban")) {
    // The same split the board route makes: one id, then a bundle path.
    const rest = pathname.replace(/^\/kanban\/?/, "");
    const cut = rest.indexOf("/");
    const card = cut < 0 ? "" : rest.slice(cut);
    const board = bundle.boards?.find((b) => b.id === (cut < 0 ? rest : rest.slice(0, cut)));
    // The card when one is open: it is what you are reading, and the board is
    // context. Three names would not survive the width a tab has anyway.
    return (card ? nameOf(tree, card) : undefined) ?? board?.name;
  }
  if (pathname.startsWith("/wiki")) {
    return nameOf(tree, "/" + pathname.replace(/^\/wiki\/?/, ""));
  }
  return undefined;
}

/**
 * What to call the thing at a bundle path.
 *
 * An entry's own title first, because this names a page rather than a place —
 * the same reason the entry's page shows its title while the tree beside it
 * shows the filename. Failing that, the readable filename, which every entry
 * and folder has.
 */
function nameOf(tree: TreeNode, path: string): string | undefined {
  const node = find(tree, path);
  if (!node) return undefined;
  return ("title" in node ? node.title : undefined) || node.label;
}
