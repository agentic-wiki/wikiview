import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useBundle } from "@/bundle";
import { NARROW, useMedia } from "@/media";
import { find } from "@/tree";
import { useEscape } from "@/ui/escape";
import { useBundleState } from "@/state";
import { GroupChip } from "@/ui/GroupChip";
import { Glyph, IconButton } from "@/ui/IconButton";
import { EntryView, type Property } from "@/views/EntryView";
import type { Queue } from "@/queue";

/**
 * One entry, opened beside the view it was picked from: a board's card, a
 * graph's node (backlog/8-design/010).
 *
 * A panel floating over the view's right edge rather than a centred dialog, and
 * not a column either: it takes no width from the view, which stays whole
 * underneath and keeps answering clicks — another card opens in its place, and
 * empty board closes it. The view is the context the entry is being read in, so
 * it stays in sight rather than behind a backdrop.
 */
export function CardSheet({
  path,
  version,
  refresh,
  changedAt,
  queue,
  destination,
  hrefFor,
  properties,
  hint = "Esc to close",
  onClose,
}: {
  path: string;
  version: number;
  refresh: number;
  changedAt?: number;
  queue: Queue;
  /** Where a link from the entry goes. The view decides: a link to something on
   *  it opens that over the view, and anything else leaves for the reader. */
  destination: (to: string) => string;
  /** The address of another entry opened in this sheet, for going back to it. */
  hrefFor: (path: string) => string;
  /** Rows the view draws in the entry's properties: a card's status and lane. */
  properties?: Property[];
  /** What the footer says, beside the way to the full page. */
  hint?: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { tree } = useBundle();
  // On a narrow screen there is no edge to float beside, so it rises from the
  // bottom over a backdrop, and the view behind it waits.
  const narrow = useMedia(NARROW);
  const root = useRef<HTMLDivElement>(null);
  useEscape(onClose);
  const { bundle } = useBundle();
  // Its width is yours to set, by the handle on its left edge, and kept per
  // bundle: how much of a board you want to give a card is a habit.
  const [width, setWidth] = useBundleState<number>(bundle.id, "sheet:width", SHEET_WIDTH);

  // The entries this sheet has shown, so a link followed inside it can be
  // walked back. Its own, not the browser's: the browser's back leaves the view
  // the way it always has, and this resets when the sheet closes.
  const [history, setHistory] = useState<string[]>([]);
  const shown = useRef(path);
  const goingBack = useRef(false);
  useEffect(() => {
    if (shown.current === path) return;
    const was = shown.current;
    shown.current = path;
    if (goingBack.current) goingBack.current = false;
    else setHistory((h) => [...h, was]);
  }, [path]);
  const back = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    goingBack.current = true;
    setHistory(history.slice(0, -1));
    navigate(hrefFor(previous), { replace: true });
  };

  // A press on the view itself — empty board, not a card, not a control —
  // closes the sheet: it is the view saying you are done with this one. A card
  // is a link, so pressing one opens it here instead. A graph's canvas is an
  // svg you pan by pressing, so it is left to the graph, which closes the
  // sheet on a press that did not pan.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target || root.current?.contains(target)) return;
      if (target.closest("a, button, input, select, textarea, label, svg, nav, aside, header, [role='dialog']")) return;
      onClose();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [onClose]);

  // The sheet scrolls its own body, so following a link from halfway down one
  // entry into another would start you halfway down that one.
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (body.current) body.current.scrollTop = 0;
  }, [path]);

  const stub = find(tree, path);
  const type = stub && "type" in stub ? stub.type : "";
  const saved = queue.queued.has(path);

  return (
    // On paper the sheet stops being a sheet and becomes the page: the print
    // rules key off `data-print="sheet"`.
    <>
    {narrow && (
      <div data-print="hide" aria-hidden className="animate-wv-fade fixed inset-0 z-55 bg-black/50" />
    )}
    <div
      data-print="sheet"
      ref={root}
      className={
        narrow
          ? "fixed inset-x-0 top-[14vh] bottom-0 z-56"
          : "absolute top-2.5 right-2.5 bottom-2.5 z-30 w-[min(var(--sheet),calc(100%-20px))]"
      }
      // Never wider than the view it floats over, whatever was stored. The
      // width is a custom property the class reads, like the board's colours.
      style={narrow ? undefined : ({ "--sheet": `${clampWidth(width)}px` } as React.CSSProperties)}
    >
      {!narrow && <ResizeHandle width={clampWidth(width)} onWidth={(w) => setWidth(clampWidth(w))} root={root} />}
      <div
        role="dialog"
        aria-label={path}
        className={[
          "bg-elev shadow-float flex h-full min-h-0 flex-col overflow-hidden",
          narrow ? "animate-wv-in rounded-t-[18px]" : "animate-wv-peek rounded-[14px]",
        ].join(" ")}
      >
        <header data-print="hide" className="border-line flex shrink-0 items-center gap-1.5 border-b py-2.5 pr-2.5 pl-3.5">
          {history.length > 0 && (
            <IconButton label="Back" size="xs" onClick={back}>
              <Glyph size={15}>
                <path d="M15 6l-6 6 6 6" />
              </Glyph>
            </IconButton>
          )}
          <GroupChip path={path} />
          <span className="text-faint text-xs first-letter:uppercase">{type || "entry"}</span>
          <div className="flex-1" />
          <IconButton
            label={saved ? "Remove from read later" : "Save to read later"}
            size="xs"
            active={saved}
            aria-pressed={saved}
            onClick={() => queue.toggle(path)}
          >
            <Glyph size={15}>
              <path d="M18.5 21l-6.5-4-6.5 4V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2z" fill={saved ? "currentColor" : "none"} />
            </Glyph>
          </IconButton>
          <Link
            to={"/wiki" + path}
            aria-label="Open full page"
            title="Open full page"
            className="text-muted hover:bg-fg/5 hover:text-fg grid size-7.5 place-items-center rounded-[7px]"
          >
            <Glyph size={15}>
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </Glyph>
          </Link>
          <IconButton label="Close card" size="xs" onClick={onClose}>
            <Glyph size={15}>
              <path d="M18 6L6 18M6 6l12 12" />
            </Glyph>
          </IconButton>
        </header>

        <div ref={body} className="min-h-0 grow overflow-y-auto">
          <EntryView
            path={path}
            version={version}
            refresh={refresh}
            changedAt={changedAt}
            destination={destination}
            queued={saved}
            onQueue={() => queue.toggle(path)}
            properties={properties}
            inCard
          />
        </div>

        <footer data-print="hide" className="border-line flex shrink-0 items-center gap-2 border-t px-3.5 py-3">
          <span className="text-faint flex-1 text-xs">{hint}</span>
          <Link
            to={"/wiki" + path}
            className="border-line-2 text-fg hover:bg-fg/5 flex h-8.5 items-center rounded-[9px] border px-3.5 font-medium"
          >
            Open full page
          </Link>
        </footer>
      </div>
    </div>
    </>
  );
}

/**
 * The address of an entry open over a view: `/<prefix>/<id>/<entry path>`.
 *
 * The id is one segment and never a folder name, so everything after the first
 * slash is the bundle path — no separator to invent and nothing to guess. Each
 * segment is encoded the way an entry URL's are, which leaves the slashes
 * between them alone and escapes anything inside a name that would end the
 * path early.
 */
export function sheetHref(prefix: string, id: string, path: string): string {
  const segments = path.replace(/^\//, "").split("/").map(encodeURIComponent);
  return prefix + "/" + encodeURIComponent(id) + "/" + segments.join("/");
}

/**
 * Splits `/<prefix>/<id>/<entry path>` into the view's id and the entry open on
 * it, "" for none. The first segment is always an id, which is what makes the
 * split exact.
 *
 * Takes the pathname decoded, and decodes nothing itself: decoding twice turns a
 * filename with a `%` in it into a different name.
 */
export function splitSheetPath(pathname: string, prefix: string): { id: string; path: string } {
  const rest = pathname.slice(prefix.length).replace(/^\//, "");
  const cut = rest.indexOf("/");
  return cut < 0 ? { id: rest, path: "" } : { id: rest.slice(0, cut), path: rest.slice(cut) };
}

/** The sheet's width until you set your own, and the narrowest it goes. */
const SHEET_WIDTH = 480;
const MIN_WIDTH = 360;
/** How far an arrow key moves the handle. */
const STEP = 24;

/** A stored width, kept at or above the narrowest a sheet reads well at. The
 *  widest is the view's own width, which the style caps. */
function clampWidth(w: number): number {
  return Number.isFinite(w) ? Math.max(MIN_WIDTH, Math.round(w)) : SHEET_WIDTH;
}

/**
 * The sheet's left edge, to drag wider or narrower: a separator you can also
 * focus and move with the arrow keys, and double-click to put back.
 *
 * Measured against the view the sheet floats over, so a drag cannot pull the
 * sheet past its far edge.
 */
function ResizeHandle({
  width,
  onWidth,
  root,
}: {
  width: number;
  onWidth: (width: number) => void;
  root: React.RefObject<HTMLDivElement | null>;
}) {
  const start = useRef<{ x: number; width: number } | null>(null);
  const widest = () => {
    const view = root.current?.parentElement?.clientWidth ?? 0;
    return view > 0 ? view - 20 : Infinity;
  };
  const set = (w: number) => onWidth(Math.min(w, widest()));
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the panel"
      aria-valuenow={width}
      aria-valuemin={MIN_WIDTH}
      tabIndex={0}
      data-print="hide"
      title="Drag to resize · double-click to reset"
      className="group absolute inset-y-3 -left-1.5 z-10 flex w-3 cursor-col-resize touch-none justify-center outline-none"
      onPointerDown={(e) => {
        e.preventDefault();
        start.current = { x: e.clientX, width };
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        const s = start.current;
        // Dragging left widens: the sheet is pinned to the right.
        if (s) set(s.width + (s.x - e.clientX));
      }}
      onPointerUp={() => (start.current = null)}
      onPointerCancel={() => (start.current = null)}
      onDoubleClick={() => onWidth(SHEET_WIDTH)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          set(width + STEP);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          set(width - STEP);
        }
      }}
    >
      {/* A line that shows on hover and focus, so the edge says it can move
          without drawing a handle nobody asked to see. */}
      <span className="group-hover:bg-accent/70 group-focus-visible:bg-accent h-full w-[3px] rounded-full bg-transparent transition-colors" />
    </div>
  );
}
