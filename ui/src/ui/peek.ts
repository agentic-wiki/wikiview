import { useEffect, useRef, useState, type FocusEvent } from "react";

/**
 * Open while pointed at or focused from the keyboard, closed once neither is
 * true: the one hover-to-reveal rule, for everything that uses it (the graph
 * legend, the entry's properties, its heading map).
 *
 * Two beats, each surface choosing its own. `openAfter` is how long the pointer
 * has to rest before it opens, so a pointer passing over on its way elsewhere
 * does not open it. `closeAfter` is how long it outlasts the pointer leaving,
 * so grazing an edge does not flicker it shut. Keyboard focus opens at once,
 * since tabbing to something is never passing by.
 *
 * Focus a click gives is not counted. It says nothing the pointer does not,
 * and it goes where the click leads: a link to a heading hands it on to the
 * page, and counting that as leaving would close the thing still under the
 * pointer. Whether a focus came from the keyboard is `:focus-visible`.
 *
 * Spread `handlers` on the element whose area counts — the trigger and what it
 * reveals together, so moving from one to the other does not close it.
 */
export function usePeek({ openAfter = 0, closeAfter = 200 }: { openAfter?: number; closeAfter?: number } = {}): {
  peeking: boolean;
  /** Closes it now, and keeps it closed until the pointer and focus have left:
   *  for a choice that means "put it away", made under the pointer. */
  dismiss: () => void;
  handlers: {
    onPointerEnter: () => void;
    onPointerLeave: () => void;
    onFocus: (e: FocusEvent<HTMLElement>) => void;
    onBlur: (e: FocusEvent<HTMLElement>) => void;
  };
} {
  const [peeking, setPeeking] = useState(false);
  const timer = useRef<number | null>(null);
  const inside = useRef({ pointer: false, focus: false });
  const held = useRef(false);
  const settle = (after: number) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    const on = inside.current.pointer || inside.current.focus;
    if (!on) held.current = false;
    if (on && held.current) return;
    if (after === 0) setPeeking(on);
    else timer.current = window.setTimeout(() => setPeeking(on), after);
  };
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  return {
    peeking,
    dismiss: () => {
      held.current = true;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      setPeeking(false);
    },
    handlers: {
      onPointerEnter: () => {
        inside.current.pointer = true;
        settle(openAfter);
      },
      onPointerLeave: () => {
        inside.current.pointer = false;
        settle(closeAfter);
      },
      onFocus: (e) => {
        if (inside.current.focus || !e.target.matches(":focus-visible")) return;
        inside.current.focus = true;
        settle(0);
      },
      // Only when focus leaves the whole area, not when it moves inside it.
      onBlur: (e) => {
        if (!inside.current.focus || e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        inside.current.focus = false;
        settle(closeAfter);
      },
    },
  };
}
