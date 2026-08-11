import { useEffect } from "react";
import { useLocation } from "react-router";

/**
 * Drops any text selection when the route changes.
 *
 * React reuses DOM nodes between routes, so a selection anchored in the previous
 * entry survives into the next one and reappears over whatever text now occupies
 * those nodes — highlighted words nobody selected. A full page load would never
 * do this; it is a consequence of navigating without one.
 *
 * Only on navigation. Clearing more eagerly would fight the user mid-selection.
 */
export function ClearSelection() {
  const { pathname } = useLocation();

  useEffect(() => {
    const selection = window.getSelection();
    // An empty selection still reports a range in some browsers, so check that
    // something is actually selected before touching it — collapsing a caret
    // that a focused input owns would move the user's cursor.
    if (selection && !selection.isCollapsed) selection.removeAllRanges();
  }, [pathname]);

  return null;
}
