import { useEffect, useMemo } from "react";
import { Link, NavLink, useLocation } from "react-router";
import type { TreeNode } from "@/api";
import { useBundleState } from "@/state";
import { folderHasUnseen } from "@/seen";
import { groupsUnder, type Group } from "@/colour";

/**
 * The bundle's folders and entries.
 *
 * Folders are collapsed by default — a large bundle should open navigable
 * rather than as a wall — except along the path to whatever is being viewed, so
 * arriving at a deep entry shows you where you are instead of an empty tree.
 * Reopening that path is automatic on navigation, and manual toggles are kept
 * afterwards: an expansion you performed is not undone by the next click.
 */
/**
 * A dot saying something changed here since you last looked.
 *
 * A dot rather than a count: a count has to be recomputed as descendants clear,
 * and a wrong count is more annoying than no count. What it means is the same
 * either way — look inside.
 */
function Unseen() {
  return (
    <span
      className="bg-accent size-1.5 shrink-0 rounded-full"
      title="Changed since you last opened it"
      aria-label="changed"
    />
  );
}

/**
 * A bookmark saying this entry is saved to read later.
 *
 * A different *shape* from the changed dot rather than a different colour. Both
 * can sit on one row, and two coloured dots side by side have to be read against
 * each other to mean anything — which is not reading, at this size. Muted, too:
 * the accent is spoken for by the dot, which is the mark that is news.
 */
function SavedMark() {
  // Labelled on the wrapper, exactly as the dot is: the mark is one thing to
  // announce, and a <title> inside the glyph would also put its words into the
  // row's text.
  return (
    <span className="text-muted" title="Saved to read later" aria-label="read later">
      <svg
        viewBox="0 0 24 24"
        className="size-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <path d="M7 4h10v16l-5-4-5 4z" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/**
 * The two marks a row can carry, in a fixed two-slot column.
 *
 * Each glyph sits centred in a slot of its own rather than shoved against the
 * row's edge. Flush-right by box they painted a jagged edge: the dot fills its
 * box and the bookmark's shape stops short of its, so their painted edges landed
 * a few pixels apart and did not line up down the tree. Slots the width of each
 * glyph, always in the same order, put every dot in one column and every bookmark
 * in another whether or not the row carries the other mark.
 *
 * The bookmark first, the dot outermost: the dot is the news, so it is the one
 * the edge of the tree is scanned for. An empty slot still holds its width, which
 * is what keeps a dot-only row and a both-marked row sharing the same dot column.
 */
function Marks({ saved, changed }: { saved: boolean; changed: boolean }) {
  if (!saved && !changed) return null;
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1">
      <span className="grid w-3 place-items-center">{saved && <SavedMark />}</span>
      <span className="grid w-1.5 place-items-center">{changed && <Unseen />}</span>
    </span>
  );
}

export function Tree({
  node,
  bundleId,
  unseen,
  saved,
}: {
  node: TreeNode;
  bundleId: string;
  unseen: Set<string>;
  saved: Set<string>;
}) {
  const location = useLocation();
  const current = decodeURIComponent(location.pathname).replace(/^\/wiki/, "");
  // Kept across reloads, and scoped to this bundle: the paths mean nothing in
  // another one. Stored as a list because that is what JSON has; a Set is what
  // the render wants.
  const [expanded, setExpanded] = useBundleState<string[]>(bundleId, "tree:expanded", []);
  const open = useMemo(() => new Set(expanded), [expanded]);
  // Top-level folders carry their group's colour, the same one the rest of the
  // app draws their entries in (backlog/8-design/003).
  const groups = useMemo(() => groupsUnder(node, "/"), [node]);

  // Ancestors of the current entry, reopened whenever it changes. A union
  // rather than a replacement, so folders opened by hand stay open.
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const parts = current.split("/").filter(Boolean).slice(0, -1);
      let path = "";
      for (const part of parts) {
        path += "/" + part;
        next.add(path);
      }
      // Same set, same array: returning a new one every navigation would write
      // to storage and re-render on every click through the tree.
      return next.size === prev.length ? prev : [...next];
    });
  }, [current, setExpanded]);

  const toggle = (path: string) =>
    setExpanded((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    );

  return (
    <Level
      node={node}
      depth={0}
      open={open}
      toggle={toggle}
      current={current}
      unseen={unseen}
      saved={saved}
      groups={groups}
    />
  );
}

/**
 * Where a row's content starts.
 *
 * Every level below the top has one column its names start in, 12px further in
 * than the level above, shared by its folders and its entries — so siblings
 * line up whatever they are, and deeper always reads as further right. The
 * first of those columns is the top-level folders' names, which sit past a
 * chevron and a dot, so a folder's entries start under its name.
 *
 * Lining an entry up with its own folder's name instead looked the same at the
 * top and drifted below it: only top-level folders have a dot, so the next
 * level's names start 15px earlier, and their entries ended up 3px left of the
 * level above.
 */
function column(depth: number): number {
  return 46 + (depth - 1) * 12;
}
/** A folder's chevron hangs before its name: 15px of it past the padding, and
 *  the 8px gap. The top level is the exception, at 8px, with its dot between. */
function folderIndent(depth: number): number {
  return depth === 0 ? 8 : column(depth) - 23;
}
/** Entries at the bundle's root have no folder to sit under. */
function entryIndent(depth: number): number {
  return depth === 0 ? 12 : column(depth);
}

function Level({
  node,
  depth,
  open,
  toggle,
  current,
  unseen,
  saved,
  groups,
}: {
  node: TreeNode;
  depth: number;
  open: Set<string>;
  toggle: (path: string) => void;
  current: string;
  unseen: Set<string>;
  saved: Set<string>;
  groups: Group[];
}) {
  return (
    <ul>
      {node.children.map((child) => {
        const isOpen = open.has(child.path);
        // On its listing, or on its own index.md: either way you are looking at
        // this folder, so it is the row that says so.
        const here = current === child.path || current === child.path + "/";
        const colour = depth === 0 ? groups.find((g) => g.path === child.path)?.colour : undefined;
        return (
          <li key={child.path}>
            {/* Two controls in one row, because a folder is two things: a place
                to go and a list to open. The chevron only opens and closes the
                list; the name goes to the folder and opens or closes it too. */}
            <div
              style={{ paddingLeft: `${folderIndent(depth)}px` }}
              className={[
                "group flex min-h-8 items-center gap-2 rounded-[7px] pr-2 font-medium",
                here ? "bg-accent-bg text-accent-ink" : "text-fg hover:bg-fg/5",
              ].join(" ")}
            >
              <button
                type="button"
                onClick={() => toggle(child.path)}
                aria-expanded={isOpen}
                aria-label={`${isOpen ? "Collapse" : "Expand"} ${child.label ?? child.name}`}
                className="hover:bg-line -ml-[5px] grid size-5 shrink-0 place-items-center rounded-[5px]"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="13"
                  height="13"
                  className={["text-faint transition-transform duration-150", isOpen ? "rotate-90" : ""].join(" ")}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
              <Link
                to={"/wiki" + child.path + "/"}
                // Goes to the folder and opens or closes it, so the row you
                // are pointing at is enough for both: the chevron is a small
                // target to go back to just to close what a click opened. A
                // modified click opens the folder somewhere else, and leaves
                // this tree as it is.
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                  toggle(child.path);
                }}
                className="flex min-w-0 flex-1 items-center gap-2 self-stretch"
              >
                {colour && (
                  <span className="size-[7px] shrink-0 rounded-[2px]" style={{ background: colour }} aria-hidden />
                )}
                <span className="truncate">{child.label ?? child.name}</span>
                {/* Only while shut. Once it is open the marks inside say it
                    better, and a folder wearing its children's dot as well is
                    the same fact twice. In the same column as an entry's dot,
                    since a folder never carries a bookmark. */}
                {!isOpen && <Marks saved={false} changed={folderHasUnseen(child, unseen)} />}
              </Link>
              <span className="text-faint shrink-0 font-mono text-[11px] font-normal">
                {child.entries.length + child.children.length}
              </span>
            </div>
            {isOpen && (
              <Level
                node={child}
                depth={depth + 1}
                open={open}
                toggle={toggle}
                current={current}
                unseen={unseen}
                saved={saved}
                groups={groups}
              />
            )}
          </li>
        );
      })}

      {node.entries.map((e) => (
        <li key={e.path}>
          <NavLink
            to={"/wiki" + e.path}
            style={{ paddingLeft: `${entryIndent(depth)}px` }}
            className={({ isActive }) =>
              [
                "flex min-h-8 items-center gap-2 rounded-[7px] pr-2",
                isActive ? "bg-accent-bg text-accent-ink font-medium" : "text-muted hover:text-fg hover:bg-fg/5",
              ].join(" ")
            }
            title={e.name}
          >
            <span className="truncate">{e.label}</span>
            <Marks saved={saved.has(e.path)} changed={unseen.has(e.path)} />
          </NavLink>
        </li>
      ))}
    </ul>
  );
}
