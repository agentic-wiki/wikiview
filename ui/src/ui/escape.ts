import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * Escape closes the topmost thing, and only that.
 *
 * Every layer — the palette, a settings dialog, the git popover, a card's sheet
 * — used to listen on the window for itself, so one press closed all of them at
 * once: the palette opened over a card took the card with it. Now each layer
 * registers here while it is open, and a press goes to the one registered last,
 * which is the one on top.
 */
const stack: { current: () => void }[] = [];

function onKey(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  const top = stack[stack.length - 1];
  if (!top) return;
  e.preventDefault();
  top.current();
}

let listening = false;

export function useEscape(onEscape: () => void) {
  // The latest handler, so a layer re-rendering does not lose its place in the
  // stack by re-registering.
  const handler = useRef(onEscape);
  useLayoutEffect(() => {
    handler.current = onEscape;
  });
  useEffect(() => {
    if (!listening) {
      window.addEventListener("keydown", onKey);
      listening = true;
    }
    stack.push(handler);
    return () => {
      const i = stack.lastIndexOf(handler);
      if (i >= 0) stack.splice(i, 1);
    };
  }, []);
}
