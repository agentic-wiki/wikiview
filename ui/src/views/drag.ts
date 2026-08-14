import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/** Where a drop would land: the target, and the band within it if there is one. */
export interface Target {
  /** The `data-drop` under the pointer. */
  drop: string;
  /** The `data-lane` under the pointer, or null when the pointer is in the
   *  target but not in any band of it. */
  lane: string | null;
}

/** A drag in progress. */
export interface Drag<T> {
  item: T;
  /** Where a release would put it, or null when that is nowhere. */
  over: Target | null;
  /** Pointer position, and where within the thing it was grabbed, so what
   *  follows the pointer sits under it the way the original did. */
  x: number;
  y: number;
  dx: number;
  dy: number;
  width: number;
}

/** How far a mouse moves before a press is a drag rather than a click. */
const THRESHOLD = 5;
/** How long a finger stays put before a press is a drag rather than a scroll. */
const HOLD = 200;
/** How far it may drift during that hold before it is read as a scroll. */
const DRIFT = 8;
/** How near an edge the pointer starts scrolling the board, and how fast at the
 *  very edge. */
const EDGE = 72;
const EDGE_SPEED = 16;

/**
 * Dragging something onto a drop target.
 *
 * Pointer events rather than HTML5 drag-and-drop, which does not fire for touch
 * at all and whose `dragend` belongs to the dragged element — the one React
 * unmounts the moment it re-renders into its new place, leaving the drag
 * stranded and the thing stuck looking picked up.
 *
 * The listeners are on the document rather than the element for the same reason:
 * the gesture outlives whatever started it.
 *
 * **Telling a drag from a scroll is the whole problem on touch.** A finger that
 * moves before the hold elapses is scrolling and is left alone; one that stays
 * put becomes a drag, and from then on `touchmove` is cancelled so the board
 * does not slide under it. Making the element `touch-action: none` instead is
 * the shortcut, and it costs scrolling entirely: a long column becomes
 * unreachable by touch.
 *
 * A target is any element carrying `data-drop`, found under the pointer rather
 * than measured, so nothing registers itself and a scrolled board needs no
 * recomputing. A `data-lane` ancestor or descendant of it is the second axis,
 * which is what lets one diagonal drag resolve both.
 */
export function useDrag<T>(onDrop: (item: T, target: Target) => void) {
  const [drag, setDrag] = useState<Drag<T> | null>(null);
  // Held in a ref so the document listeners attach once rather than again on
  // every render a caller with an inline handler causes.
  const drop = useRef(onDrop);
  drop.current = onDrop;
  // The live drag, read by listeners that are not re-attached per render.
  const active = useRef<Drag<T> | null>(null);
  const candidate = useRef<{ item: T; x: number; y: number; dx: number; dy: number; width: number; touch: boolean; timer: number | null } | null>(null);
  // Set when a drag ends and cleared by the click it swallows, or by the next
  // press if none comes.
  const dragged = useRef(false);
  const scrolling = useRef(0);
  const frame = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (candidate.current?.timer) clearTimeout(candidate.current.timer);
    candidate.current = null;
    active.current = null;
    scrolling.current = 0;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    document.body.style.userSelect = "";
    setDrag(null);
  }, []);

  const show = (next: Drag<T>) => {
    active.current = next;
    setDrag(next);
  };

  /**
   * Scrolls the board while the pointer sits near an edge.
   *
   * Without it a column off the side of the screen cannot be dropped into at
   * all, which on a phone is most of them.
   */
  const tick = useCallback(() => {
    frame.current = null;
    const s = active.current;
    if (!s || scrolling.current === 0) return;
    const scroller = elementAt(s.x, s.y)?.closest<HTMLElement>("[data-scroller]");
    if (!scroller) return;
    scroller.scrollLeft += scrolling.current;
    // The target under the pointer changes as the board slides beneath it.
    show({ ...s, over: targetAt(s.x, s.y) });
    frame.current = requestAnimationFrame(tick);
  }, []);

  const move = useCallback(
    (x: number, y: number) => {
      const s = active.current;
      if (!s) return;
      show({ ...s, x, y, over: targetAt(x, y) });

      const scroller = elementAt(x, y)?.closest<HTMLElement>("[data-scroller]");
      // Nothing to bring into reach if it all fits, and asking anyway would run
      // an animation frame per pointer move to scroll by zero.
      if (!scroller || scroller.scrollWidth <= scroller.clientWidth) return;
      const box = scroller.getBoundingClientRect();
      const left = x - box.left;
      const right = box.right - x;
      scrolling.current =
        left < EDGE
          ? -Math.ceil(((EDGE - left) / EDGE) * EDGE_SPEED)
          : right < EDGE
            ? Math.ceil(((EDGE - right) / EDGE) * EDGE_SPEED)
            : 0;
      if (scrolling.current !== 0 && frame.current === null) {
        frame.current = requestAnimationFrame(tick);
      }
    },
    [tick],
  );

  const begin = useCallback((x: number, y: number) => {
    const c = candidate.current;
    if (!c) return;
    document.body.style.userSelect = "none";
    show({ item: c.item, over: targetAt(x, y), x, y, dx: c.dx, dy: c.dy, width: c.width });
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const c = candidate.current;
      if (c && !active.current) {
        const travelled = Math.hypot(e.clientX - c.x, e.clientY - c.y);
        // A finger that moves before the hold is scrolling, so the press is
        // abandoned rather than turned into a drag.
        if (c.touch) {
          if (travelled > DRIFT) stop();
        } else if (travelled > THRESHOLD) {
          begin(e.clientX, e.clientY);
        }
        return;
      }
      if (active.current) move(e.clientX, e.clientY);
    };

    // Non-passive, or preventDefault is ignored and the board scrolls anyway.
    const onTouchMove = (e: TouchEvent) => {
      if (active.current) e.preventDefault();
    };

    const onUp = (e: PointerEvent) => {
      const s = active.current;
      if (s) {
        // Hit-tested again at the release rather than trusting the last move.
        // Starting a drag can change the layout under the pointer — empty lane
        // bands appear precisely then — and the drop belongs where the pointer
        // actually is, not where it was told last.
        const over = targetAt(e.clientX, e.clientY) ?? s.over;
        if (over) drop.current(s.item, over);
        // A pointerup is followed by a synthesized click, and on touch it lands
        // on the card itself — so without this, finishing a drag also opens
        // what was dragged.
        dragged.current = true;
      }
      stop();
    };

    // Capture, so it never reaches the handler it would otherwise trigger. A
    // flag rather than a listener armed for a few hundred milliseconds: a drag
    // released over nothing synthesizes no click at all, and a timer left
    // running would swallow a real one arriving just after.
    const onClick = (e: MouseEvent) => {
      if (!dragged.current) return;
      dragged.current = false;
      e.stopPropagation();
      e.preventDefault();
    };

    // The long press *is* the gesture, so the platform must not also read it as
    // a request for a context menu.
    const onContextMenu = (e: Event) => {
      if (active.current) e.preventDefault();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("click", onClick, true);
    };
  }, [begin, move, stop]);

  /** Spread onto whatever is draggable, with the item it stands for. */
  const handlers = useCallback(
    (item: T) => ({
      onPointerDown(e: ReactPointerEvent<HTMLElement>) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const box = e.currentTarget.getBoundingClientRect();
        const c = {
          item,
          x: e.clientX,
          y: e.clientY,
          dx: e.clientX - box.left,
          dy: e.clientY - box.top,
          width: box.width,
          touch: e.pointerType !== "mouse",
          timer: null as number | null,
        };
        if (c.touch) {
          c.timer = window.setTimeout(() => {
            if (candidate.current === c) begin(c.x, c.y);
          }, HOLD);
        }
        dragged.current = false;
        candidate.current = c;
      },
    }),
    [begin],
  );

  return { drag, handlers };
}

/**
 * `move` taken out of a list and put back before `onto`.
 *
 * The array operation a reorder-by-drop is, shared by the board's columns and
 * the read-later list so "drop onto a row lands before it" means one thing in
 * both. Returns the list unchanged when `onto` is not in it, so a drop over
 * nothing is a no-op rather than a loss.
 */
export function reordered<T>(values: T[], move: T, onto: T): T[] {
  const rest = values.filter((v) => v !== move);
  const at = rest.indexOf(onto);
  if (at < 0) return values;
  return [...rest.slice(0, at), move, ...rest.slice(at)];
}

function elementAt(x: number, y: number): Element | null {
  return document.elementFromPoint(x, y);
}

/** The drop target under a point, and the band of it the pointer is in. */
function targetAt(x: number, y: number): Target | null {
  const el = elementAt(x, y);
  const drop = el?.closest<HTMLElement>("[data-drop]")?.dataset.drop;
  if (drop === undefined) return null;
  return { drop, lane: el?.closest<HTMLElement>("[data-lane]")?.dataset.lane ?? null };
}
