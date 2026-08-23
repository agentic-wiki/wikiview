import type { TreeNode } from "@/api";
import type { Queue } from "@/queue";
import { describe } from "@/tree";
import { reordered, useDrag } from "@/views/drag";
import { count, FileIcon, Row } from "@/views/listing";

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

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-fg text-2xl font-semibold tracking-tight">Read later</h1>
      <p className="text-muted mt-1 text-sm">
        {queue.paths.length === 0
          ? "Nothing saved yet. While reading an entry that deserves more time than you have, save it with the bookmark button."
          : `${count(queue.paths.length, "entry", "entries")} to come back to, in the order you saved them, or the order you drag them into. Opening one leaves it here until you take it off.`}
      </p>

      <ul className="mt-6 space-y-1">
        {queue.paths.map((path) => {
          // An entry that has gone keeps its filename and says so, rather than
          // being dropped: a list that quietly loses things is a list you stop
          // trusting.
          const { name, where, missing } = describe(tree, path, rootLabel);
          const dragging = drag?.item === path;
          return (
            <Row
              key={path}
              dropId={canReorder ? path : undefined}
              // A path with nothing behind it still goes somewhere honest: the
              // reader's placeholder for an entry nobody has written says so,
              // where a dead row would just sit there.
              to={"/wiki" + path}
              icon={<FileIcon />}
              title={name}
              // For a gone entry the second line says so, in place of a folder it
              // no longer lives in: `describe` would otherwise fall back to the
              // bundle name, which reads as "it is in the root" — the opposite of
              // true. Still a row, still removable, rather than dropped.
              subtitle={missing ? "Entry not found in this bundle" : where}
              lead={
                canReorder ? (
                  <Handle
                    label={name}
                    dragging={dragging}
                    handlers={handlers(path)}
                    onNudge={(delta) => queue.reorder(shifted(queue.paths, path, delta))}
                  />
                ) : undefined
              }
              // Taking it off is explicit, because opening it never will. This is
              // the only place that can do it, now that the list has one home.
              action={
                <button
                  type="button"
                  onClick={() => queue.toggle(path)}
                  aria-label={`Remove ${name} from read later`}
                  title="Remove from read later"
                  className="text-muted hover:text-fg hover:bg-fg/5 grid size-8 shrink-0 place-items-center rounded-md"
                >
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                </button>
              }
            />
          );
        })}
      </ul>

      {/* The row under the pointer while dragging, so the grab has weight and you
          can see what is moving. Named, not the whole row, because a title is
          what you are placing. */}
      {drag && (
        <div
          style={{ left: drag.x - drag.dx, top: drag.y - drag.dy }}
          data-print="hide"
          className="border-accent bg-surface elev-3 text-fg pointer-events-none fixed z-50 flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
        >
          <FileIcon />
          <span className="truncate">{describe(tree, drag.item, rootLabel).name}</span>
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
  handlers,
  onNudge,
}: {
  label: string;
  dragging: boolean;
  handlers: Record<string, unknown>;
  onNudge: (delta: number) => void;
}) {
  return (
    <button
      type="button"
      {...handlers}
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
        "grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-md",
        dragging ? "text-accent" : "text-muted hover:text-fg hover:bg-fg/5",
      ].join(" ")}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
        <circle cx="9" cy="6" r="1.4" />
        <circle cx="15" cy="6" r="1.4" />
        <circle cx="9" cy="12" r="1.4" />
        <circle cx="15" cy="12" r="1.4" />
        <circle cx="9" cy="18" r="1.4" />
        <circle cx="15" cy="18" r="1.4" />
      </svg>
    </button>
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
