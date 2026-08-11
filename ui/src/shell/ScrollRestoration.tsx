import { useEffect, useRef, type RefObject } from "react";
import { useLocation, useNavigationType } from "react-router";

/**
 * Puts the scroll position where it belongs after a navigation.
 *
 * Three cases, and they are genuinely different:
 *
 *   - **A new page** starts at the top. Arriving halfway down an entry because
 *     the previous one was scrolled there is disorienting.
 *   - **Going back** returns to where you were. Losing your place is the thing
 *     that makes people stop using back.
 *   - **A link to a heading** wins over both, and is the case most likely to be
 *     forgotten: `#a-heading` has to scroll to that heading, not to the top.
 *
 * The scrolling element is the view area rather than the window — the shell owns
 * the page height — so this cannot use the browser's own restoration or
 * react-router's, both of which assume the document scrolls.
 *
 * Positions are keyed by `location.key`, not by pathname: the same entry visited
 * twice in a history stack has two positions, and conflating them would restore
 * the wrong one.
 */
export function ScrollRestoration({ containerRef }: { containerRef: RefObject<HTMLElement | null> }) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const positions = useRef(new Map<string, number>());

  // Remember where this entry in the history stack was left. Recorded on the way
  // out rather than on every scroll event, which would be the same value written
  // hundreds of times.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const key = location.key;
    return () => {
      positions.current.set(key, el.scrollTop);
    };
  }, [location.key, containerRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (location.hash) {
      // The content may not be rendered yet on a cold load, so this retries
      // briefly rather than giving up on the first miss. It stops as soon as it
      // finds the target, and after a short window regardless.
      let cancelled = false;
      const deadline = Date.now() + 1000;
      const find = () => {
        if (cancelled) return;
        const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
        if (target) {
          target.scrollIntoView({ block: "start" });
          return;
        }
        if (Date.now() < deadline) requestAnimationFrame(find);
      };
      find();
      return () => {
        cancelled = true;
      };
    }

    if (navigationType === "POP") {
      const saved = positions.current.get(location.key);
      if (saved !== undefined) {
        el.scrollTop = saved;
        return;
      }
    }
    el.scrollTop = 0;
  }, [location.key, location.hash, navigationType, containerRef]);

  return null;
}
