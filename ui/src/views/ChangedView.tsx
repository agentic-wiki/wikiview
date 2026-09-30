import { useMemo } from "react";
import type { EntryStub, TreeNode } from "@/api";
import { describe } from "@/tree";
import { Link } from "react-router";
import { groupColour, groupsUnder } from "@/colour";
import { count } from "@/count";
import { age } from "@/time";
import { Glyph, IconButton } from "@/ui/IconButton";

/**
 * What changed since you last looked.
 *
 * A page rather than a panel, and the reason is the click. Opening an entry
 * marks it seen, so its row leaves the list — in a panel that is a handle
 * disappearing from under the cursor while the rows below jump up, and the next
 * click lands on something you did not aim at. Here nobody sees it happen: you
 * left the page, and coming back renders what is left, minus what you read.
 *
 * The alternative was keeping rows and only dimming them, the way a mail client
 * does. That needs a second, session-scoped notion of "you have looked at this"
 * beside the versioned one the bundle already has, and two definitions of that
 * is a bug waiting for a reason. This one stores nothing: the marks in the tree
 * and this list are one state, read twice.
 */
export function ChangedView({
  tree,
  unseen,
  rootLabel,
  onDismiss,
  onDismissAll,
}: {
  tree: TreeNode;
  unseen: Set<string>;
  /** What to call the bundle root, for an entry that lives in it. */
  rootLabel: string;
  /** Mark one entry seen where it stands, the way opening it would. */
  onDismiss: (path: string) => void;
  /** The same, for every entry currently on the list. */
  onDismissAll: (paths: string[]) => void;
}) {
  const rows = useMemo(() => changed(tree, unseen), [tree, unseen]);
  const groups = useMemo(() => groupsUnder(tree, "/"), [tree]);

  return (
    <div className="animate-wv-fade mx-auto max-w-[760px] px-12 pt-11 pb-24">
      <div className="mb-1.5 flex items-baseline gap-3">
        <h1 className="text-fg text-[32px] font-bold tracking-[-0.03em]">Recently changed</h1>
        {/* Clears the lot at once, which after a `tidy --all` is thirty rows you
            have accounted for by other means. Counted in its own label rather
            than a bare "clear", because it dismisses things you have not opened
            and the number is the warning. Only when there is more than one: with
            a single row the per-row control already does it. */}
        {rows.length > 1 && (
          <button
            type="button"
            onClick={() => onDismissAll(rows.map((r) => r.entry.path))}
            className="text-muted hover:text-fg hover:bg-fg/5 ml-auto shrink-0 rounded-lg px-2.5 py-1 text-[13px]"
          >
            Mark all {rows.length} as seen
          </button>
        )}
      </div>
      {/* What the page is, not just how many rows are on it: this list exists
          because something else writes to these files while you read them, and
          that is not obvious from a heading. */}
      <p className="text-muted mb-7">
        {rows.length === 0
          ? "Entries something else changed while you were reading show up here, until you open them."
          : `${count(rows.length, "entry", "entries")} changed since you last opened ${
              rows.length === 1 ? "it" : "them"
            }, most recent first. Opening one takes it off this list.`}
      </p>

      {rows.length === 0 ? (
        <div className="border-line-2 text-faint rounded-xl border border-dashed p-10 text-center">
          Nothing has changed since you were last here.
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {rows.map(({ entry }) => {
            // What the entry calls itself, and where it lives when the name does
            // not already say — named the way the tree names it rather than as
            // a raw path (the reference shows the path; the tree's names were
            // chosen here first, and a row should read the same as the tree).
            const { name, where } = describe(tree, entry.path, rootLabel);
            return (
              <li key={entry.path} className="group hover:bg-fg/5 flex items-center gap-1 rounded-[10px] pr-1.5">
                <Link to={"/wiki" + entry.path} className="grid min-w-0 flex-1 grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-3.5 py-2.5 pl-3">
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ background: groupColour(entry.path, groups, "/") }}
                  />
                  <span className="min-w-0">
                    <span className="text-fg block truncate font-medium">{name}</span>
                    {where && <span className="text-faint mt-0.5 block truncate text-[12.5px]">{where}</span>}
                  </span>
                  <span className="text-faint text-xs whitespace-nowrap" title={entry.updated}>
                    {entry.updated ? age(entry.updated) : ""}
                  </span>
                </Link>
                {/* Marks it seen without opening it: a title tweak you can judge
                    from the row does not need a visit to clear. It touches seen
                    and nothing else, so an entry also in read-later stays there.
                    A tick rather than an X: this is "I have accounted for it,"
                    the same act as reading it, not a deletion. Shown on hover and
                    on focus, so the row stays quiet until you reach for it. */}
                <IconButton
                  label={`Mark ${name} as seen`}
                  size="sm"
                  onClick={() => onDismiss(entry.path)}
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Glyph size={15}>
                    <path d="M5 12l5 5L20 7" />
                  </Glyph>
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * The changed entries, newest first, each with the folder it sits in.
 *
 * Ordered by the version their content last moved at, which is the only clock
 * there is: `changedAt` counts bundle rebuilds, not seconds, so "most recent
 * first" is exact and "four minutes ago" is not available to say. Ties are one
 * rebuild — an agent writing several entries at once, which is the common case —
 * and fall back to the path so the order is stable between renders.
 */
function changed(tree: TreeNode, unseen: Set<string>): { entry: EntryStub }[] {
  const out: { entry: EntryStub }[] = [];
  const walk = (node: TreeNode) => {
    for (const e of node.entries) if (unseen.has(e.path)) out.push({ entry: e });
    for (const c of node.children) walk(c);
  };
  walk(tree);
  return out.sort(
    (a, b) => b.entry.changedAt - a.entry.changedAt || a.entry.path.localeCompare(b.entry.path),
  );
}
