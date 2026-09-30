import type { TreeNode } from "@/api";
import type { Queue } from "@/queue";
import { describe } from "@/tree";
import { reordered, useDrag } from "@/views/drag";
import { useMemo } from "react";
import { Link } from "react-router";
import { groupColour, groupsUnder, NEUTRAL } from "@/colour";
import { count } from "@/count";
import { Glyph } from "@/ui/IconButton";

/**
 * Everything you saved to read later.
 *
 * A page rather than the panel this started as. Persisting rows make a panel
 * *possible* — nothing vanishes under the cursor the way it does on the changed
 * list — but they do not make one necessary, and a 256-pixel column truncates a
 * title at about four words. This list is consulted when you finish something and
 * choose what is next, which is a place you go rather than a companion you keep;
 * the tree stays the panel because steering a hierarchy is constant while
 * reading.
 *
 * The order is yours. New saves land at the end, and a drag by the handle (or
 * the arrow keys on it, for anyone without a pointer) puts a row where you want
 * to read it. The mechanism is the one the board uses to reorder columns, not a
 * second one.
 */
export function ReadLaterView({
  queue,
  tree,
  rootLabel,
}: {
  queue: Queue;
  tree: TreeNode;
  /** What to call the bundle root, for an entry that lives in it. */
  rootLabel: string;
}) {
  // Dropping a row lands it before the row under the pointer, which is what
  // `reordered` means and what the board's column drag already does.
  const { drag, handlers } = useDrag<string>((path, target) =>
    queue.reorder(reordered(queue.paths, path, target.drop)),
  );

  // One item cannot be reordered, so its handle would be an affordance that does
  // nothing. The remove control is still there.
  const canReorder = queue.paths.length > 1;
  const groups = useMemo(() => groupsUnder(tree, "/"), [tree]);

  return (
    <div className="animate-wv-fade mx-auto max-w-[760px] px-12 pt-11 pb-24">
      <h1 className="text-fg mb-1.5 text-[32px] font-bold tracking-[-0.03em]">Read later</h1>
      <p className="text-muted mb-7 text-pretty">
        {queue.paths.length === 0
          ? "While reading an entry that deserves more time than you have, save it with the bookmark and it waits here."
          : `${count(queue.paths.length, "entry", "entries")} to come back to, in the order you saved them, or the order you drag them into. Opening one leaves it here until you mark it done.`}
      </p>

      {queue.paths.length === 0 ? (
        <div className="border-line-2 text-faint rounded-xl border border-dashed p-10 text-center">
          Nothing saved. Use the bookmark on any entry.
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {queue.paths.map((path) => {
            // An entry that has gone keeps its filename and says so, rather
            // than being dropped: a list that quietly loses things is a list you
            // stop trusting.
            const { name, where, missing } = describe(tree, path, rootLabel);
            const dragging = drag?.item === path;
            // Where a drop would land: before the row under the pointer, drawn
            // as a line along that row's top edge.
            const target = drag !== null && drag.item !== path && drag.over?.drop === path;
            return (
              <li
                key={path}
                data-drop={canReorder ? path : undefined}
                // The whole row picks up, as in the reference and as a card on a
                // board does: a press that does not move is still a click, so
                // the link and the Done button keep working. The grip is where
                // the eye finds it, and where the keyboard reorders.
                {...(canReorder ? handlers(path) : {})}
                className={[
                  "border-line bg-panel flex items-center gap-3 rounded-xl border py-3 pr-3 pl-2",
                  canReorder ? "cursor-grab" : "",
                  target ? "shadow-[0_-3px_0_-1px_var(--color-accent)]" : "",
                  dragging ? "opacity-40" : "",
                ].join(" ")}
              >
                {canReorder && (
                  <Handle
                    label={name}
                    dragging={dragging}
                    onNudge={(delta) => queue.reorder(shifted(queue.paths, path, delta))}
                  />
                )}
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: missing ? NEUTRAL : groupColour(path, groups, "/") }}
                />
                {/* A path with nothing behind it still goes somewhere honest:
                    the reader's placeholder for an entry nobody has written
                    says so, where a dead row would just sit there.
                    Not draggable itself: an anchor starts the browser's own
                    link-drag, and then the row's drag never begins. */}
                <Link to={"/wiki" + path} draggable={false} className="min-w-0 flex-1">
                  <span className="text-fg block truncate font-medium">{name}</span>
                  {/* For a gone entry the second line says so, in place of a
                      folder it no longer lives in. */}
                  <span className="text-muted mt-0.5 block truncate text-[12.5px]">
                    {missing ? "Entry not found in this bundle" : where}
                  </span>
                </Link>
                {/* Taking it off is explicit, because opening it never will. */}
                <button
                  type="button"
                  onClick={() => queue.toggle(path)}
                  aria-label={`Remove ${name} from read later`}
                  title="Done — take it off the list"
                  className="border-line text-muted hover:border-ok hover:text-ok flex h-7.5 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px]"
                >
                  <Glyph size={13}>
                    <path d="M5 12l5 5L20 7" />
                  </Glyph>
                  Done
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* The row itself under the pointer while dragging, at its own width and
          from where it was grabbed, so what moves is what you picked up. */}
      {drag && (
        <div
          style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.width }}
          data-print="hide"
          className="border-accent bg-elev shadow-float pointer-events-none fixed z-50 flex rotate-1 items-center gap-3 rounded-xl border py-3 pr-3 pl-2"
        >
          <span className="text-accent-ink grid size-7 shrink-0 place-items-center" aria-hidden>
            <Grip />
          </span>
          <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: groupColour(drag.item, groups, "/") }} />
          <span className="min-w-0 flex-1">
            <span className="text-fg block truncate font-medium">{describe(tree, drag.item, rootLabel).name}</span>
            <span className="text-muted mt-0.5 block truncate text-[12.5px]">{describe(tree, drag.item, rootLabel).where}</span>
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * The grip that reorders a row: drag it, or arrow up and down when it has focus.
 *
 * The arrows are the keyboard half of the same job, not a second visible control
 * — the reason this list is dragged rather than fitted with per-row up/down
 * buttons is that those are clutter, and they are fine as the thing a focused
 * handle responds to, where they cost no space.
 */
function Handle({
  label,
  dragging,
  onNudge,
}: {
  label: string;
  dragging: boolean;
  onNudge: (delta: number) => void;
}) {
  return (
    <button
      type="button"
      onKeyDown={(e) => {
        if (e.key === "ArrowUp") {
          e.preventDefault();
          onNudge(-1);
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          onNudge(1);
        }
      }}
      aria-label={`Reorder ${label}, arrow up or down`}
      title="Drag to reorder, or use arrow keys"
      className={[
        // Muted, not faint: the grip is how the row says it can be picked up.
        "grid size-7 shrink-0 cursor-grab touch-none place-items-center rounded-md",
        dragging ? "text-accent-ink" : "text-muted hover:text-fg hover:bg-fg/5",
      ].join(" ")}
    >
      <Grip />
    </button>
  );
}

/** Six dots: something you can pick up. */
function Grip() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}

/** A path moved by `delta` places, clamped to the ends. The keyboard's one-step
 *  version of a drop, kept here because it is the arrows' whole behaviour. */
function shifted(paths: string[], path: string, delta: number): string[] {
  const from = paths.indexOf(path);
  if (from < 0) return paths;
  const to = Math.max(0, Math.min(paths.length - 1, from + delta));
  if (to === from) return paths;
  const next = paths.filter((p) => p !== path);
  next.splice(to, 0, path);
  return next;
}
