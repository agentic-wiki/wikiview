import { Link } from "react-router";
import type { TreeNode } from "@/api";
import { find } from "@/tree";

/** One step of the trail: somewhere to go, something to do, or where you are. */
export interface Crumb {
  label: string;
  to?: string;
  onClick?: () => void;
  /** The full name, when the label is shortened or readable-ized. */
  title?: string;
}

/**
 * How many path segments to show before collapsing the middle.
 *
 * A bundle path can be six folders deep, and a breadcrumb that wraps or pushes
 * the header controls off screen is worse than one that elides. First and last
 * are kept because they are what orient you: where it starts, and what you are
 * looking at.
 */
const MAX_SEGMENTS = 4;

/**
 * The trail in the header. It draws crumbs and decides nothing: which crumbs a
 * route has is the caller's business (`readerCrumbs` for an entry, the shell's
 * own for a board or a list), so one component serves every view.
 *
 * The last crumb is where you are and does nothing; the rest go somewhere.
 */
export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        const look = "max-w-[260px] truncate rounded-md px-1.5 py-0.5";
        return (
          <span key={i} className="flex min-w-0 items-center gap-1.5">
            <span className="text-line-2 shrink-0" aria-hidden>
              /
            </span>
            {last || (!c.to && !c.onClick) ? (
              <span className={`${look} ${last ? "text-fg" : "text-faint"}`} title={c.title}>
                {c.label}
              </span>
            ) : c.to ? (
              <Link to={c.to} className={`${look} text-muted hover:bg-fg/5 hover:text-fg`} title={c.title}>
                {c.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={c.onClick}
                className={`${look} text-muted hover:bg-fg/5 hover:text-fg`}
                title={c.title}
              >
                {c.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/**
 * The trail to a bundle path: each folder on the way, then the entry.
 *
 * Names are made readable the way the tree makes them, folders included. You
 * navigated to a file, so the last crumb says which file; what the entry calls
 * itself belongs on the entry. The raw name stays in the URL and the tooltip,
 * where it is the identity rather than a label.
 *
 * The bundle itself is not a crumb: the logo beside the trail already says it.
 */
export function readerCrumbs(root: TreeNode, path: string): Crumb[] {
  const segments = path.replace(/^\//, "").split("/").filter(Boolean);
  const crumb = (index: number): Crumb => {
    const at = upTo(segments, index);
    const name = segments[index]!;
    const label = find(root, at)?.label ?? name;
    return index === segments.length - 1
      ? { label, title: name }
      : { label, to: "/wiki" + at + "/", title: name };
  };

  if (segments.length <= MAX_SEGMENTS) return segments.map((_, i) => crumb(i));
  // Collapsed segments. A dropdown listing them is the next step; the ellipsis
  // carries the fact that something is hidden either way.
  return [
    crumb(0),
    { label: "…", title: segments.join("/") },
    crumb(segments.length - 2),
    crumb(segments.length - 1),
  ];
}

/** The bundle path formed by the first `index + 1` segments. */
function upTo(segments: string[], index: number): string {
  return "/" + segments.slice(0, index + 1).join("/");
}
