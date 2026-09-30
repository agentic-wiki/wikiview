import { useEffect, useState } from "react";

/** Below this the layout is the narrow one: tab bar, drawer, bottom sheet. */
export const NARROW = "(max-width: 779px)";

/**
 * Whether a media query matches now, following it as it changes: a window
 * resized, a phone turned. Read live rather than once at load, so a layout that
 * depends on width is the layout for the width you have.
 */
export function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange(); // the query may have changed since the first render
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/**
 * How wide an element's content box is, following it as it changes: a window
 * resized, a panel opened beside it. For layout that depends on the room a view
 * actually has, which the window's width does not say. Returns the ref to put
 * on the element, and its width — `null` until it has been measured.
 */
export function useInlineSize(): [(el: HTMLElement | null) => void, number | null] {
  const [size, setSize] = useState<number | null>(null);
  const [el, ref] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setSize(entry!.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return [ref, size];
}
