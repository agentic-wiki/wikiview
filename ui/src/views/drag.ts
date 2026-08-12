import { useRef, useState, type MouseEvent, type PointerEvent } from "react";

/** A drag in progress. */
export interface Drag<T> {
  item: T;
  /** The drop target under the pointer, or null when it is over none. */
  over: string | null;
  /** Where the pointer is, so the caller can draw what is being dragged. */
  x: number;
  y: number;
}

/** How far the pointer travels before a press is a drag rather than a click. */
const THRESHOLD = 5;

/**
 * Dragging something onto a drop target.
 *
 * Pointer events rather than HTML5 drag-and-drop, so touch works at all and the
 * drag is not tied to an element React may unmount mid-move.
 *
 * A drop target is any element carrying `data-drop`; the one under the pointer
 * is found by asking the document rather than by measuring, so nothing has to
 * register itself or recompute when the board scrolls. Whatever the caller draws
 * under the pointer must not take pointer events, or it is the only thing ever
 * found there.
 *
 * `handlers(item)` goes on the draggable element. Its `onClick` is the reason
 * this owns the click too: the browser synthesizes one from the pointerdown and
 * pointerup pair however far the pointer travelled between them, so without
 * suppressing it, finishing a drag on a card also opens the card.
 */
export function useDrag<T>(onDrop: (item: T, target: string) => void) {
  const [drag, setDrag] = useState<Drag<T> | null>(null);
  const from = useRef<{ x: number; y: number; item: T } | null>(null);
  // Whether the threshold has been passed. A ref beside the state, because the
  // handler that ends a drag would otherwise be asking a render that has not
  // happened yet: a move and the release right after it are one batch, and the
  // release would read the drag as never having started.
  const active = useRef(false);
  // Cleared on the next press rather than after the click it suppresses, so a
  // gesture that never synthesizes one cannot leave this armed.
  const dragged = useRef(false);

  const handlers = (item: T) => ({
    onPointerDown(e: PointerEvent<Element>) {
      if (e.button !== 0) return;
      dragged.current = false;
      from.current = { x: e.clientX, y: e.clientY, item };
      // Captured, because the pointer leaves the card as soon as it moves and
      // the rest of the gesture still belongs to this element.
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove(e: PointerEvent<Element>) {
      const start = from.current;
      if (!start) return;
      // Under the threshold this is still a click being made, and treating it
      // as a drag would make every card need a steady hand to open.
      const travelled = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (!active.current && travelled < THRESHOLD) return;
      active.current = true;
      setDrag({
        item: start.item,
        over: targetAt(e.clientX, e.clientY),
        x: e.clientX,
        y: e.clientY,
      });
    },
    onPointerUp(e: PointerEvent<Element>) {
      const start = from.current;
      from.current = null;
      if (!active.current || !start) return; // a click, which the element's own handler owns
      active.current = false;
      dragged.current = true;
      setDrag(null);
      const target = targetAt(e.clientX, e.clientY);
      if (target) onDrop(start.item, target);
    },
    // A cancelled pointer drops nothing: the gesture was interrupted rather
    // than finished somewhere.
    onPointerCancel() {
      from.current = null;
      active.current = false;
      setDrag(null);
    },
    onClick(e: MouseEvent<Element>) {
      if (dragged.current) e.preventDefault();
    },
  });

  return { drag, handlers };
}

/** The nearest `data-drop` ancestor of whatever is at a point. */
function targetAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y);
  return el?.closest<HTMLElement>("[data-drop]")?.dataset.drop ?? null;
}
